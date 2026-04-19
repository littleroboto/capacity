import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { RunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';
import { runwayLensProductLabel } from '@/lib/constants';
import { cn } from '@/lib/utils';

export type CellRuleRow = {
  id: string;
  /** Preserves model order when the table is unsorted or after clearing sorts. */
  order: number;
  category: string;
  rule: string;
  /** Human-readable influence (numeric sort uses influenceSort). */
  influence: string;
  influenceSort: number;
};

function contributorShortLabel(label: string): string {
  return label
    .replace(/\s*\(this heatmap\)\s*/i, '')
    .replace(/\s*\(heatmap\)\s*/i, '')
    .replace(/\s*\(live campaigns[^)]*\)\s*/i, '')
    .trim();
}

function buildRuleRows(p: RunwayTooltipPayload): CellRuleRow[] {
  const rows: CellRuleRow[] = [];
  let order = 0;
  const terms = [...p.riskTerms];
  const blendSum = terms.reduce((acc, t) => acc + t.contribution, 0);
  const denom = blendSum > 1e-9 ? blendSum : 1;

  for (const t of terms) {
    const share = (t.contribution / denom) * 100;
    const levelPct = Math.round(Math.min(1, Math.max(0, t.factor)) * 100);
    const isHolidayDial = t.key === 'holiday';
    let influence: string;
    if (p.viewMode === 'market_risk') {
      influence = `${Math.round(share)}% of score · ~${levelPct}% on factor scale`;
    } else if (isHolidayDial) {
      influence = t.factor >= 0.5 ? 'On' : '—';
    } else {
      influence = `${Math.round(share)}% of blend · ~${levelPct}% · w ${(t.weight * 100).toFixed(0)}%`;
    }
    rows.push({
      id: `mix-${t.key}`,
      order: order++,
      category: 'Planning blend',
      rule: contributorShortLabel(t.label),
      influence,
      influenceSort: t.contribution,
    });
  }

  if (p.viewMode === 'market_risk' && p.deploymentRiskLine?.trim()) {
    rows.push({
      id: 'deployment-summary',
      order: order++,
      category: 'Deployment risk',
      rule: p.deploymentRiskLine.trim(),
      influence: '—',
      influenceSort: 0,
    });
  }

  for (const block of p.driverSummaryBlocks) {
    block.bullets.forEach((b, i) => {
      const text = b.trim();
      if (!text) return;
      rows.push({
        id: `drv-${block.heading}-${i}`,
        order: order++,
        category: block.heading,
        rule: text,
        influence: '—',
        influenceSort: 0,
      });
    });
  }

  return rows;
}

const colHelp = createColumnHelper<CellRuleRow>();

export function RunwayDayCellRulesTable({
  payload,
  className,
}: {
  payload: RunwayTooltipPayload;
  className?: string;
}) {
  const data = useMemo(() => buildRuleRows(payload), [payload]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'order', desc: false }]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => [
      colHelp.accessor('category', {
        header: 'Category',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground">{getValue() as string}</span>
        ),
        filterFn: 'includesString',
        sortingFn: 'alphanumeric',
      }),
      colHelp.accessor('rule', {
        header: 'Rule / driver',
        cell: ({ getValue }) => (
          <span className="text-foreground/95 [overflow-wrap:anywhere]">{getValue() as string}</span>
        ),
        filterFn: 'includesString',
      }),
      colHelp.accessor((row) => row.influenceSort, {
        id: 'influenceVal',
        header: 'Mix / level',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">{row.original.influence}</span>
        ),
        sortingFn: 'basic',
      }),
      colHelp.accessor('order', {
        header: 'Order',
        cell: () => null,
        enableHiding: true,
        sortingFn: 'basic',
      }),
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility: { order: false } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).trim().toLowerCase();
      if (!q) return true;
      const r = row.original;
      return (
        r.category.toLowerCase().includes(q) ||
        r.rule.toLowerCase().includes(q) ||
        r.influence.toLowerCase().includes(q)
      );
    },
  });

  const filterId = 'runway-cell-rules-filter';
  const lensLabel = runwayLensProductLabel(payload.viewMode);

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cell rules
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Model inputs and blend terms for this cell ({lensLabel}). Search matches any column.
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-56">
          <label htmlFor={filterId} className="sr-only">
            Search rules
          </label>
          <input
            id={filterId}
            type="search"
            placeholder="Search…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border/40 dark:border-border/35">
        <table className="w-full table-fixed border-collapse text-left text-[11px] leading-snug">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[56%]" />
            <col className="w-[22%]" />
          </colgroup>
          <thead className="border-b border-border/60 bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  if (!header.column.getIsVisible()) return null;
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex max-w-full items-center gap-0.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                  No rows match this search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {table.getFilteredRowModel().rows.length} of {data.length} rows
        {globalFilter.trim() ? ' (filtered)' : ''}.
      </p>
    </div>
  );
}
