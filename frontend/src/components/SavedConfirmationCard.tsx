import { OUTCOME_LABELS, type ConfirmationResult, type DeliveryOutcome, type DriverDelivery } from '../../../shared/types.ts';
import { shopDateTime } from '../lib/time.ts';
import { DeliveryCard } from './DeliveryCard.tsx';
import { ResultTag } from './ui.tsx';

/** A saved confirmation in the required field order (shop detail view and printout). */
export function SavedConfirmationCard({
  delivery,
  outcome,
  outcomeDetail,
  note,
  receivedBy,
  signatureSrc,
  signatureWidth = 600,
  signatureHeight = 200,
  result,
  confirmedAt,
  timeZone,
}: {
  delivery: DriverDelivery;
  outcome: DeliveryOutcome;
  outcomeDetail: string | null;
  note: string | null;
  receivedBy: string;
  /** null when no signature was taken (delivery exceptions). */
  signatureSrc: string | null;
  signatureWidth?: number;
  signatureHeight?: number;
  result: ConfirmationResult;
  confirmedAt: string;
  timeZone?: string;
}) {
  const recipient = outcome === 'delivered_to_recipient';
  return (
    <DeliveryCard
      delivery={delivery}
      exception={
        recipient ? (
          <div className="recipient-bubble is-active is-static">
            <svg className="recipient-bubble-check" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M4.5 10.5 8.5 14.5 15.5 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="recipient-bubble-text">{OUTCOME_LABELS.delivered_to_recipient}</span>
          </div>
        ) : (
          <div className="deliver-exception saved-exception is-exception">
            <p className="deliver-exception-title">Delivery Exception</p>
            <p className="saved-exception-value">{OUTCOME_LABELS[outcome]}</p>
            {outcomeDetail && <p className="saved-exception-detail">{outcomeDetail}</p>}
            <ResultTag result={result} />
          </div>
        )
      }
      receivedBy={<p className="saved-value">{receivedBy}</p>}
      signature={
        signatureSrc === null ? null : (
        <div className="signature-saved">
          <img src={signatureSrc} width={signatureWidth} height={signatureHeight} alt={`Customer signature, received by ${receivedBy}`} />
        </div>
        )
      }
      footer={
        <dl className="dc-meta">
          <div>
            <dt>Delivery time</dt>
            <dd>
              <time dateTime={confirmedAt}>{shopDateTime(confirmedAt, timeZone)}</time>
              <span className="muted small"> (recorded by the server)</span>
            </dd>
          </div>
          {note && (
            <div>
              <dt>Driver note</dt>
              <dd>{note}</dd>
            </div>
          )}
        </dl>
      }
    />
  );
}
