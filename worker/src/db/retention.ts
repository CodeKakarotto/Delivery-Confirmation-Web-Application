import { addDays } from '../../../shared/shopTime.ts';

/** How long delivery records are kept (days, today included): the shop's database holds the last 30 days only. */
export const DEFAULT_RETENTION_DAYS = 30;

/** The oldest delivery day still kept: with 30 days, today and the 29 days before it. */
export function retentionCutoff(today: string, days: number): string {
  return addDays(today, -(days - 1));
}

/**
 * The statements that delete every delivery scheduled before `cutoff` (YYYY-MM-DD), with everything that belongs to it:
 * its confirmations (signatures and slip photos are stored in them), their correction history and flagged attempts.
 * Children first, because a confirmation keeps its order from being deleted.
 */
export function retentionSql(cutoff: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error(`Invalid cutoff date: ${cutoff}`);
  const old = `SELECT c.id FROM delivery_confirmations c JOIN deliveries d ON d.id = c.delivery_id WHERE d.delivery_date < '${cutoff}'`;
  return [
    `DELETE FROM confirmation_attempts WHERE confirmation_id IN (${old})`,
    `DELETE FROM confirmation_corrections WHERE confirmation_id IN (${old})`,
    `DELETE FROM delivery_confirmations WHERE delivery_id IN (SELECT id FROM deliveries WHERE delivery_date < '${cutoff}')`,
    `DELETE FROM deliveries WHERE delivery_date < '${cutoff}'`,
  ];
}
