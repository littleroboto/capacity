import { useEffect, useMemo, useRef, useState } from 'react';
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
import { parseDate } from '@/engine/calendar';
import { runwayLensProductLabel, type ViewModeId } from '@/lib/constants';
import type {
  MarketActivityEntityKind,
  MarketActivityLedger,
  MarketActivityLedgerEntry,
  MarketActivityLensHint,
} from '@/lib/marketActivityLedger';
import { formatDateYmd } from '@/lib/weekRunway';
import { ledgerEntryIdsContributingToDay } from '@/lib/runwayLedgerAttribution';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

export type RunwayLedgerDayRowFilter = {
  dayYmd: string;
  lensView: Exclude<ViewModeId, 'code'>;
};

function addOneCalendarDayIso(ymd: string): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + 1);
  return formatDateYmd(d);
}

function mergeLensHints(lists: readonly (readonly MarketActivityLensHint[])[]): MarketActivityLensHint[] {
  const order: MarketActivityLensHint[] = [];
  const seen = new Set<MarketActivityLensHint>();
  for (const list of lists) {
    for (const h of list) {
      if (seen.has(h)) continue;
      seen.add(h);
      order.push(h);
    }
  }
  return order;
}

/** One table row: national leave band, or a contiguous run of public/school holiday point rows. */
type HolidayLedgerGroupRow = {
  groupId: string;
  entryIds: string[];
  entityKind: MarketActivityEntityKind;
  title: string;
  dateStart: string;
  dateEnd: string;
  lensHints: MarketActivityLensHint[];
  subtitle?: string;
  dayCount: number;
};

