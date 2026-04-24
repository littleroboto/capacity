import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Blend,
  Building2,
  CalendarDays,
  Cpu,
  Info,
  Layers2,
  List,
  Megaphone,
  Palmtree,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type {
  MarketActivityEntityKind,
  MarketActivityLedger,
  MarketActivityLedgerEntry,
  MarketActivityLensHint,
} from '@/lib/marketActivityLedger';
import {
  buildDayLensContributionContext,
  contributionTripleForEntry,
  unionLedgerContributorIdsForDay,
  type DayContributionTriple,
} from '@/lib/runwayLedgerDayContributions';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

/** When set, table lists rows touching this day (any lens) and shows τ / ρ / σ allocation columns. */
export type RunwayLedgerDayContributionPin = {
  dayYmd: string;
  riskRow: RiskRow;
  tuning: RiskModelTuning;
};

function lensHintLabels(hints: readonly MarketActivityLensHint[]): string {
  const parts = hints.map((h) =>
    h === 'combined' ? 'Tech' : h === 'in_store' ? 'Trading' : 'Risk',
  );
  return parts.length ? parts.join(', ') : '—';
}

type LedgerActivityTabId = 'all' | 'campaigns' | 'tech' | 'corp_calendar' | 'holidays';

/** Category tabs only (used when picking a default tab on day-pin, so we prefer a real bucket over “All”). */
const LEDGER_CATEGORY_TAB_ORDER: LedgerActivityTabId[] = ['campaigns', 'tech', 'corp_calendar', 'holidays'];

const LEDGER_TAB_ORDER: LedgerActivityTabId[] = ['all', ...LEDGER_CATEGORY_TAB_ORDER];

const LEDGER_TAB_LABEL: Record<LedgerActivityTabId, string> = {
  all: 'All activity',
  campaigns: 'Campaigns',
  tech: 'Tech programmes',
  corp_calendar: 'Corp Events',
  holidays: 'Holidays & leave',
};

const LEDGER_TAB_ICON: Record<LedgerActivityTabId, LucideIcon> = {
  all: List,
  campaigns: Megaphone,
  tech: Cpu,
  corp_calendar: Building2,
  holidays: Palmtree,
};

const LEDGER_TAB_EMPTY: Record<LedgerActivityTabId, string> = {
  all: 'No activity rows in this scope.',
  campaigns: 'No campaigns in the current scope.',
  tech: 'No tech programmes in the current scope.',
  corp_calendar: 'No corporate deployment-risk events (YAML events or change freezes) in the current scope.',
  holidays: 'No public/school holidays, national leave bands, or operating windows in the current scope.',
};

/** Compact tab strip label (full name stays in `title` / sr-only). */
const LEDGER_TAB_SHORT: Record<LedgerActivityTabId, string> = {
  all: 'All',
  campaigns: 'Camp.',
  tech: 'Tech',
  corp_calendar: 'Events',
  holidays: 'Hol.',
};

const DAY_PIN_HELP =
  'Rows touching this calendar day on at least one lens. τ, ρ, and σ split each lens heat-map value equally across touching rows (documentation / UX, not engine marginal attribution).';

function ledgerActivityTabForKind(kind: MarketActivityEntityKind): LedgerActivityTabId {
  if (kind === 'campaign') return 'campaigns';
  if (kind === 'tech_programme') return 'tech';
  if (kind === 'deployment_risk_event' || kind === 'deployment_risk_blackout') return 'corp_calendar';
  if (kind === 'public_holiday_date' || kind === 'school_holiday_date' || kind === 'national_leave_band' || kind === 'operating_window') {
    return 'holidays';
  }
  return 'tech';
}

function formatEntityKindLabel(kind: string): string {
  const map: Record<string, string> = {
    campaign: 'Campaign',
    tech_programme: 'Tech programme',
    national_leave_band: 'National leave',
    public_holiday_date: 'Public holiday',
    school_holiday_date: 'School holiday',
    deployment_risk_event: 'Deployment event',
    deployment_risk_blackout: 'Change freeze',
    operating_window: 'Operating window',
  };
  return map[kind] ?? kind;
}

