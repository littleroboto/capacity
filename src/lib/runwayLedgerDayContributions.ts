import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type { MarketActivityLedger, MarketActivityLedgerEntry } from '@/lib/marketActivityLedger';
import { ledgerEntryRelevantToLens } from '@/lib/runwayLedgerAttribution';
import { heatmapCellMetric } from '@/lib/runwayViewMetrics';

export type RunwayLedgerLensAxis = 'combined' | 'in_store' | 'market_risk';

/** Calendar day falls in the ledger row span and the row is not excluded. */
export function ledgerEntryActiveOnDay(
  e: MarketActivityLedgerEntry,
  dayYmd: string,
  excluded: ReadonlySet<string>,
): boolean {
  if (excluded.has(e.entryId)) return false;
  return dayYmd >= e.dateStart && dayYmd <= e.dateEnd;
}

export function entryTouchesLensOnDay(
  e: MarketActivityLedgerEntry,
  dayYmd: string,
  lens: RunwayLedgerLensAxis,
  excluded: ReadonlySet<string>,
): boolean {
  return ledgerEntryActiveOnDay(e, dayYmd, excluded) && ledgerEntryRelevantToLens(e, lens);
}

export type DayLensContributionContext = {
  dayYmd: string;
  excluded: ReadonlySet<string>;
  nTau: number;
  nRho: number;
  nSigma: number;
  vTau: number;
  vRho: number;
  vSigma: number;
};

export function buildDayLensContributionContext(
  ledger: MarketActivityLedger,
  dayYmd: string,
  excluded: ReadonlySet<string>,
  riskRow: RiskRow,
  tuning: RiskModelTuning,
): DayLensContributionContext {
  let nTau = 0;
  let nRho = 0;
  let nSigma = 0;
  for (const e of ledger.entries) {
    if (entryTouchesLensOnDay(e, dayYmd, 'combined', excluded)) nTau += 1;
    if (entryTouchesLensOnDay(e, dayYmd, 'in_store', excluded)) nRho += 1;
    if (entryTouchesLensOnDay(e, dayYmd, 'market_risk', excluded)) nSigma += 1;
  }
  return {
    dayYmd,
    excluded,
    nTau,
    nRho,
    nSigma,
    vTau: heatmapCellMetric(riskRow, 'combined', tuning),
    vRho: heatmapCellMetric(riskRow, 'in_store', tuning),
    vSigma: heatmapCellMetric(riskRow, 'market_risk', tuning),
  };
}

export type DayContributionTriple = { tau: number | null; rho: number | null; sigma: number | null };

/**
 * Equal-share allocation of each lens heat-map value across active ledger rows that touch `dayYmd`
 * for that lens. This is **documentation / UX** (see ledger module), not engine marginal attribution.
 */
export function contributionTripleForEntry(
  entry: MarketActivityLedgerEntry,
  ctx: DayLensContributionContext,
): DayContributionTriple {
  const { dayYmd, excluded, nTau, nRho, nSigma, vTau, vRho, vSigma } = ctx;
  return {
    tau: entryTouchesLensOnDay(entry, dayYmd, 'combined', excluded) && nTau > 0 ? vTau / nTau : null,
    rho: entryTouchesLensOnDay(entry, dayYmd, 'in_store', excluded) && nRho > 0 ? vRho / nRho : null,
    sigma: entryTouchesLensOnDay(entry, dayYmd, 'market_risk', excluded) && nSigma > 0 ? vSigma / nSigma : null,
  };
}

/** Ledger rows that touch the day on at least one runway lens (respecting exclusions). */
export function unionLedgerContributorIdsForDay(
  ledger: MarketActivityLedger,
  dayYmd: string,
  excluded: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const e of ledger.entries) {
    if (!ledgerEntryActiveOnDay(e, dayYmd, excluded)) continue;
    if (
      ledgerEntryRelevantToLens(e, 'combined') ||
      ledgerEntryRelevantToLens(e, 'in_store') ||
      ledgerEntryRelevantToLens(e, 'market_risk')
    ) {
      ids.add(e.entryId);
    }
  }
  return ids;
}
