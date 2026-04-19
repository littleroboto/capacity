/**
 * Market activity ledger — **contributing rows** for market observability UI and runway highlights.
 *
 * Purpose:
 * - One **filterable table** of “what went into the model for this market” (v1: derived from parsed
 *   {@link MarketConfig}; later: augmented with pipeline **activity receipt** traces).
 * - Each row has a stable **highlight id** so selecting a row can mark runway days (`dateStart`…`dateEnd`
 *   inclusive) without implying double-counting in the engine (this module is **documentation / UX**, not
 *   the risk math).
 *
 * Versioning: bump {@link MARKET_ACTIVITY_LEDGER_SCHEMA_VERSION} when adding fields or changing id rules.
 */
import { parseDate } from '@/engine/calendar';
import type {
  CampaignConfig,
  DeploymentRiskBlackout,
  DeploymentRiskEvent,
  MarketConfig,
  NationalLeaveBand,
  OperatingWindow,
  TechProgrammeConfig,
} from '@/engine/types';
import { formatDateYmd } from '@/lib/weekRunway';

/** Schema version for persisted / API-serialised ledgers. */
export const MARKET_ACTIVITY_LEDGER_SCHEMA_VERSION = 1 as const;

/**
 * Primary attribution bucket for a row (receipt ordering). Keep **one family per row**; use
 * {@link MarketActivityAffects} only for lens / column hints.
 */
export type MarketActivityFamily =
  | 'commercial'
  | 'ops_trading'
  | 'tech_delivery'
  | 'coverage'
  | 'calendar'
  | 'risk_policy';

/** Fine-grained row kind (stable string union; extend for new YAML shapes). */
export type MarketActivityEntityKind =
  | 'campaign'
  | 'tech_programme'
  | 'national_leave_band'
  | 'public_holiday_date'
  | 'school_holiday_date'
  | 'deployment_risk_event'
  | 'deployment_risk_blackout'
  | 'operating_window';

/** Which runway lenses this row is most relevant to (UI hint only). */
export type MarketActivityLensHint = 'combined' | 'in_store' | 'market_risk';

export type MarketActivityAffects = {
  opsTrading: boolean;
  techDelivery: boolean;
  coverage: boolean;
  calendar: boolean;
  risk: boolean;
};

/** How this row sits in time (v1 is mostly `range`). */
export type MarketActivityTemporalKind = 'range' | 'point';

/** Where rows were materialised (extend when wiring admin / build snapshots / pipeline traces). */
export type MarketActivityLedgerProvenance =
  | 'parsed_market_config_v1'
  | 'assembled_build_v1'
  | 'pipeline_receipt_v1';

export type MarketActivityLedgerEntry = {
  /** Stable id for selection + URL state (not necessarily a DB uuid). */
  entryId: string;
  market: string;
  family: MarketActivityFamily;
  entityKind: MarketActivityEntityKind;
  temporalKind: MarketActivityTemporalKind;
  /** Inclusive ISO `YYYY-MM-DD`. */
  dateStart: string;
  /** Inclusive ISO `YYYY-MM-DD`. */
  dateEnd: string;
  title: string;
  subtitle?: string;
  affects: MarketActivityAffects;
  lensHints: MarketActivityLensHint[];
  /** Optional drill targets (admin routes, YAML anchors, fragment ids — filled as integrations land). */
  sourceRef?: {
    yamlAnchor?: string;
    adminRoute?: string;
    fragmentTable?: string;
    fragmentId?: string;
  };
  /** Extra structured detail (e.g. severity, impact). */
  metadata?: Record<string, unknown>;
};

export type MarketActivityLedger = {
  schemaVersion: typeof MARKET_ACTIVITY_LEDGER_SCHEMA_VERSION;
  market: string;
  provenance: MarketActivityLedgerProvenance;
  /** ISO timestamp when the ledger was built (client clock is fine for v1). */
  generatedAt: string;
  entries: MarketActivityLedgerEntry[];
};

/** Bump when highlight payload shape or defaults change (URL / persisted UI). */
export const MARKET_ACTIVITY_HIGHLIGHT_SCHEMA_VERSION = 1 as const;

const DEFAULT_HIGHLIGHT_MAX_SELECTED = 24;
const DEFAULT_HIGHLIGHT_MAX_TOTAL_DAYS = 2000;

/**
 * Runway / heatmap overlay props: which ledger rows are selected for subtle per-day markers.
 * Keep serialisable (e.g. `selectedEntryIds` in querystring or sessionStorage).
 */
