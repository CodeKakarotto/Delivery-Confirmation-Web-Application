import { useSearchParams } from 'react-router';
import { addDays, localDateKey } from '../../../shared/shopTime.ts';
import { errorMessage } from '../api/client.ts';
import { dashboardApi } from '../api/endpoints.ts';
import { DailyReportTable } from '../components/DailyReportTable.tsx';
import { Brand } from '../components/Layout.tsx';
import { Notice, Spinner } from '../components/ui.tsx';
import { useApi } from '../lib/useApi.ts';
import { useShopConfig, useShopTimeZone } from '../lib/useShopConfig.ts';
import { shopDateTime } from '../lib/time.ts';

/**
 * The end-of-day report: every order of the day with its result, and the day's totals. Print it or download it for
 * Excel at the end of each day, so there is always a copy outside the app.
 */
export function ShopReportPage() {
  const timeZone = useShopTimeZone();
  useShopConfig();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), timeZone);
  const date = params.get('date') || today;
  const report = useApi(() => dashboardApi.report(date), [date], { live: true });
  const go = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  return (
    <div className="report-page">
      <div className="print-only print-header">
        <Brand subtitle="End-of-day delivery report" />
        <p className="print-note">Printed {shopDateTime(new Date().toISOString(), timeZone)} from the confirmation database.</p>
      </div>
      <div className="page-head no-print">
        <h1>End-of-day report</h1>
        <div className="actions">
          <a className="btn" href={dashboardApi.reportCsvUrl(date)} download>
            Download for Excel
          </a>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!report.data}>
            Print
          </button>
        </div>
      </div>
      <div className="day-stepper no-print">
        <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="btn btn-ghost month-cal-nav" aria-label="Next day" onClick={() => go(addDays(date, 1))} disabled={date >= today}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {date !== today && (
          <button type="button" className="btn btn-small" onClick={() => go(today)}>
            Today
          </button>
        )}
        <span className="muted small">Tip: print or download this at the end of each day, so there is always a copy outside the app.</span>
      </div>
      <section className="card report-card" aria-label="Report">
        {report.error ? (
          <Notice tone="error" title="Could not load the report" action={<button type="button" className="btn btn-small" onClick={report.reload}>Try again</button>}>
            {errorMessage(report.error)}
          </Notice>
        ) : !report.data ? (
          <Spinner label="Loading the report" />
        ) : (
          <DailyReportTable report={report.data} timeZone={timeZone} />
        )}
      </section>
    </div>
  );
}
