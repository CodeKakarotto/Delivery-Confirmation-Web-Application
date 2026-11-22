import { highlightParts } from './SearchSuggest.tsx';

/**
 * Text with the part that matches the search shown bold, in color, on a soft highlight (so it is clear why a result
 * matched). With no search text, the text is shown as it is.
 */
export function Match({ text, q }: { text: string; q?: string }) {
  if (!q?.trim()) return <>{text}</>;
  const p = highlightParts(text, q);
  if (!p.match) return <>{text}</>;
  return (
    <>
      {p.before}
      <mark className="match">{p.match}</mark>
      {p.after}
    </>
  );
}