function formatShareCell(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function SelectAllHeaderCheckbox({
  visibleEntryIds,
  onToggleBulk,
  staticPreview,
}: {
  visibleEntryIds: readonly string[];
  onToggleBulk: (ids: readonly string[]) => void;
  staticPreview: boolean;
}) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const ref = useRef<HTMLInputElement>(null);
  const allOn = visibleEntryIds.length > 0 && visibleEntryIds.every((id) => !excludedSet.has(id));
  const someIncluded = visibleEntryIds.some((id) => !excludedSet.has(id));
  const someExcluded = visibleEntryIds.some((id) => excludedSet.has(id));
  const indeterminate = someIncluded && someExcluded;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = staticPreview ? false : indeterminate;
  }, [indeterminate, staticPreview]);

  if (visibleEntryIds.length === 0) {
    return <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />;
  }

  if (staticPreview) {
    return (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 cursor-default rounded border-input accent-primary opacity-80"
        aria-label="Include all visible activity rows in runway calendar colours"
        checked
        disabled
        readOnly
        title="Preview: all rows included"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
      aria-label="Include all visible activity rows in runway calendar colours"
      checked={allOn}
      onChange={() => {
        onToggleBulk(visibleEntryIds);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function LedgerRowSelectCheckbox({
  selectHeaderId,
  entryId,
  staticPreview,
}: {
  selectHeaderId: string;
  entryId: string;
  staticPreview: boolean;
}) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const toggleExcluded = useAtcStore((s) => s.toggleRunwayLedgerExcludedEntryId);
  const checked = !excludedIds.includes(entryId);
  if (staticPreview) {
    return (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-default rounded border-input accent-primary opacity-80"
        aria-labelledby={`${selectHeaderId} ledger-row-${entryId}`}
        title="Preview: all rows included"
        checked
        disabled
        readOnly
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <input
      type="checkbox"
      className="h-3.5 w-3.5 rounded border-input accent-primary"
      aria-labelledby={`${selectHeaderId} ledger-row-${entryId}`}
      title="Include this row in runway calendar colours"
      checked={checked}
      onChange={() => toggleExcluded(entryId)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

const colHelp = createColumnHelper<MarketActivityLedgerEntry>();

function buildColumns(
  options: {
    onBulkVisible: (ids: readonly string[]) => void;
    contributionById: Map<string, DayContributionTriple> | null;
    staticLedgerPreview: boolean;
  },
): ColumnDef<MarketActivityLedgerEntry, any>[] {
  const selectHeaderId = 'ledger-report-col-select';
  const { onBulkVisible, contributionById, staticLedgerPreview } = options;

  const greekCols: ColumnDef<MarketActivityLedgerEntry, unknown>[] = contributionById
    ? [
        colHelp.display({
          id: 'tau',
          header: () => (
            <abbr title="Technology lens (capacity consumed) — equal share across rows touching this day" className="cursor-help no-underline">
              τ
            </abbr>
          ),
          cell: ({ row }) => (
            <span className="tabular-nums text-muted-foreground">{formatShareCell(contributionById.get(row.original.entryId)?.tau)}</span>
          ),
          sortingFn: (a, b) => {
            const av = contributionById.get(a.original.entryId)?.tau ?? -1;
            const bv = contributionById.get(b.original.entryId)?.tau ?? -1;
            return av - bv;
          },
        }),
        colHelp.display({
          id: 'rho',
          header: () => (
            <abbr title="Restaurant / trading lens — equal share across rows touching this day" className="cursor-help no-underline">
              ρ
            </abbr>
          ),
          cell: ({ row }) => (
            <span className="tabular-nums text-muted-foreground">{formatShareCell(contributionById.get(row.original.entryId)?.rho)}</span>
          ),
          sortingFn: (a, b) => {
            const av = contributionById.get(a.original.entryId)?.rho ?? -1;
            const bv = contributionById.get(b.original.entryId)?.rho ?? -1;
            return av - bv;
          },
        }),
        colHelp.display({
          id: 'sigma',
          header: () => (
            <abbr title="Deployment risk lens — equal share across rows touching this day" className="cursor-help no-underline">
              σ
            </abbr>
          ),
          cell: ({ row }) => (
            <span className="tabular-nums text-muted-foreground">{formatShareCell(contributionById.get(row.original.entryId)?.sigma)}</span>
          ),
          sortingFn: (a, b) => {
            const av = contributionById.get(a.original.entryId)?.sigma ?? -1;
            const bv = contributionById.get(b.original.entryId)?.sigma ?? -1;
            return av - bv;
          },
        }),
      ]
    : [];

  return [
    colHelp.display({
      id: 'select',
      header: ({ table }) => {
        const visibleEntryIds = table.getFilteredRowModel().rows.map((r) => r.original.entryId);
        return (
          <div className="flex flex-col items-center gap-1 py-0.5">
            <SelectAllHeaderCheckbox
              visibleEntryIds={visibleEntryIds}
              onToggleBulk={onBulkVisible}
              staticPreview={staticLedgerPreview}
            />
            <span className="sr-only" id={selectHeaderId}>
              Include on runway heatmap
            </span>
          </div>
        );
      },
      cell: ({ row }) => (
        <LedgerRowSelectCheckbox
          selectHeaderId={selectHeaderId}
          entryId={row.original.entryId}
          staticPreview={staticLedgerPreview}
        />
      ),
      enableSorting: false,
      size: 28,
    }),
    colHelp.accessor('entityKind', {
      header: 'Kind',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatEntityKindLabel(String(getValue()))}</span>
      ),
      filterFn: 'includesString',
    }),
    colHelp.accessor('title', {
      header: 'Title',
      cell: ({ getValue, row }) => (
        <span id={`ledger-row-${row.original.entryId}`} className="font-medium text-foreground">
          {getValue()}
        </span>
      ),
      filterFn: 'includesString',
    }),
    colHelp.accessor('dateStart', {
      id: 'dateStart',
      header: 'Dates',
      sortingFn: 'alphanumeric',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-foreground/90">
            {r.dateStart === r.dateEnd ? r.dateStart : `${r.dateStart} → ${r.dateEnd}`}
          </span>
        );
      },
    }),
    colHelp.display({
      id: 'lenses',
      header: 'Lenses',
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">{lensHintLabels(row.original.lensHints)}</span>
      ),
    }),
    colHelp.accessor('subtitle', {
      header: 'Note',
      cell: ({ getValue }) => <span className="break-words text-muted-foreground">{getValue() ?? '—'}</span>,
    }),
    ...greekCols,
  ];
}

type RunwayActivityLedgerTableProps = {
  ledger: MarketActivityLedger;
  className?: string;
  /** Pinned heatmap day: union of contributors across Tech / Trading / Risk, with τ ρ σ columns. */
  dayContributionPin?: RunwayLedgerDayContributionPin | null;
  /**
   * Landing / embed: every row appears included, heatmap-driving controls are disabled,
   * default tab is All activity.
   */
  staticLedgerPreview?: boolean;
};

export function RunwayActivityLedgerTable({
  ledger,
  className,
  dayContributionPin = null,
  staticLedgerPreview = false,
}: RunwayActivityLedgerTableProps) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const clearExclusions = useAtcStore((s) => s.clearRunwayLedgerExclusions);
  const excludeAllEntries = useAtcStore((s) => s.excludeAllRunwayLedgerEntries);
  const implicitBaselineFootprint = useAtcStore((s) => s.runwayLedgerImplicitBaselineFootprint);
  const setImplicitBaselineFootprint = useAtcStore((s) => s.setRunwayLedgerImplicitBaselineFootprint);
  const toggleBulkVisible = useAtcStore((s) => s.toggleRunwayLedgerExcludeBulkVisible);

  const excludedSet = useMemo(
    () => (staticLedgerPreview ? new Set<string>() : new Set(excludedIds)),
    [staticLedgerPreview, excludedIds],
  );

  const allLedgerRowsExcluded = useMemo(() => {
    if (!ledger.entries.length) return false;
    return ledger.entries.every((e) => excludedSet.has(e.entryId));
  }, [ledger.entries, excludedSet]);

  const contributionCtx = useMemo(() => {
    if (!dayContributionPin) return null;
    return buildDayLensContributionContext(
      ledger,
      dayContributionPin.dayYmd,
      excludedSet,
      dayContributionPin.riskRow,
      dayContributionPin.tuning,
    );
  }, [ledger, dayContributionPin, excludedSet]);

  const contributionById = useMemo(() => {
    if (!contributionCtx) return null;
    const m = new Map<string, DayContributionTriple>();
    for (const e of ledger.entries) {
      m.set(e.entryId, contributionTripleForEntry(e, contributionCtx));
    }
    return m;
  }, [ledger, contributionCtx]);

  const tableRows = useMemo(() => {
    if (dayContributionPin) {
      const ids = unionLedgerContributorIdsForDay(ledger, dayContributionPin.dayYmd, excludedSet);
      return ledger.entries.filter((e) => ids.has(e.entryId));
    }
    return ledger.entries;
  }, [ledger, dayContributionPin, excludedSet]);

  const tabCounts = useMemo(() => {
    const c: Record<LedgerActivityTabId, number> = {
      all: tableRows.length,
      campaigns: 0,
      tech: 0,
      corp_calendar: 0,
      holidays: 0,
    };
    for (const e of tableRows) {
      c[ledgerActivityTabForKind(e.entityKind)] += 1;
    }
    return c;
  }, [tableRows]);

  const [activeTab, setActiveTab] = useState<LedgerActivityTabId>(() =>
    staticLedgerPreview ? 'all' : 'campaigns',
  );
  const lastPinnedYmdRef = useRef<string | null>(null);

  useEffect(() => {
    const pinYmd = dayContributionPin?.dayYmd ?? null;

    if (staticLedgerPreview && !pinYmd) {
      lastPinnedYmdRef.current = null;
      setActiveTab((prev) => (tabCounts[prev] > 0 ? prev : 'all'));
      return;
    }

    setActiveTab((prev) => {
      const nonemptyCategories = LEDGER_CATEGORY_TAB_ORDER.filter((id) => tabCounts[id] > 0);
      if (nonemptyCategories.length === 0 && tabCounts.all === 0) {
        lastPinnedYmdRef.current = pinYmd;
        return 'campaigns';
      }

      if (!pinYmd) {
        lastPinnedYmdRef.current = null;
        if (tabCounts[prev] > 0) return prev;
        return (
          LEDGER_CATEGORY_TAB_ORDER.find((id) => tabCounts[id] > 0) ?? (tabCounts.all > 0 ? 'all' : 'campaigns')
        );
      }

      const pinBecame = lastPinnedYmdRef.current !== pinYmd;
      lastPinnedYmdRef.current = pinYmd;

      if (pinBecame) {
        let best: LedgerActivityTabId = nonemptyCategories[0]!;
        for (const id of LEDGER_CATEGORY_TAB_ORDER) {
          if (tabCounts[id] === 0) continue;
          if (tabCounts[id] > tabCounts[best]) best = id;
        }
        return best;
      }

      if (tabCounts[prev] > 0) return prev;
      return (
        LEDGER_CATEGORY_TAB_ORDER.find((id) => tabCounts[id] > 0) ?? (tabCounts.all > 0 ? 'all' : 'campaigns')
      );
    });
  }, [
    staticLedgerPreview,
    dayContributionPin?.dayYmd,
    tabCounts.all,
    tabCounts.campaigns,
    tabCounts.tech,
    tabCounts.corp_calendar,
    tabCounts.holidays,
  ]);

  const tabFilteredRows = useMemo(
    () =>
      activeTab === 'all'
        ? tableRows
        : tableRows.filter((e) => ledgerActivityTabForKind(e.entityKind) === activeTab),
    [tableRows, activeTab],
  );

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateStart', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () =>
      buildColumns({
        onBulkVisible: toggleBulkVisible,
        contributionById,
        staticLedgerPreview,
      }),
    [toggleBulkVisible, contributionById, staticLedgerPreview],
  );

  const table = useReactTable({
    data: tabFilteredRows,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).trim().toLowerCase();
      if (!q) return true;
      const e = row.original;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.subtitle?.toLowerCase().includes(q) ?? false) ||
        e.entryId.toLowerCase().includes(q) ||
        e.entityKind.toLowerCase().includes(q) ||
        e.family.toLowerCase().includes(q) ||
        lensHintLabels(e.lensHints).toLowerCase().includes(q) ||
        e.dateStart.toLowerCase().includes(q) ||
        e.dateEnd.toLowerCase().includes(q)
      );
    },
  });

  const filterInputId = 'ledger-report-global-filter';
  const dense = Boolean(dayContributionPin);

  return (
    <div className={cn('flex w-full min-w-0 flex-col overflow-visible gap-2', className)}>
      <div className="flex min-w-0 flex-col gap-1.5 border-b border-border/25 pb-1.5 dark:border-border/35">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1.5 text-foreground">
              <Layers2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
            </div>
            {dayContributionPin ? (
              <span
                className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border/35 bg-muted/25 px-1.5 py-0.5 text-[10px] text-muted-foreground dark:border-border/40"
                title={DAY_PIN_HELP}
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />
                <span className="truncate font-mono tabular-nums text-foreground/90">{dayContributionPin.dayYmd}</span>
                <Info className="h-3 w-3 shrink-0 opacity-55" aria-hidden />
              </span>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Activity categories"
            className="inline-flex max-w-full min-w-0 overflow-x-auto rounded-lg border border-border/40 bg-muted/15 p-0.5 shadow-sm dark:border-border/35 dark:bg-muted/10"
          >
            {LEDGER_TAB_ORDER.map((id) => {
              const active = activeTab === id;
              const n = tabCounts[id];
              const TabIcon = LEDGER_TAB_ICON[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  id={`ledger-tab-${id}`}
                  tabIndex={active ? 0 : -1}
                  title={`${LEDGER_TAB_LABEL[id]} (${n})`}
                  aria-label={`${LEDGER_TAB_LABEL[id]}, ${n} rows`}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/45 dark:ring-border/40'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                  onClick={() => setActiveTab(id)}
                >
                  <TabIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="hidden sm:inline">{LEDGER_TAB_SHORT[id]}</span>
                  <span className="tabular-nums opacity-80">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 max-w-full flex-nowrap items-center justify-end gap-x-2 overflow-x-auto pb-px [scrollbar-width:thin] sm:shrink-0">
          <div className="relative min-w-[10rem] max-w-xs flex-1 basis-[min(100%,12rem)] sm:min-w-0">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/80"
              aria-hidden
            />
            <label htmlFor={filterInputId} className="sr-only">
              Filter activity rows
            </label>
            <input
              id={filterInputId}
              type="search"
              placeholder="Search…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-8 w-full min-w-0 rounded-md border border-input bg-background py-1 pl-8 pr-2 text-xs ring-offset-background placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>

          <label
            className={cn(
              'inline-flex h-8 shrink-0 select-none items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-[10px] font-medium text-muted-foreground',
              staticLedgerPreview
                ? 'cursor-default opacity-80'
                : 'cursor-pointer hover:border-border/40 hover:bg-muted/25 hover:text-foreground',
            )}
          >
            <Blend className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <input
              type="checkbox"
              className="h-3 w-3 shrink-0 cursor-default rounded border-input accent-primary"
              checked={staticLedgerPreview ? true : implicitBaselineFootprint}
              onChange={(e) => setImplicitBaselineFootprint(e.target.checked)}
              aria-describedby="ledger-baseline-footprint-hint"
              disabled={staticLedgerPreview}
              title={staticLedgerPreview ? 'Preview: BAU baseline on' : undefined}
            />
            <span className="whitespace-nowrap">BAU baseline</span>
            <span id="ledger-baseline-footprint-hint" className="sr-only">
              BAU baseline: when no included activity row overlaps a day on this lens, still paint that day with the
              full per-market model heat from the runway pipeline (same lens metric as the non-ledger heatmap).
            </span>
          </label>

          {ledger.entries.length > 0 && !staticLedgerPreview ? (
            <div className="flex shrink-0 items-center gap-0.5">
              {!allLedgerRowsExcluded ? (
                <button
                  type="button"
                  onClick={() => excludeAllEntries(ledger)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:border-border hover:bg-muted/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Hide every ledger row from the heat-map"
                  aria-label="Hide all ledger rows from the heat-map"
                >
                  <Ban className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {excludedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => clearExclusions()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-muted/35 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`Show all ledger rows (${excludedIds.length} hidden)`}
                  aria-label={`Show all ledger rows; ${excludedIds.length} currently hidden`}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        </div>
        <p className="max-w-3xl text-[11px] leading-snug text-muted-foreground">
          {staticLedgerPreview ? (
            <>
              <span className="font-medium text-foreground/85">Preview:</span> the live workbench lets you include or
              exclude activity rows and toggle BAU baseline; here every row stays included so the strip matches the
              bundled market model.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground/85">How it works:</span> checked rows paint the runway
              calendar; uncheck a row to remove its dates from the coloured footprint. With{' '}
              <span className="font-medium text-foreground/85">no rows included</span>, turn off{' '}
              <span className="whitespace-nowrap">
                <Blend className="mb-px inline h-3 w-3 align-middle opacity-70" aria-hidden />
                <span className="font-medium text-foreground/85"> BAU baseline</span>
              </span>{' '}
              for an empty neutral grid; turn it on for full baseline heat on every day (same pipeline as the non-ledger
              heatmap for that market). With one or more rows included, BAU off leaves non-overlap days neutral; BAU on
              keeps baseline colour on those days while overlapping rows stack and boost per the overlap rules.
            </>
          )}
        </p>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`ledger-tab-${activeTab}`}
        className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-transparent dark:border-border/35"
      >
        <div className="min-w-0 overflow-x-auto">
          <table
            className={cn(
              'w-full table-auto border-collapse text-left',
              dense ? 'text-[11px] leading-tight' : 'text-sm leading-snug',
            )}
          >
          <thead className="border-b border-border/60 bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'whitespace-nowrap text-left font-semibold uppercase tracking-wide text-muted-foreground',
                      dense ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-2 text-xs',
                    )}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' ↑',
                          desc: ' ↓',
                        }[header.column.getIsSorted() as string] ?? null}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className={dense ? 'px-2 py-6 text-center text-[11px] text-muted-foreground' : 'px-4 py-8 text-center text-muted-foreground'}
                >
                  {tableRows.length === 0
                    ? dayContributionPin
                      ? 'No ledger rows touch this day on any lens.'
                      : 'No activity rows in this scope.'
                    : tabFilteredRows.length === 0
                      ? LEDGER_TAB_EMPTY[activeTab]
                      : 'No rows match this filter.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const sel = staticLedgerPreview || !excludedIds.includes(row.original.entryId);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border/60 last:border-b-0 hover:bg-muted/40',
                      sel && 'bg-primary/8',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn('align-top', dense ? 'px-2 py-0.5' : 'px-3 py-2')}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
