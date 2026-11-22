import type { SearchField } from '../../../shared/types.ts';

export const SEARCH_FIELDS: readonly SearchField[] = ['all', 'order', 'name', 'address'];

const columnsFor = (field: Exclude<SearchField, 'all'>, orderIdColumn: string) =>
  field === 'order' ? [orderIdColumn] : field === 'name' ? ['d.recipient_name'] : ['d.address_line', 'd.city', 'd.postal_code'];

/**
 * A text search over orders (table alias `d`): it matches part of the order ID, the recipient's name or the address
 * (street, city or ZIP code). `field` says which of those comes first in the results: matches in that field, then the
 * rest ("all" = no preference). The text is always bound, never put into the SQL, with LIKE wildcards escaped.
 */
export function searchClause(field: SearchField, text: string, orderIdColumn = 'd.order_id') {
  const like = `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const any = (cols: string[]) => `(${cols.map((c) => `${c} LIKE ? ESCAPE '!'`).join(' OR ')})`;
  const all = [...columnsFor('order', orderIdColumn), ...columnsFor('name', orderIdColumn), ...columnsFor('address', orderIdColumn)];
  const first = field === 'all' ? [] : columnsFor(field, orderIdColumn);
  return {
    /** WHERE part: a match in any of the fields. */
    where: { sql: any(all), binds: all.map(() => like) },
    /** ORDER BY part (0 = a match in the chosen field, 1 = elsewhere); null with no preference. */
    rank: first.length ? { sql: `CASE WHEN ${any(first)} THEN 0 ELSE 1 END`, binds: first.map(() => like) } : null,
  };
}
