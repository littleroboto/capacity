import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type FilterFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { adminMarketEntityPath, DEFAULT_ADMIN_MARKET_ENTITY } from '@/pages/admin/adminMarketTabs';
import { cn } from '@/lib/utils';

export interface AdminMarketRow {
  id: string;
  label: string;
  segment_id: string;
  country_code: string;
  operating_model_id?: string | null;
  latestBuildStatus: string | null;
  latestBuildDate: string | null;
  validationErrors: number;
  segments?: { label: string };
}

function workbenchHref(marketId: string): string {
  const q = new URLSearchParams({ market: marketId });
  return `/app?${q.toString()}`;
}

const adminMarketsGlobalFilter: FilterFn<AdminMarketRow> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const m = row.original;
  const segment = (m.segments?.label ?? m.segment_id ?? '').toLowerCase();
  const hay = [
    m.id,
    m.label,
    m.country_code,
    m.segment_id,
    segment,
    m.latestBuildStatus ?? '',
    m.latestBuildDate ?? '',
    String(m.validationErrors),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

const columns: ColumnDef<AdminMarketRow>[] = [
  {
    accessorKey: 'id',
    header: 'Code',
    cell: ({ row }) => {
      const id = row.original.id;
      return (
        <Link
          to={workbenchHref(id)}
          className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <MarketCircleFlag marketId={id} size={18} className="ring-border/40" />
          {id}
        </Link>
      );
    },
    sortingFn: 'alphanumeric',
  },
  {
    accessorKey: 'label',
    header: 'Name',
    cell: ({ row }) => {
      const { id, label } = row.original;
      return (
        <Link to={workbenchHref(id)} className="text-foreground underline-offset-4 hover:underline">
          {label}
        </Link>
      );
    },
    sortingFn: 'alphanumeric',
  },
  {
    id: 'segment',
    accessorFn: (row) => row.segments?.label ?? row.segment_id,
    header: 'Segment',
    cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span>,
    sortingFn: 'alphanumeric',
  },
  {
    id: 'lastBuild',
    accessorFn: (row) => row.latestBuildDate ?? '',
    header: 'Last build',
    enableSorting: true,
    cell: ({ row }) => {
      const m = row.original;
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {m.latestBuildStatus ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                m.latestBuildStatus === 'published' &&
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                m.latestBuildStatus === 'validated' &&
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                m.latestBuildStatus === 'failed' &&
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                !['published', 'validated', 'failed'].includes(m.latestBuildStatus) &&
                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {m.latestBuildStatus}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {m.latestBuildDate ? (
            <span className="text-xs text-muted-foreground">{new Date(m.latestBuildDate).toLocaleDateString()}</span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: 'validationErrors',
    header: () => <span className="block w-full text-right">Issues</span>,
    cell: ({ getValue }) => {
      const n = Number(getValue());
      if (n > 0) {
        return (
          <div className="text-right">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {n}
            </span>
          </div>
        );
      }
      return <div className="text-right text-xs text-muted-foreground">0</div>;
    },
  },
  {
    id: 'actions',
    header: () => <span className="block w-full text-right">Actions</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <Link
          to={workbenchHref(row.original.id)}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          Workbench
        </Link>
        <Link
          to={adminMarketEntityPath(row.original.id, DEFAULT_ADMIN_MARKET_ENTITY)}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Configure
        </Link>
      </div>
    ),
  },
];

export function AdminMarketsDataTable({ data }: { data: AdminMarketRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: false }]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: adminMarketsGlobalFilter,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="admin-markets-filter" className="sr-only">
          Filter markets
        </label>
        <input
          id="admin-markets-filter"
          type="search"
          placeholder="Filter by code, name, segment, build…"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="text-xs text-muted-foreground">
          Showing {table.getFilteredRowModel().rows.length} of {data.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/50">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} className="px-4 py-3 text-left font-medium">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                          )}
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
                <td colSpan={table.getAllColumns().length} className="px-4 py-8 text-center text-muted-foreground">
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminMarketsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading markets">
      <div className="h-9 max-w-md animate-pulse rounded-md bg-muted" />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Code', 'Name', 'Segment', 'Last build', 'Issues', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-[18px] w-[18px] shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="ml-auto h-5 w-8 animate-pulse rounded-full bg-muted" />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="ml-auto flex justify-end gap-2">
                    <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
                    <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sr-only">Loading market list…</p>
    </div>
  );
}