export type MarketActivityHighlightState = {
  schemaVersion: typeof MARKET_ACTIVITY_HIGHLIGHT_SCHEMA_VERSION;
  /** {@link MarketActivityLedgerEntry.entryId} values; order preserved for UI (e.g. last toggled). */
  selectedEntryIds: string[];
  /** Hard cap on selection count (defaults in {@link emptyMarketActivityHighlightState}). */
  maxSelected?: number;
};

export function emptyMarketActivityHighlightState(
  partial?: Pick<MarketActivityHighlightState, 'maxSelected'>,
): MarketActivityHighlightState {
  return {
    schemaVersion: MARKET_ACTIVITY_HIGHLIGHT_SCHEMA_VERSION,
    selectedEntryIds: [],
    maxSelected: partial?.maxSelected ?? DEFAULT_HIGHLIGHT_MAX_SELECTED,
  };
}

/** Toggle one entry; omit or pass `exclusive: true` for single-select table rows. */
export function highlightStateToggleEntry(
  state: MarketActivityHighlightState,
  entryId: string,
  options?: { exclusive?: boolean },
): MarketActivityHighlightState {
  const max = state.maxSelected ?? DEFAULT_HIGHLIGHT_MAX_SELECTED;
  const exclusive = options?.exclusive ?? false;
  const has = state.selectedEntryIds.includes(entryId);
  let next: string[];
  if (exclusive) {
    next = has ? [] : [entryId];
  } else if (has) {
    next = state.selectedEntryIds.filter((id) => id !== entryId);
  } else {
    next = [...state.selectedEntryIds, entryId];
    if (next.length > max) next = next.slice(next.length - max);
  }
  return { ...state, selectedEntryIds: next };
}

export function highlightStateSetEntries(
  state: MarketActivityHighlightState,
  entryIds: readonly string[],
): MarketActivityHighlightState {
  const max = state.maxSelected ?? DEFAULT_HIGHLIGHT_MAX_SELECTED;
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of entryIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
    if (deduped.length >= max) break;
  }
  return { ...state, selectedEntryIds: deduped };
}

export function ledgerEntryById(
  ledger: MarketActivityLedger,
  entryId: string,
): MarketActivityLedgerEntry | undefined {
  return ledger.entries.find((e) => e.entryId === entryId);
}

/**
 * Sorted unique ISO days to tint on the runway for the current selection.
 * Caps prevent pathological spans from freezing the UI.
 */
export function ledgerHighlightIsoDays(
  ledger: MarketActivityLedger,
  state: MarketActivityHighlightState,
  options?: { maxDaysPerEntry?: number; maxTotalDays?: number },
): string[] {
  const perEntry = options?.maxDaysPerEntry ?? 800;
  const maxTotal = options?.maxTotalDays ?? DEFAULT_HIGHLIGHT_MAX_TOTAL_DAYS;
  const set = new Set<string>();
  for (const id of state.selectedEntryIds) {
    const e = ledgerEntryById(ledger, id);
    if (!e) continue;
    for (const d of ledgerEntryToIsoDays(e, perEntry)) {
      set.add(d);
      if (set.size >= maxTotal) return [...set].sort();
    }
  }
  return [...set].sort();
}

/** Same as {@link ledgerHighlightIsoDays} but as a `Set` for O(1) cell tests. */
export function ledgerHighlightDaySet(
  ledger: MarketActivityLedger,
  state: MarketActivityHighlightState,
  options?: { maxDaysPerEntry?: number; maxTotalDays?: number },
): Set<string> {
  return new Set(ledgerHighlightIsoDays(ledger, state, options));
}

function addCalendarDaysIso(startYmd: string, deltaDays: number): string {
  const d = parseDate(startYmd);
  d.setDate(d.getDate() + deltaDays);
  return formatDateYmd(d);
}

/** Inclusive calendar-day count from ISO `YYYY-MM-DD` bounds. */
function inclusiveIsoDayCount(dateStart: string, dateEnd: string): number {
  const start = parseDate(dateStart);
  const end = parseDate(dateEnd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/** Split sorted unique ISO days into maximal consecutive runs (calendar adjacency). */
function partitionConsecutiveSortedIsoDays(sortedUniqueYmd: readonly string[]): Array<{ dateStart: string; dateEnd: string }> {
  const out: Array<{ dateStart: string; dateEnd: string }> = [];
  if (sortedUniqueYmd.length === 0) return out;
  let runStart = sortedUniqueYmd[0]!;
  let runEnd = sortedUniqueYmd[0]!;
  for (let i = 1; i < sortedUniqueYmd.length; i++) {
    const ymd = sortedUniqueYmd[i]!;
    const nextAfterRun = addCalendarDaysIso(runEnd, 1);
    if (ymd === nextAfterRun) {
      runEnd = ymd;
    } else {
      out.push({ dateStart: runStart, dateEnd: runEnd });
      runStart = ymd;
      runEnd = ymd;
    }
  }
  out.push({ dateStart: runStart, dateEnd: runEnd });
  return out;
}

function clampDedupeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 96);
}

