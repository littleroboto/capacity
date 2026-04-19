import type { ViewModeId } from '@/lib/constants';
import type {
  MarketActivityLedger,
  MarketActivityLedgerEntry,
  MarketActivityLensHint,
} from '@/lib/marketActivityLedger';
import { ledgerEntryToIsoDays } from '@/lib/marketActivityLedger';

const LENS_FOR_VIEW: Record<Exclude<ViewModeId, 'code'>, MarketActivityLensHint> = {
  combined: 'combined',
  in_store: 'in_store',
  market_risk: 'market_risk',
};

/** Whether a ledger row should paint the footprint on this runway lens (hints first, then affects). */
export function ledgerEntryRelevantToLens(entry: MarketActivityLedgerEntry, lensView: Exclude<ViewModeId, 'code'>): boolean {
  const hint = LENS_FOR_VIEW[lensView];
  if (entry.lensHints.includes(hint)) return true;
  if (lensView === 'combined') return entry.affects.techDelivery || entry.affects.calendar;
  if (lensView === 'in_store') return entry.affects.opsTrading || entry.affects.coverage || entry.affects.calendar;
  return entry.affects.risk;
}

export function ledgerAttributionNeutralFillHex(): string {
  return '#d4d4d8';
}

/** Heatmap / SVG cells: ledger mode with overlap 0 (neutral “empty” day) use this × base opacity to sit visually behind contributing days. */
export const LEDGER_EMPTY_DAY_OPACITY_FACTOR = 0.38;

/**
 * Ledger entry ids whose span includes `dayYmd` and that count for this lens (same rules as the overlap map).
 */
export function ledgerEntryIdsContributingToDay(
  ledger: MarketActivityLedger,
  dayYmd: string,
  lensView: Exclude<ViewModeId, 'code'>,
  options?: { maxDaysPerEntry?: number },
): string[] {
  const maxDays = options?.maxDaysPerEntry ?? 500;
  const out: string[] = [];
  for (const e of ledger.entries) {
    if (!ledgerEntryRelevantToLens(e, lensView)) continue;
    for (const d of ledgerEntryToIsoDays(e, maxDays)) {
      if (d === dayYmd) {
        out.push(e.entryId);
        break;
      }
    }
  }
  return out;
}

/**
 * Raw overlap N counts active YAML ledger rows spanning a calendar day. Map that to the footprint count
 * used for heatmap attribution (neutral gray vs model fill, multi-hit badge).
 *
 * When `includeImplicitBaseline` is true, N = 0 is treated as one notional **baseline stratum** (always-on
 * trading rhythm, tech cadence, and calendar from the rest of the model YAML — not duplicated as table rows).
 * N ≥ 1 is unchanged so named activities are never double-counted in overlap depth.
 */
export function effectiveLedgerFootprintOverlap(
  rawOverlap: number,
  includeImplicitBaseline: boolean,
): number {
  const n = Math.max(0, Math.floor(rawOverlap));
  if (n > 0) return n;
  return includeImplicitBaseline ? 1 : 0;
}

/** Largest raw overlap count in the map (at least 1 for stable scaling). */
export function maxRawLedgerOverlapInMap(m: ReadonlyMap<string, number>): number {
  let mx = 0;
  for (const v of m.values()) mx = Math.max(mx, v);
  return Math.max(1, mx);
}

/**
 * How much hotter the heatmap metric is allowed to read on days with the deepest ledger stack in the strip
 * (1 = no boost; only applies when raw max overlap in the strip is greater than 1).
 */
export const LEDGER_OVERLAP_METRIC_BOOST = 0.42;

/**
 * Ledger heatmap driver: same lens metric as the runway, scaled up when more enabled ledger rows overlap
 * the day (normalized to the max raw stack in this strip so single-activity days stay honest).
 *
 * Returns `null` when there is no ledger footprint → caller should paint {@link ledgerAttributionNeutralFillHex}.
 * Implicit-baseline days (`rawOverlap` 0, effective footprint on) return the base metric unchanged.
 */
export function ledgerAttributionHeatmapMetric(
  baseMetric: number | undefined,
  rawOverlap: number,
  effectiveOverlap: number,
  rawMaxAcrossStrip: number,
): number | null {
  if (effectiveOverlap <= 0) return null;
  const m = Math.min(1, Math.max(0, baseMetric ?? 0));
  if (rawOverlap <= 0) return m;
  const maxR = Math.max(1, Math.floor(rawMaxAcrossStrip));
  if (maxR <= 1) return m;
  const span = maxR - 1;
  const k = Math.max(1, Math.floor(rawOverlap));
  const boost = 1 + LEDGER_OVERLAP_METRIC_BOOST * Math.min(span, k - 1) / span;
  return Math.min(1, m * boost);
}

export function buildLedgerLensOverlapMap(
  ledger: MarketActivityLedger,
  selectedEntryIds: readonly string[],
  lensView: Exclude<ViewModeId, 'code'>,
  options?: { maxDaysPerEntry?: number },
): Map<string, number> {
  const maxDays = options?.maxDaysPerEntry ?? 500;
  const map = new Map<string, number>();
  for (const id of selectedEntryIds) {
    const e = ledger.entries.find((x) => x.entryId === id);
    if (!e || !ledgerEntryRelevantToLens(e, lensView)) continue;
    for (const d of ledgerEntryToIsoDays(e, maxDays)) {
      map.set(d, (map.get(d) ?? 0) + 1);
    }
  }
  return map;
}

export type LedgerMiniChartBand = { i0: number; i1: number };

/** Every ledger `entryId` that is not excluded (empty exclusions ⇒ all rows contribute). */
export function activeLedgerEntryIds(
  ledger: MarketActivityLedger,
  excludedEntryIds: readonly string[],
): string[] {
  if (!ledger.entries.length) return [];
  const ex = new Set(excludedEntryIds);
  return ledger.entries.map((e) => e.entryId).filter((id) => !ex.has(id));
}

/**
 * Map each selected ledger span to fractional mini-chart indices [0, n-1] for vertical band shading.
 * Uses per-day index for span endpoints (clamped to visible series).
 */
export function ledgerBandsForMiniChart(
  ledger: MarketActivityLedger,
  selectedEntryIds: readonly string[],
  lensView: Exclude<ViewModeId, 'code'>,
  indexForDay: (ymd: string) => number | null,
): LedgerMiniChartBand[] {
  const bands: LedgerMiniChartBand[] = [];
  for (const id of selectedEntryIds) {
    const e = ledger.entries.find((x) => x.entryId === id);
    if (!e || !ledgerEntryRelevantToLens(e, lensView)) continue;
    const i0 = indexForDay(e.dateStart);
    const i1 = indexForDay(e.dateEnd);
    if (i0 == null && i1 == null) continue;
    const a = i0 ?? i1!;
    const b = i1 ?? i0!;
    bands.push({ i0: Math.min(a, b), i1: Math.max(a, b) });
  }
  return bands;
}
