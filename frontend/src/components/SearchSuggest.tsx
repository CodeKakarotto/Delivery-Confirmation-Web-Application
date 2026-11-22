import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

/** One suggestion under a search box: the order ID, a short detail line, an optional status tag, where it opens. */
export interface Suggestion {
  key: string;
  label: string;
  detail?: string;
  tag?: { text: string; tone: 'ok' | 'warn' | 'quiet' | 'bad' };
  to: string;
}

/** How many suggestions show at once. */
export const MAX_SUGGESTIONS = 6;

/** Case-insensitive "contains", used to filter and to highlight. */
export function matchesQuery(text: string | null | undefined, q: string): boolean {
  return Boolean(text && q.trim() && text.toLowerCase().includes(q.trim().toLowerCase()));
}

/** Splits text around the first match of q, so the matching letters can be highlighted. */
export function highlightParts(text: string, q: string): { before: string; match: string; after: string } {
  const needle = q.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return { before: text, match: '', after: '' };
  return { before: text.slice(0, at), match: text.slice(at, at + needle.length), after: text.slice(at + needle.length) };
}

function Highlighted({ text, q }: { text: string; q: string }) {
  const p = highlightParts(text, q);
  return (
    <>
      {p.before}
      {p.match && <mark>{p.match}</mark>}
      {p.after}
    </>
  );
}

const TAG_CLASS = { ok: 'tag-ok', warn: 'tag-warn', quiet: 'tag-quiet', bad: 'tag-not-verified' } as const;

/**
 * A search box with suggestions as you type (an ARIA combobox): up to 6 matches under the box, the typed letters
 * highlighted. Arrow keys move, Enter opens the highlighted one (otherwise the form submits as before), Escape closes.
 */
export function SearchSuggest({
  value,
  onChange,
  getSuggestions,
  onPick,
  inputProps,
  minChars = 1,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Suggestions for the typed text (may be async; late answers for older text are ignored). */
  getSuggestions: (q: string) => Promise<Suggestion[]> | Suggestion[];
  onPick: (s: Suggestion) => void;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'role'>;
  minChars?: number;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState('');
  const listId = useId();
  const latest = useRef('');
  const getRef = useRef(getSuggestions);
  getRef.current = getSuggestions;

  useEffect(() => {
    const q = value.trim();
    latest.current = q;
    if (q.length < minChars) {
      setItems([]);
      setSearched('');
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const found = (await getRef.current(q)).slice(0, MAX_SUGGESTIONS);
        if (latest.current !== q) return;
        setItems(found);
        setSearched(q);
        setActive(-1);
      } catch {
        if (latest.current === q) setItems([]);
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [value, minChars]);

  const show = open && value.trim().length >= minChars && searched === value.trim();
  const pick = (s: Suggestion) => {
    setOpen(false);
    onPick(s);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && show && active >= 0 && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="suggest">
      <input
        {...inputProps}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul id={listId} role="listbox" className="suggest-list" aria-label="Suggestions">
          {items.length === 0 ? (
            <li className="suggest-empty" role="presentation">
              No matching orders
            </li>
          ) : (
            items.map((s, i) => (
              <li
                key={s.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="suggest-item"
                // Keep focus in the box so the click lands before the list closes.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                <span className="suggest-main">
                  <span className="suggest-label">
                    <Highlighted text={s.label} q={value} />
                  </span>
                  {s.detail && (
                    <span className="suggest-detail">
                      <Highlighted text={s.detail} q={value} />
                    </span>
                  )}
                </span>
                {s.tag && <span className={`tag ${TAG_CLASS[s.tag.tone]}`}>{s.tag.text}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