function bandToGroupRow(e: MarketActivityLedgerEntry): HolidayLedgerGroupRow {
  const start = parseDate(e.dateStart);
  const end = parseDate(e.dateEnd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return {
    groupId: e.entryId,
    entryIds: [e.entryId],
    entityKind: e.entityKind,
    title: e.title,
    dateStart: e.dateStart,
    dateEnd: e.dateEnd,
    lensHints: [...e.lensHints],
    subtitle: e.subtitle,
    dayCount,
  };
}

function clusterPointHolidays(
  entries: MarketActivityLedgerEntry[],
  entityKind: 'public_holiday_date' | 'school_holiday_date',
): HolidayLedgerGroupRow[] {
  const points = entries
    .filter((e) => e.entityKind === entityKind)
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  const out: HolidayLedgerGroupRow[] = [];
  let i = 0;
  while (i < points.length) {
    const run: MarketActivityLedgerEntry[] = [points[i]!];
    let j = i + 1;
    while (
      j < points.length &&
      addOneCalendarDayIso(run[run.length - 1]!.dateStart) === points[j]!.dateStart
    ) {
      run.push(points[j]!);
      j += 1;
    }
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const dayCount = run.length;
    out.push({
      groupId: `${entityKind}:${first.dateStart}:${last.dateEnd}`,
      entryIds: run.map((r) => r.entryId),
      entityKind,
      title: first.title,
      dateStart: first.dateStart,
      dateEnd: last.dateEnd,
      lensHints: mergeLensHints(run.map((r) => r.lensHints)),
      subtitle:
        dayCount > 1
          ? `${dayCount} consecutive calendar days`
          : (first.subtitle ?? first.dateStart),
      dayCount,
    });
    i = j;
  }
  return out;
}

function kindSortOrder(k: MarketActivityEntityKind): number {
  if (k === 'national_leave_band') return 0;
  if (k === 'public_holiday_date') return 1;
  if (k === 'school_holiday_date') return 2;
  return 9;
}

/** Merge consecutive public/school point days into spans; leave bands stay one row each. */
function groupHolidayLeaveLedgerRows(entries: MarketActivityLedgerEntry[]): HolidayLedgerGroupRow[] {
  const bands = entries
    .filter((e) => e.entityKind === 'national_leave_band')
    .map(bandToGroupRow);
  const publicRuns = clusterPointHolidays(entries, 'public_holiday_date');
  const schoolRuns = clusterPointHolidays(entries, 'school_holiday_date');
  const all = [...bands, ...publicRuns, ...schoolRuns];
  all.sort((a, b) => {
    const c = a.dateStart.localeCompare(b.dateStart);
    if (c !== 0) return c;
    return kindSortOrder(a.entityKind) - kindSortOrder(b.entityKind);
  });
  return all;
}

function SelectAllHeaderCheckbox({
  visibleEntryIds,
  onToggleBulk,
}: {
  visibleEntryIds: readonly string[];
  onToggleBulk: (ids: readonly string[]) => void;
}) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const ref = useRef<HTMLInputElement>(null);
  const allOn = visibleEntryIds.length > 0 && visibleEntryIds.every((id) => !excludedSet.has(id));
  const someIncluded = visibleEntryIds.some((id) => !excludedSet.has(id));
  const someExcluded = visibleEntryIds.some((id) => excludedSet.has(id));
  const indeterminate = someIncluded && someExcluded;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  if (visibleEntryIds.length === 0) {
    return <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />;
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
      aria-label="Select all visible rows in this table"
      checked={allOn}
      onChange={() => {
        onToggleBulk(visibleEntryIds);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function lensHintLabels(hints: readonly MarketActivityLensHint[]): string {
  const parts = hints.map((h) =>
    h === 'combined' ? 'Tech' : h === 'in_store' ? 'Trading' : 'Risk',
  );
  return parts.length ? parts.join(', ') : '—';
}

function LedgerRowSelectCheckbox({
  sectionId,
  selectHeaderId,
  entryId,
}: {
  sectionId: string;
  selectHeaderId: string;
  entryId: string;
}) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const toggleExcluded = useAtcStore((s) => s.toggleRunwayLedgerExcludedEntryId);
  const checked = !excludedIds.includes(entryId);
  return (
    <input
      type="checkbox"
      className="h-3.5 w-3.5 rounded border-input accent-primary"
      aria-labelledby={`${selectHeaderId} ledger-row-${sectionId}-${entryId}`}
      checked={checked}
      onChange={() => toggleExcluded(entryId)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

const colHelp = createColumnHelper<MarketActivityLedgerEntry>();

function buildColumns(
  sectionId: string,
  options: { showEntityKind: boolean },
  onBulkVisible: (ids: readonly string[]) => void,
): ColumnDef<MarketActivityLedgerEntry, any>[] {
  const selectHeaderId = `ledger-${sectionId}-col-select`;
  return [
    colHelp.display({
      id: 'select',
      header: ({ table }) => {
        const visibleEntryIds = table.getFilteredRowModel().rows.map((r) => r.original.entryId);
        return (
          <div className="flex flex-col items-center gap-1 py-0.5">
            <SelectAllHeaderCheckbox visibleEntryIds={visibleEntryIds} onToggleBulk={onBulkVisible} />
            <span className="sr-only" id={selectHeaderId}>
              Row selection
            </span>
          </div>
        );
      },
      cell: ({ row }) => {
        const id = row.original.entryId;
        return <LedgerRowSelectCheckbox sectionId={sectionId} selectHeaderId={selectHeaderId} entryId={id} />;
      },
      enableSorting: false,
      size: 28,
    }),
    colHelp.accessor('title', {
      header: 'Title',
      cell: ({ getValue, row }) => (
        <span id={`ledger-row-${sectionId}-${row.original.entryId}`} className="font-medium text-foreground">
          {getValue()}
        </span>
      ),
      filterFn: 'includesString',
    }),
    ...(options.showEntityKind
      ? [
          colHelp.accessor('entityKind', {
            header: 'Kind',
            cell: ({ getValue }) => (
              <span className="text-muted-foreground">{formatEntityKindLabel(getValue())}</span>
            ),
          }),
        ]
      : []),
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
  ];
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

function filterHolidaySourceEntries(
  entries: readonly MarketActivityLedgerEntry[],
  rawQuery: string,
): MarketActivityLedgerEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) => {
    return (
      e.title.toLowerCase().includes(q) ||
      (e.subtitle?.toLowerCase().includes(q) ?? false) ||
      e.dateStart.toLowerCase().includes(q) ||
      e.dateEnd.toLowerCase().includes(q) ||
      e.entityKind.toLowerCase().includes(q) ||
      e.entryId.toLowerCase().includes(q) ||
      e.family.toLowerCase().includes(q)
    );
  });
}

function splitLedgerEntries(entries: MarketActivityLedgerEntry[]) {
  const campaigns = entries.filter((e) => e.entityKind === 'campaign');
  const techProgrammes = entries.filter((e) => e.entityKind === 'tech_programme');
  const holidays = entries.filter(
    (e) =>
      e.entityKind === 'national_leave_band' ||
      e.entityKind === 'public_holiday_date' ||
      e.entityKind === 'school_holiday_date',
  );
  const riskAndOps = entries.filter(
    (e) =>
      e.entityKind === 'deployment_risk_event' ||
      e.entityKind === 'deployment_risk_blackout' ||
      e.entityKind === 'operating_window',
  );
  return { campaigns, techProgrammes, holidays, riskAndOps };
}

function GroupSelectCheckbox({
  entryIds,
  onToggleGroup,
  labelledBy,
}: {
  entryIds: readonly string[];
  onToggleGroup: (ids: readonly string[]) => void;
  labelledBy: string;
}) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const ref = useRef<HTMLInputElement>(null);
  const allOn = entryIds.length > 0 && entryIds.every((id) => !excludedSet.has(id));
  const someIncluded = entryIds.some((id) => !excludedSet.has(id));
  const someExcluded = entryIds.some((id) => excludedSet.has(id));
  const indeterminate = someIncluded && someExcluded;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 rounded border-input accent-primary"
      aria-labelledby={labelledBy}
      checked={allOn}
      onChange={() => onToggleGroup(entryIds)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

const holidayColHelp = createColumnHelper<HolidayLedgerGroupRow>();

function buildHolidayColumns(
  sectionId: string,
  toggleGroup: (ids: readonly string[]) => void,
  onBulkVisible: (ids: readonly string[]) => void,
  options: { showKindColumn: boolean },
): ColumnDef<HolidayLedgerGroupRow, any>[] {
  const selectHeaderId = `ledger-${sectionId}-col-select`;
  return [
    holidayColHelp.display({
      id: 'select',
      header: ({ table }) => {
        const visibleEntryIds = [
          ...new Set(table.getSortedRowModel().rows.flatMap((r) => r.original.entryIds)),
        ];
        return (
          <div className="flex flex-col items-center gap-1 py-0.5">
            <SelectAllHeaderCheckbox visibleEntryIds={visibleEntryIds} onToggleBulk={onBulkVisible} />
            <span className="sr-only" id={selectHeaderId}>
              Row selection
            </span>
          </div>
        );
      },
      cell: ({ row }) => {
        const ids = row.original.entryIds;
        const labelId = `ledger-row-${sectionId}-${row.original.groupId}`;
        return (
          <GroupSelectCheckbox entryIds={ids} onToggleGroup={toggleGroup} labelledBy={`${selectHeaderId} ${labelId}`} />
        );
      },
      enableSorting: false,
      size: 28,
    }),
    holidayColHelp.accessor('title', {
      header: 'Title',
      cell: ({ getValue, row }) => (
        <span id={`ledger-row-${sectionId}-${row.original.groupId}`} className="font-medium text-foreground">
          {getValue()}
        </span>
      ),
    }),
    ...(options.showKindColumn
      ? [
          holidayColHelp.accessor('entityKind', {
            header: 'Kind',
            cell: ({ getValue }) => (
              <span className="text-muted-foreground">{formatEntityKindLabel(String(getValue()))}</span>
            ),
          }),
        ]
      : []),
    holidayColHelp.accessor('dateStart', {
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
    holidayColHelp.display({
      id: 'lenses',
      header: 'Lenses',
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">{lensHintLabels(row.original.lensHints)}</span>
      ),
    }),
    holidayColHelp.accessor('subtitle', {
      header: 'Note',
      cell: ({ getValue }) => <span className="break-words text-muted-foreground">{getValue() ?? '—'}</span>,
    }),
  ];
}

type HolidaySubTableProps = {
  sectionId: string;
  title: string;
  description: string;
  rows: HolidayLedgerGroupRow[];
  emptyLabel: string;
};

function HolidaySubTable({ sectionId, title, description, rows, emptyLabel }: HolidaySubTableProps) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);
  const toggleGroup = useAtcStore((s) => s.toggleRunwayLedgerExcludedEntryGroup);
  const toggleBulkVisible = useAtcStore((s) => s.toggleRunwayLedgerExcludeBulkVisible);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateStart', desc: false }]);

  const columns = useMemo(
    () => buildHolidayColumns(sectionId, toggleGroup, toggleBulkVisible, { showKindColumn: false }),
    [sectionId, toggleGroup, toggleBulkVisible],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h5 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
          <span className="ml-2 font-normal text-muted-foreground">({rows.length})</span>
        </h5>
        <p className="mt-0.5 max-w-3xl text-xs leading-snug text-muted-foreground sm:text-sm">{description}</p>
      </div>
      <div className="w-full min-w-0 overflow-visible rounded-xl border border-border/40 bg-transparent dark:border-border/35">
        <table className="w-full table-auto border-collapse text-left text-sm leading-snug">
          <thead className="border-b border-border/60 bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
            {table.getSortedRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              table.getSortedRowModel().rows.map((row) => {
                const ids = row.original.entryIds;
                const sel = ids.some((id) => !excludedSet.has(id));
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/40',
                      sel && 'bg-primary/8',
                    )}
                    onClick={() => toggleGroup(ids)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-top">
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
  );
}

type HolidayLedgerSectionProps = {
  holidays: MarketActivityLedgerEntry[];
  /** When non-null, empty sub-tables use this instead of their default “no rows” copy. */
  emptyFiltered?: string | null;
};

function HolidayLedgerSection({ holidays, emptyFiltered = null }: HolidayLedgerSectionProps) {
  const [holidaySearch, setHolidaySearch] = useState('');

  const unfilteredGrouped = useMemo(() => groupHolidayLeaveLedgerRows(holidays), [holidays]);
  const mergeSavings = holidays.length - unfilteredGrouped.length;

  const filteredHolidayEntries = useMemo(
    () => filterHolidaySourceEntries(holidays, holidaySearch),
    [holidays, holidaySearch],
  );

  const holidayRows = useMemo(
    () => groupHolidayLeaveLedgerRows(filteredHolidayEntries),
    [filteredHolidayEntries],
  );

  const nationalRows = useMemo(
    () => holidayRows.filter((r) => r.entityKind === 'national_leave_band'),
    [holidayRows],
  );
  const publicRows = useMemo(
    () => holidayRows.filter((r) => r.entityKind === 'public_holiday_date'),
    [holidayRows],
  );
  const schoolRows = useMemo(
    () => holidayRows.filter((r) => r.entityKind === 'school_holiday_date'),
    [holidayRows],
  );

  const filterInputId = 'ledger-holidays-filter';
  const totalSource = holidays.length;
  const shownSource = filteredHolidayEntries.length;

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-6 overflow-visible print:break-inside-avoid"
      aria-labelledby="ledger-holidays-heading"
    >
      <div className="flex flex-col gap-2 border-b border-border/25 pb-3 dark:border-border/30 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h4 id="ledger-holidays-heading" className="text-base font-semibold tracking-tight text-foreground">
            Holidays & leave
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({nationalRows.length} leave · {publicRows.length} public · {schoolRows.length} school)
            </span>
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Three views: national capacity bands, public holiday extras, and school holiday extras. Consecutive
            public or school calendar days merge into one span per run. Search applies to all three before grouping.
          </p>
          {mergeSavings > 0 && holidaySearch.trim() === '' ? (
            <p className="mt-1 text-xs text-muted-foreground/90">
              {holidays.length} configured rows → {unfilteredGrouped.length} after merging consecutive public/school
              days.
            </p>
          ) : null}
        </div>
        <div className="w-full shrink-0 sm:w-72">
          <label htmlFor={filterInputId} className="sr-only">
            Filter holidays and leave
          </label>
          <input
            id={filterInputId}
            type="search"
            placeholder="Search holidays & leave…"
            value={holidaySearch}
            onChange={(e) => setHolidaySearch(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {holidaySearch.trim() !== '' ? (
        <p className="text-xs text-muted-foreground">
          Showing {shownSource} of {totalSource} configured rows after search; grouping runs on the filtered set.
        </p>
      ) : null}

      <div className="flex flex-col gap-8">
        <HolidaySubTable
          sectionId="holidays-national"
          title="National leave"
          description="Multi-day bands from national leave configuration (capacity and coverage)."
          rows={nationalRows}
          emptyLabel={
            emptyFiltered ??
            'No national leave bands in this market (or none match the search).'
          }
        />
        <HolidaySubTable
          sectionId="holidays-public"
          title="Public holidays"
          description="Extra public holiday dates; back-to-back calendar days are one row per contiguous run."
          rows={publicRows}
          emptyLabel={emptyFiltered ?? 'No public holiday rows (or none match the search).'}
        />
        <HolidaySubTable
          sectionId="holidays-school"
          title="School holidays"
          description="Extra school holiday dates; back-to-back calendar days are one row per contiguous run."
          rows={schoolRows}
          emptyLabel={emptyFiltered ?? 'No school holiday rows (or none match the search).'}
        />
      </div>
    </section>
  );
}

type LedgerSectionProps = {
  sectionId: string;
  title: string;
  description?: string;
  entries: MarketActivityLedgerEntry[];
  showEntityKind: boolean;
  emptyLabel: string;
  filterPlaceholder: string;
};

function LedgerSection({
  sectionId,
  title,
  description,
  entries,
  showEntityKind,
  emptyLabel,
  filterPlaceholder,
}: LedgerSectionProps) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const toggleExcluded = useAtcStore((s) => s.toggleRunwayLedgerExcludedEntryId);
  const toggleBulkVisible = useAtcStore((s) => s.toggleRunwayLedgerExcludeBulkVisible);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'dateStart', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => buildColumns(sectionId, { showEntityKind }, toggleBulkVisible),
    [sectionId, showEntityKind, toggleBulkVisible],
  );

  const table = useReactTable({
    data: entries,
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
        e.family.toLowerCase().includes(q)
      );
    },
  });

  const filterInputId = `ledger-${sectionId}-filter`;

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-3 overflow-visible print:break-inside-avoid"
      aria-labelledby={`ledger-${sectionId}-heading`}
    >
      <div className="flex flex-col gap-2 border-b border-border/25 pb-3 dark:border-border/30 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h4 id={`ledger-${sectionId}-heading`} className="text-base font-semibold tracking-tight text-foreground">
            {title}
            <span className="ml-2 text-sm font-normal text-muted-foreground">({entries.length})</span>
          </h4>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="w-full shrink-0 sm:w-72">
          <label htmlFor={filterInputId} className="sr-only">
            Filter {title}
          </label>
          <input
            id={filterInputId}
            type="search"
            placeholder={filterPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      <div className="w-full min-w-0 overflow-visible rounded-xl border border-border/40 bg-transparent dark:border-border/35">
        <table className="w-full table-auto border-collapse text-left text-sm leading-snug">
          <thead className="border-b border-border/60 bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {entries.length === 0 ? emptyLabel : 'No rows match this filter.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const sel = !excludedIds.includes(row.original.entryId);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/40',
                      sel && 'bg-primary/8',
                    )}
                    onClick={() => toggleExcluded(row.original.entryId)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-top">
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
    </section>
  );
}

type RunwayActivityLedgerTableProps = {
  ledger: MarketActivityLedger;
  className?: string;
  /** When set (heatmap day selected), tables only list rows that touch this day for this lens. */
  dayRowFilter?: RunwayLedgerDayRowFilter | null;
};

export function RunwayActivityLedgerTable({ ledger, className, dayRowFilter = null }: RunwayActivityLedgerTableProps) {
  const excludedIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const clearExclusions = useAtcStore((s) => s.clearRunwayLedgerExclusions);
  const implicitBaselineFootprint = useAtcStore((s) => s.runwayLedgerImplicitBaselineFootprint);
  const setImplicitBaselineFootprint = useAtcStore((s) => s.setRunwayLedgerImplicitBaselineFootprint);

  const contributorIdSet = useMemo(() => {
    if (!dayRowFilter) return null;
    return new Set(ledgerEntryIdsContributingToDay(ledger, dayRowFilter.dayYmd, dayRowFilter.lensView));
  }, [ledger, dayRowFilter]);

  const entriesForSections = useMemo(() => {
    if (!contributorIdSet) return ledger.entries;
    return ledger.entries.filter((e) => contributorIdSet.has(e.entryId));
  }, [ledger.entries, contributorIdSet]);

  const { campaigns, techProgrammes, holidays, riskAndOps } = useMemo(
    () => splitLedgerEntries(entriesForSections),
    [entriesForSections],
  );

  const emptyFiltered = 'No rows touch this day for the current lens.';

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-10 overflow-visible', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Activity ledger</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Each ledger group has its own sortable table; holidays share one search across national, public, and
            school views. Uncheck a row to remove it from the cumulative heatmap and sparkline bands (everything counts
            by default). Footprint overlap counts listed rows only; optional baseline fills days with zero rows without
            double-counting days that already hit named activities.
          </p>
          {dayRowFilter ? (
            <p className="mt-2 max-w-3xl text-xs leading-snug text-muted-foreground">
              Showing only rows that touch{' '}
              <span className="font-mono tabular-nums text-foreground/90">{dayRowFilter.dayYmd}</span> for{' '}
              <span className="font-medium text-foreground/90">
                {runwayLensProductLabel(dayRowFilter.lensView)}
              </span>
              .
            </p>
          ) : null}
        </div>
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 sm:w-auto sm:items-end">
          <label className="flex max-w-md cursor-pointer gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:max-w-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
              checked={implicitBaselineFootprint}
              onChange={(e) => setImplicitBaselineFootprint(e.target.checked)}
              aria-describedby="ledger-baseline-footprint-hint"
            />
            <span className="min-w-0 text-sm leading-snug text-foreground">
              <span className="font-medium">Implicit baseline on empty days</span>
              <span id="ledger-baseline-footprint-hint" className="mt-1 block text-xs text-muted-foreground">
                When no ledger row spans a day, count one baseline stratum so the heatmap keeps full model colour
                (always-on rhythm is in the YAML engine, not as table rows). Days with any listed row keep the same
                overlap depth.
              </span>
            </span>
          </label>
          {excludedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => clearExclusions()}
              className="h-9 w-full shrink-0 rounded-md border border-border bg-muted/40 px-3 text-sm font-medium text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:self-end"
            >
              Include all events ({excludedIds.length} hidden)
            </button>
          ) : null}
        </div>
      </div>

      <LedgerSection
        sectionId="campaigns"
        title="Campaigns"
        description="Commercial campaigns with prep and live windows as modelled for demand and tech load."
        entries={campaigns}
        showEntityKind={false}
        emptyLabel={contributorIdSet ? emptyFiltered : 'No campaigns in this market configuration.'}
        filterPlaceholder="Filter campaigns…"
      />

      <LedgerSection
        sectionId="tech"
        title="Tech programmes"
        description="Technology delivery programmes and their footprint on the runway."
        entries={techProgrammes}
        showEntityKind={false}
        emptyLabel={contributorIdSet ? emptyFiltered : 'No tech programmes in this market configuration.'}
        filterPlaceholder="Filter tech programmes…"
      />

      <HolidayLedgerSection holidays={holidays} emptyFiltered={contributorIdSet ? emptyFiltered : null} />

      <LedgerSection
        sectionId="risk-ops"
        title="Risk & operating windows"
        description="Deployment risk events and blackouts, plus operating windows that scale trading or lab capacity."
        entries={riskAndOps}
        showEntityKind
        emptyLabel={
          contributorIdSet ? emptyFiltered : 'No deployment risk or operating window rows in this market configuration.'
        }
        filterPlaceholder="Filter risk & windows…"
      />

      <p className="text-sm leading-relaxed text-muted-foreground">
        By default every row contributes to the cumulative ledger footprint on the heatmaps and sparklines above.
        Uncheck rows to subtract them. The implicit-baseline control is separate: it only changes days with zero
        overlapping rows. Selecting a day on the heatmap filters this list to rows that touch that day for the active
        lens and updates checkboxes; use “Include all events” to widen the footprint again. Clear the day selection to
        show the full ledger tables.
      </p>
    </div>
  );
}