/** Deterministic id: same inputs → same id across builds (for highlight state). */
export function makeLedgerEntryId(market: string, entityKind: MarketActivityEntityKind, dedupe: string): string {
  return `${market}:${entityKind}:${clampDedupeKey(dedupe)}`;
}

function campaignFootprintIso(c: CampaignConfig): { dateStart: string; dateEnd: string } {
  const start = c.start;
  const prep = c.prepBeforeLiveDays ?? 0;
  const dateStart = prep > 0 ? addCalendarDaysIso(start, -prep) : start;
  const liveDays = Math.max(1, c.durationDays);
  const dateEnd = addCalendarDaysIso(start, liveDays - 1);
  return { dateStart, dateEnd };
}

function programmeFootprintIso(p: TechProgrammeConfig): { dateStart: string; dateEnd: string } {
  const start = p.start;
  const prep = p.prepBeforeLiveDays ?? 0;
  const dateStart = prep > 0 ? addCalendarDaysIso(start, -prep) : start;
  const liveDays = Math.max(1, p.durationDays);
  const dateEnd = addCalendarDaysIso(start, liveDays - 1);
  return { dateStart, dateEnd };
}

/**
 * Build a v1 ledger from a parsed {@link MarketConfig} (browser YAML path or reconstructed config).
 * Intentionally conservative: omits always-on rhythms (BAU, trading monthly shape) until we model them
 * as dated spans or receipt terms.
 */
