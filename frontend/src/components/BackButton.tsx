import { useNavigate } from 'react-router';

/**
 * "← Back": returns to the previous screen inside the app (keeping its place, e.g. the open day and page), or to
 * `fallback` when the screen was opened directly (or always, with `always`).
 */
export function BackButton({ fallback, label = 'Back', always = false }: { fallback: string; label?: string; always?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="btn btn-ghost back-btn no-print"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0 && !always) navigate(-1);
        else navigate(fallback);
      }}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
