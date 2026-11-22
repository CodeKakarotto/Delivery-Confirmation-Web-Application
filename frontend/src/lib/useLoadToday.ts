import { useCallback } from 'react';
import type { DriverDelivery } from '../../../shared/types.ts';
import { driverApi } from '../api/endpoints.ts';
import { useOffline } from './offline.tsx';

/**
 * Drivers: today's deliveries still to deliver, with their addresses. Uses the copy kept on the phone (so searching
 * works with no signal); if there is none yet, fetches it once and keeps it.
 */
export function useLoadToday(): () => Promise<DriverDelivery[]> {
  const offline = useOffline();
  return useCallback(async () => {
    const saved = await offline.listToday();
    if (saved.length) return saved;
    const fresh = (await driverApi.offline()).items;
    await offline.saveToday(fresh).catch(() => {});
    return fresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline.listToday, offline.saveToday]);
}
