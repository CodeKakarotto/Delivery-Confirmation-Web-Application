import { useEffect, useState } from 'react';

/** Every list in the app shows 10 items, then "Previous / Next" pages, so nobody has to scroll a long list. */
export const PAGE_SIZE = 10;

/** The items on one page (pages count from 1). */
export function pageOf<T>(items: readonly T[], page: number, size = PAGE_SIZE): T[] {
  return items.slice((page - 1) * size, page * size);
}

/**
 * Page state for a list that is already fully loaded (e.g. a day's awaiting orders). Goes back to page 1 when `resetKey`
 * changes, and never points past the last page when the list gets shorter (an order was just confirmed).
 */
export function useLocalPage(total: number, resetKey: unknown, size = PAGE_SIZE): [number, (p: number) => void] {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const last = Math.max(1, Math.ceil(total / size));
  return [Math.min(page, last), setPage];
}
