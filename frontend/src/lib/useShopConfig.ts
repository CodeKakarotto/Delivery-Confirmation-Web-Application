import { useEffect, useState } from 'react';
import { DEFAULT_SHOP_TIME_ZONE } from '../../../shared/shopTime.ts';
import type { AppConfig } from '../../../shared/types.ts';
import { configApi } from '../api/endpoints.ts';

type Config = AppConfig & { dataAvailable: boolean };
let pending: Promise<Config> | null = null;

/** The server's public configuration (no customer data), loaded once per page load. */
export function useShopConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    let current = true;
    (pending ??= configApi.get())
      .then((c) => current && setConfig(c))
      .catch(() => {
        pending = null;
      });
    return () => {
      current = false;
    };
  }, []);
  return config;
}

/** The shop's time zone, or the default until the configuration has loaded. */
export function useShopTimeZone(): string {
  return useShopConfig()?.timeZone ?? DEFAULT_SHOP_TIME_ZONE;
}
