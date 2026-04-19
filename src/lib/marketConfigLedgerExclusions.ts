import type { MarketConfig } from '@/engine/types';
import type { MarketActivityLedger, MarketActivityLedgerEntry } from '@/lib/marketActivityLedger';
import { ledgerEntryToIsoDays } from '@/lib/marketActivityLedger';

function readConfigSliceIndex(e: MarketActivityLedgerEntry): number | null {
  const raw = e.metadata?.configSliceIndex;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Clone `config` and remove YAML entities that correspond to excluded ledger rows for this market.
 * Used to build a counterfactual {@link MarketConfig} slice before {@link runPipeline}.
 */
export function applyLedgerExclusionsToMarketConfig(
  config: MarketConfig,
  ledger: MarketActivityLedger,
  excluded: ReadonlySet<string>,
): MarketConfig {
  const hits = ledger.entries.filter((e) => e.market === config.market && excluded.has(e.entryId));
  if (!hits.length) return config;

  const next: MarketConfig = structuredClone(config);

  const rmCampaign = new Set<number>();
  const rmTech = new Set<number>();
  const rmLeave = new Set<number>();
  const rmEv = new Set<number>();
  const rmBl = new Set<number>();
  const rmWin = new Set<number>();
  const rmPublic = new Set<string>();
  const rmSchoolDays = new Set<string>();

  for (const e of hits) {
    switch (e.entityKind) {
      case 'campaign': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmCampaign.add(i);
        break;
      }
      case 'tech_programme': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmTech.add(i);
        break;
      }
      case 'national_leave_band': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmLeave.add(i);
        break;
      }
      case 'deployment_risk_event': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmEv.add(i);
        break;
      }
      case 'deployment_risk_blackout': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmBl.add(i);
        break;
      }
      case 'operating_window': {
        const i = readConfigSliceIndex(e);
        if (i != null) rmWin.add(i);
        break;
      }
      case 'public_holiday_date':
        rmPublic.add(e.dateStart.trim());
        break;
      case 'school_holiday_date':
        for (const d of ledgerEntryToIsoDays(e, 800)) rmSchoolDays.add(d);
        break;
      default:
        break;
    }
  }

  if (rmCampaign.size) {
    next.campaigns = next.campaigns.filter((_, i) => !rmCampaign.has(i));
  }
  if (rmTech.size) {
    next.techProgrammes = next.techProgrammes.filter((_, i) => !rmTech.has(i));
  }
  if (rmLeave.size && next.nationalLeaveBands?.length) {
    next.nationalLeaveBands = next.nationalLeaveBands.filter((_, i) => !rmLeave.has(i));
  }
  if (rmEv.size && next.deployment_risk_events?.length) {
    next.deployment_risk_events = next.deployment_risk_events.filter((_, i) => !rmEv.has(i));
  }
  if (rmBl.size && next.deployment_risk_blackouts?.length) {
    next.deployment_risk_blackouts = next.deployment_risk_blackouts.filter((_, i) => !rmBl.has(i));
  }
  if (rmWin.size && next.operatingWindows?.length) {
    next.operatingWindows = next.operatingWindows.filter((_, i) => !rmWin.has(i));
  }
  if (rmPublic.size && next.publicHolidayExtraDates?.length) {
    next.publicHolidayExtraDates = next.publicHolidayExtraDates.filter((d) => !rmPublic.has(d.trim()));
  }
  if (rmSchoolDays.size && next.schoolHolidayExtraDates?.length) {
    next.schoolHolidayExtraDates = next.schoolHolidayExtraDates.filter((d) => !rmSchoolDays.has(d.trim()));
  }

  return next;
}