export function buildMarketActivityLedgerFromConfig(config: MarketConfig): MarketActivityLedger {
  const market = config.market;
  const entries: MarketActivityLedgerEntry[] = [];

  const push = (e: MarketActivityLedgerEntry) => {
    entries.push(e);
  };

  for (let i = 0; i < config.campaigns.length; i++) {
    const c = config.campaigns[i]!;
    const { dateStart, dateEnd } = campaignFootprintIso(c);
    const dedupe = `${c.name}_${dateStart}_${i}`;
    push({
      entryId: makeLedgerEntryId(market, 'campaign', dedupe),
      market,
      family: 'commercial',
      entityKind: 'campaign',
      temporalKind: 'range',
      dateStart,
      dateEnd,
      title: c.name,
      subtitle: c.impact,
      affects: {
        opsTrading: true,
        techDelivery: true,
        coverage: false,
        calendar: false,
        risk: Boolean(c.businessUplift && c.businessUplift > 1),
      },
      lensHints: ['combined', 'in_store', 'market_risk'],
      metadata: {
        configSliceIndex: i,
        durationDays: c.durationDays,
        prepBeforeLiveDays: c.prepBeforeLiveDays ?? null,
        presenceOnly: Boolean(c.presenceOnly),
      },
    });
  }

  for (let i = 0; i < config.techProgrammes.length; i++) {
    const p = config.techProgrammes[i]!;
    const { dateStart, dateEnd } = programmeFootprintIso(p);
    const dedupe = `${p.name}_${dateStart}_${i}`;
    push({
      entryId: makeLedgerEntryId(market, 'tech_programme', dedupe),
      market,
      family: 'tech_delivery',
      entityKind: 'tech_programme',
      temporalKind: 'range',
      dateStart,
      dateEnd,
      title: p.name,
      affects: {
        opsTrading: false,
        techDelivery: true,
        coverage: false,
        calendar: false,
        risk: false,
      },
      lensHints: ['combined'],
      metadata: {
        configSliceIndex: i,
        durationDays: p.durationDays,
        prepBeforeLiveDays: p.prepBeforeLiveDays ?? null,
      },
    });
  }

  const bands = config.nationalLeaveBands ?? [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    push(leaveBandToEntry(market, b, i));
  }

  const pubDates = config.publicHolidayExtraDates ?? [];
  for (let i = 0; i < pubDates.length; i++) {
    const d = pubDates[i]!.trim();
    if (!d) continue;
    push({
      entryId: makeLedgerEntryId(market, 'public_holiday_date', `${d}_${i}`),
      market,
      family: 'calendar',
      entityKind: 'public_holiday_date',
      temporalKind: 'point',
      dateStart: d,
      dateEnd: d,
      title: `Public holiday`,
      subtitle: d,
      affects: {
        opsTrading: true,
        techDelivery: true,
        coverage: true,
        calendar: true,
        risk: false,
      },
      lensHints: ['in_store', 'combined', 'market_risk'],
      metadata: { configSliceIndex: i },
    });
  }

  const schDates = config.schoolHolidayExtraDates ?? [];
  const schUnique = new Set<string>();
  for (const raw of schDates) {
    const d = raw.trim();
    if (d) schUnique.add(d);
  }
  const schSorted = [...schUnique].sort((a, b) => a.localeCompare(b));
  const schRuns = partitionConsecutiveSortedIsoDays(schSorted);
  for (let i = 0; i < schRuns.length; i++) {
    const { dateStart, dateEnd } = schRuns[i]!;
    const point = dateStart === dateEnd;
    const dedupe = point ? `${dateStart}_${i}` : `${dateStart}_${dateEnd}_${i}`;
    const dayCount = inclusiveIsoDayCount(dateStart, dateEnd);
    push({
      entryId: makeLedgerEntryId(market, 'school_holiday_date', dedupe),
      market,
      family: 'calendar',
      entityKind: 'school_holiday_date',
      temporalKind: point ? 'point' : 'range',
      dateStart,
      dateEnd,
      title: `School holiday`,
      subtitle: point ? dateStart : `${dayCount} days`,
      affects: {
        opsTrading: true,
        techDelivery: true,
        coverage: true,
        calendar: true,
        risk: false,
      },
      lensHints: ['in_store', 'combined', 'market_risk'],
      metadata: point
        ? { configSliceIndex: i }
        : { configSliceIndex: i, mergedSchoolHolidayDays: dayCount },
    });
  }

  const evs = config.deployment_risk_events ?? [];
  for (let i = 0; i < evs.length; i++) {
    push(deploymentEventToEntry(market, evs[i]!, i));
  }

  const bl = config.deployment_risk_blackouts ?? [];
  for (let i = 0; i < bl.length; i++) {
    push(blackoutToEntry(market, bl[i]!, i));
  }

  const wins = config.operatingWindows ?? [];
  for (let i = 0; i < wins.length; i++) {
    push(windowToEntry(market, wins[i]!, i));
  }

  entries.sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.title.localeCompare(b.title));

  return {
    schemaVersion: MARKET_ACTIVITY_LEDGER_SCHEMA_VERSION,
    market,
    provenance: 'parsed_market_config_v1',
    generatedAt: new Date().toISOString(),
    entries,
  };
}

function leaveBandToEntry(market: string, b: NationalLeaveBand, index: number): MarketActivityLedgerEntry {
  const label = b.label?.trim() || 'National leave band';
  const dedupe = `${b.from}_${b.to}_${index}`;
  return {
    entryId: makeLedgerEntryId(market, 'national_leave_band', dedupe),
    market,
    family: 'coverage',
    entityKind: 'national_leave_band',
    temporalKind: 'range',
    dateStart: b.from,
    dateEnd: b.to,
    title: label,
    affects: {
      opsTrading: false,
      techDelivery: true,
      coverage: true,
      calendar: false,
      risk: true,
    },
    lensHints: ['combined', 'market_risk'],
    metadata: {
      configSliceIndex: index,
      capacityMultiplier: b.capacityMultiplier ?? null,
      weekCount: Array.isArray(b.weeks) ? b.weeks.length : 0,
    },
  };
}

function deploymentEventToEntry(
  market: string,
  e: DeploymentRiskEvent,
  index: number,
): MarketActivityLedgerEntry {
  return {
    entryId: makeLedgerEntryId(market, 'deployment_risk_event', `${e.id}_${index}`),
    market,
    family: 'risk_policy',
    entityKind: 'deployment_risk_event',
    temporalKind: 'range',
    dateStart: e.start,
    dateEnd: e.end,
    title: e.kind?.trim() || 'Deployment risk event',
    subtitle: e.id,
    affects: {
      opsTrading: false,
      techDelivery: false,
      coverage: false,
      calendar: false,
      risk: true,
    },
    lensHints: ['market_risk'],
    metadata: { configSliceIndex: index, severity: e.severity, kind: e.kind ?? null },
  };
}

