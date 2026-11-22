import { Link } from 'react-router';
import { OUTCOME_LABELS, type DailyReport, type DailyReportRow } from '../../../shared/types.ts';
import { fullDayLabel } from '../lib/calendar.ts';
import { shopTime } from '../lib/time.ts';
import { PAGE_SIZE, useLocalPage } from '../lib/paging.ts';
import { Pager } from './ConfirmationRows.tsx';

const STATUS: Record<DailyReportRow['status'], { label: string; tag: string }> = {
  delivered: { label: 'Delivered to recipient', tag: 'tag-ok' },
  exception: { label: 'Exception', tag: 'tag-warn' },
  awaiting: { label: 'Awaiting', tag: 'tag-quiet' },
  missing: { label: 'Missing', tag: 'tag-not-verified' },
  cancelled: { label: 'Cancelled', tag: 'tag-status-cancelled' },
};

/** The end-of-day report: the day's totals and one line per order (on screen and on paper). */
export function DailyReportTable({ report: r, timeZone }: { report: DailyReport; timeZone?: string }) {
  const notDone = r.isPast ? 'Missing' : 'Awaiting';
  const [page, setPage] = useLocalPage(r.rows.length, r.date);
  const first = (page - 1) * PAGE_SIZE;
  return (
    <>
      <h2 className="report-day">{fullDayLabel(r.date)}</h2>
      <div className="figures report-figures">
        <div className="figure">
          <span className="figure-value">{r.totals.scheduled}</span>
          <span className="figure-label">Scheduled</span>
        </div>
        <div className="figure figure-ok">
          <span className="figure-value">{r.totals.delivered}</span>
          <span className="figure-label">Delivered</span>
        </div>
        <div className={`figure${r.totals.exceptions ? ' figure-warn' : ''}`}>
          <span className="figure-value">{r.totals.exceptions}</span>
          <span className="figure-label">Exceptions</span>
        </div>
        <div className={`figure${r.totals.awaiting && r.isPast ? ' figure-error' : ''}`}>
          <span className="figure-value">{r.totals.awaiting}</span>
          <span className="figure-label">{notDone}</span>
        </div>
      </div>
      {r.rows.length === 0 ? (
        <p className="muted">No orders were scheduled for this day.</p>
      ) : (
        <table className="table report-table">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Order</th>
              <th scope="col">Recipient</th>
              <th scope="col">Result</th>
              <th scope="col">Received by</th>
              <th scope="col">Time</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => {
              const s = STATUS[row.status];
              // Rows of other pages stay in the table (hidden on screen) so a printout always has the whole day.
              const onPage = i >= first && i < first + PAGE_SIZE;
              return (
                <tr key={row.orderId} className={onPage ? undefined : 'report-row-off'}>
                  <td data-label="#" className="num">
                    {row.stopNumber ?? '—'}
                  </td>
                  <td data-label="Order">
                    {row.confirmationId || row.voidedConfirmationId ? (
                      <Link to={`/shop/confirmations/${row.confirmationId ?? row.voidedConfirmationId}`} className="cell-strong">
                        {row.orderId}
                      </Link>
                    ) : (
                      <Link to={`/shop/orders/${encodeURIComponent(row.orderId)}`} className="cell-strong">
                        {row.orderId}
                      </Link>
                    )}
                    <span className="cell-sub">Zone {row.zone ?? '—'}</span>
                  </td>
                  <td data-label="Recipient">
                    {row.recipientName ?? '—'}
                    <span className="cell-sub">{row.city}</span>
                  </td>
                  <td data-label="Result">
                    <span className={`tag ${s.tag}`}>{row.status === 'exception' && row.outcome ? OUTCOME_LABELS[row.outcome] : s.label}</span>
                  </td>
                  <td data-label="Received by">{row.receivedBy ?? '—'}</td>
                  <td data-label="Time">{row.confirmedAt ? shopTime(row.confirmedAt, timeZone).replace(/\s[A-Z]{2,4}$/, '') : '—'}</td>
                  <td data-label="Notes">
                    {row.outcomeDetail && <span className="report-note">{row.outcomeDetail}</span>}
                    <span className="row-tags">
                      {row.source === 'paper' && <span className="tag tag-demo">Paper</span>}
                      {row.voidedConfirmationId && <span className="tag tag-not-verified">Voided</span>}
                      {row.changed && <span className="tag tag-warn">Changed</span>}
                      {row.flagged && <span className="tag tag-not-verified">Flagged</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="no-print">
        <Pager page={page} total={r.rows.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </>
  );
}
