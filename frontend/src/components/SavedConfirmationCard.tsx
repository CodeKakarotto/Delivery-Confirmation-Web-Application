import { OUTCOME_LABELS, type ConfirmationResult, type DeliveryOutcome, type DriverDelivery } from '../../../shared/types.ts';
import { localDateTime } from '../lib/time.ts';
import { DeliveryCard } from './DeliveryCard.tsx';
import { ResultTag } from './ui.tsx';

/** A saved confirmation in the required field order (employee detail view and printout). */
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
}: {
  delivery: DriverDelivery;
  outcome: DeliveryOutcome;
  outcomeDetail: string | null;
  note: string | null;
  receivedBy: string;
  signatureSrc: string;
  signatureWidth?: number;
  signatureHeight?: number;
  result: ConfirmationResult;
  confirmedAt: string;
}) {
  return (
    <DeliveryCard
      delivery={delivery}
      exception={
        <div className={`saved-exception${result === 'confirmed' ? '' : ' is-exception'}`}>
          <p className="deliver-exception-title">Delivery Exception</p>
          <p className="saved-exception-value">{OUTCOME_LABELS[outcome]}</p>
          {outcomeDetail && <p className="saved-exception-detail">{outcomeDetail}</p>}
          <ResultTag result={result} />
        </div>
      }
      receivedBy={<p className="saved-value">{receivedBy}</p>}
      signature={
        <div className="signature-saved">
          <img src={signatureSrc} width={signatureWidth} height={signatureHeight} alt={`Customer signature, received by ${receivedBy}`} />
        </div>
      }
      footer={
        <dl className="dc-meta">
          <div>
            <dt>Confirmed</dt>
            <dd>
              <time dateTime={confirmedAt}>{localDateTime(confirmedAt)}</time>
              <span className="muted small"> (server time)</span>
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
