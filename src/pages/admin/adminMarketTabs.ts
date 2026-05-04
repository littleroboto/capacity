/**
 * Canonical admin market detail sections — URL segment `entity` must match a `key`.
 */
export const ADMIN_MARKET_ENTITY_TABS = [
  { key: 'campaigns', label: 'Campaigns', table: 'campaign_configs' },
  { key: 'resources', label: 'Resources', table: 'resource_configs' },
  { key: 'bau', label: 'BAU', table: 'bau_configs' },
  { key: 'trading', label: 'Trading', table: 'trading_configs' },
  { key: 'holidays', label: 'Holidays', table: 'holiday_calendars' },
  { key: 'leave', label: 'Leave Bands', table: 'national_leave_band_configs' },
  { key: 'risk', label: 'Deploy Risk', table: 'deployment_risk_configs' },
  { key: 'tech', label: 'Tech Programmes', table: 'tech_programme_configs' },
  { key: 'windows', label: 'Op. Windows', table: 'operating_window_configs' },
  { key: 'build', label: 'Build & Publish', table: '' },
  { key: 'yaml', label: 'Expert YAML', table: '' },
  { key: 'audit', label: 'Audit Log', table: '' },
] as const;

export type AdminMarketEntityKey = (typeof ADMIN_MARKET_ENTITY_TABS)[number]['key'];

export const DEFAULT_ADMIN_MARKET_ENTITY: AdminMarketEntityKey = 'campaigns';

const KEY_SET = new Set<string>(ADMIN_MARKET_ENTITY_TABS.map((t) => t.key));

export function isAdminMarketEntityKey(s: string): s is AdminMarketEntityKey {
  return KEY_SET.has(s);
}

/** Path under /admin for a market + entity (id is not double-encoded here). */
export function adminMarketEntityPath(marketId: string, entity: AdminMarketEntityKey): string {
  return `/admin/market/${encodeURIComponent(marketId)}/${entity}`;
}
