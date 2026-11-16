import { Link, useParams } from 'react-router';
import { ApiRequestError, errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { BackButton } from '../components/BackButton.tsx';
import { DeliveryCard } from '../components/DeliveryCard.tsx';
import { Notice, ResultTag, Spinner } from '../components/ui.tsx';
import { fullDayLabel } from '../lib/calendar.ts';
import { shopDateTime } from '../lib/time.ts';
import { useApi } from '../lib/useApi.ts';
import { useShopTimeZone } from '../lib/useShopConfig.ts';

/** One order opened from the shop's awaiting list: its details and whether it has been confirmed. */
export function ShopOrderPage() {
  const { orderId = '' } = useParams();
  const order = useApi(() => dashboardApi.order(orderId), [orderId], { live: true });
  const timeZone = useShopTimeZone();
  const back = <BackButton fallback="/shop" />;

  if (order.error) {
    const notFound = order.error instanceof ApiRequestError && order.error.status === 404;
    return (
      <>
        {back}
        <Notice tone="error" title={notFound ? `Order ${orderId} was not found` : 'Could not load the order'}>
          {errorMessage(order.error)}
        </Notice>
      </>
    );
  }
  if (!order.data) {
    return (
      <>
        {back}
        <Spinner label="Loading the order" />
      </>
    );
  }
  const { status, delivery, confirmation, voidedConfirmations } = order.data;
  const statusTag =
    status === 'confirmed' ? (
      <ResultTag result={confirmation!.result} />
    ) : status === 'cancelled' ? (
      <span className="tag tag-status-cancelled">Cancelled</span>
    ) : (
      <span className="tag tag-warn">Awaiting confirmation</span>
    );

  return (
    <div className="detail-page">
      {back}
      <div className="page-head">
        <div>
          <h1>
            Order {delivery.orderId}
            <span className="h1-sub">{delivery.deliveryDate ? fullDayLabel(delivery.deliveryDate) : 'No delivery date'}</span>
          </h1>
          <div className="row-tags">{statusTag}</div>
        </div>
        <div className="actions">
          {confirmation && (
            <Link to={`/shop/confirmations/${confirmation.id}`} className="btn btn-primary">
              Open confirmation record
            </Link>
          )}
        </div>
      </div>
      {status === 'cancelled' && <Notice tone="warn" title="This order was cancelled">It cannot be confirmed.</Notice>}
      {confirmation && (
        <Notice tone="ok" title="Confirmed">
          Delivered {shopDateTime(confirmation.confirmedAt, timeZone)}.
        </Notice>
      )}
      {voidedConfirmations.length > 0 && (
        <Notice tone="info" title="Voided confirmations">
          <ul className="attempt-list">
            {voidedConfirmations.map((v) => (
              <li key={v.id}>
                <Link to={`/shop/confirmations/${v.id}`}>Saved {shopDateTime(v.confirmedAt, timeZone)}</Link>, voided {shopDateTime(v.voidedAt, timeZone)}: {v.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <DeliveryCard
        delivery={delivery}
        exception={<p className="muted small not-yet">{confirmation ? 'See the confirmation record.' : 'Not confirmed yet: the driver records it on delivery.'}</p>}
        receivedBy={<p className="muted">—</p>}
        signature={<p className="muted">{confirmation ? 'Saved with the confirmation record.' : 'No signature yet.'}</p>}
      />
    </div>
  );
}