function blackoutToEntry(market: string, b: DeploymentRiskBlackout, index: number): MarketActivityLedgerEntry {
  return {
    entryId: makeLedgerEntryId(market, 'deployment_risk_blackout', `${b.id}_${index}`),
    market,
    family: 'risk_policy',
    entityKind: 'deployment_risk_blackout',
    temporalKind: 'range',
    dateStart: b.start,
    dateEnd: b.end,
    title: b.public_reason?.trim() || 'Change freeze / blackout',
    subtitle: b.id,
    affects: {
      opsTrading: false,
      techDelivery: false,
      coverage: false,
      calendar: false,
      risk: true,
    },
    lensHints: ['market_risk'],
    metadata: {
      configSliceIndex: index,
      severity: b.severity,
      operational_note: b.operational_note ?? null,
    },
  };
}

function windowToEntry(market: string, w: OperatingWindow, index: number): MarketActivityLedgerEntry {
  return {
    entryId: makeLedgerEntryId(market, 'operating_window', `${w.name}_${w.start}_${index}`),
    market,
    family: 'ops_trading',
    entityKind: 'operating_window',
    temporalKind: 'range',
    dateStart: w.start,
    dateEnd: w.end,
    title: w.name,
    affects: {
      opsTrading: true,
      techDelivery: true,
      coverage: false,
      calendar: false,
      risk: false,
    },
    lensHints: ['in_store', 'combined'],
    metadata: {
      configSliceIndex: index,
      store_pressure_mult: w.store_pressure_mult ?? null,
      lab_team_capacity_mult: w.lab_team_capacity_mult ?? null,
    },
  };
}

/** True if `dayYmd` falls on any calendar day in `[entry.dateStart, entry.dateEnd]` (inclusive). */
export function ledgerEntryCoversDay(entry: MarketActivityLedgerEntry, dayYmd: string): boolean {
  return dayYmd >= entry.dateStart && dayYmd <= entry.dateEnd;
}

/** All ISO days in an entry span (inclusive). Prefer only for highlighted subsets — can be wide. */
export function ledgerEntryToIsoDays(entry: MarketActivityLedgerEntry, maxDays = 800): string[] {
  const out: string[] = [];
  let cur = parseDate(entry.dateStart);
  const end = parseDate(entry.dateEnd);
  cur.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  let n = 0;
  while (cur.getTime() <= end.getTime() && n < maxDays) {
    out.push(formatDateYmd(cur));
    cur.setDate(cur.getDate() + 1);
    n += 1;
  }
  return out;
}

/** Client-side filters for the observability table (v1). */
export function filterLedgerEntries(
  ledger: MarketActivityLedger,
  query: {
    family?: MarketActivityFamily;
    lens?: MarketActivityLensHint;
    text?: string;
  },
): MarketActivityLedgerEntry[] {
  let list = ledger.entries;
  if (query.family) {
    list = list.filter((e) => e.family === query.family);
  }
  const lens = query.lens;
  if (lens) {
    list = list.filter((e) => e.lensHints.includes(lens));
  }
  const raw = query.text?.trim().toLowerCase();
  if (raw) {
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(raw) ||
        (e.subtitle?.toLowerCase().includes(raw) ?? false) ||
        e.entryId.toLowerCase().includes(raw) ||
        e.entityKind.toLowerCase().includes(raw),
    );
  }
  return list;
}

function ledgerEntryOverlapsInclusiveRange(
  entry: MarketActivityLedgerEntry,
  rangeStartYmd: string,
  rangeEndYmd: string,
): boolean {
  return entry.dateStart <= rangeEndYmd && entry.dateEnd >= rangeStartYmd;
}

/**
 * Keep ledger rows whose `[dateStart, dateEnd]` intersects the visible runway window (inclusive ISO
 * bounds). Align with the runway year/quarter picker span, or the model’s
 * min–max risk dates when no year filter is set (same rule as the runway layout).
 */
export function filterLedgerToVisibleDateRange(
  ledger: MarketActivityLedger,
  rangeStartYmd: string,
  rangeEndYmd: string,
): MarketActivityLedger {
  if (rangeStartYmd > rangeEndYmd) {
    return { ...ledger, entries: [] };
  }
  const entries = ledger.entries.filter((e) =>
    ledgerEntryOverlapsInclusiveRange(e, rangeStartYmd, rangeEndYmd),
  );
  return { ...ledger, entries };
}
