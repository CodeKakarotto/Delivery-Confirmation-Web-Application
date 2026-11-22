import type { SearchField } from '../../../shared/types.ts';

export const SEARCH_FIELDS: readonly SearchField[] = ['all', 'order', 'name', 'address'];

/**
 * A text search over orders (table alias `d`): part of the order ID, the recipient's name, or the address (street,
 * city or ZIP code), or all of them. The text is always bound, never put into the SQL, with LIKE wildcards escaped.
 */
export function searchClause(field: SearchField, text: string, orderIdColumn = 'd.order_id'): { sql: string; binds: string[] } {
  const like = `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const parts: Record<Exclude<SearchField, 'all'>, string[]> = {
    order: [orderIdColumn],
    name: ['d.recipient_name'],
    address: ['d.address_line', 'd.city', 'd.postal_code'],
  };
  const columns = field === 'all' ? [...parts.order, ...parts.name, ...parts.address] : parts[field];
  return {
    sql: `(${columns.map((c) => `${c} LIKE ? ESCAPE '!'`).join(' OR ')})`,
    binds: columns.map(() => like),
  };
}
