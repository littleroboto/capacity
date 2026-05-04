import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type FilterFn,
  type HeaderContext,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getColumnsForTable, type FragmentSchemaColumn } from '@/pages/admin/fragmentTableSchema';
import {
  clearFragmentColumnVisibility,
  fragmentColumnPrefsStorageKey,
  readFragmentColumnVisibility,
  writeFragmentColumnVisibility,
  type FragmentColumnVisibility,
} from '@/pages/admin/fragmentTableColumnPrefs';

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
  return String(val);
}

/** Shared sortable header for TanStack columns (Build / YAML preview / Audit / fragment grid). */
export function SortHeader<TData>({
  column,
  children,
  title,
}: {
  column: HeaderContext<TData, unknown>['column'];
  children: ReactNode;
  title?: string;
}) {
  if (!column.getCanSort()) {
    return <span title={title}>{children}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      title={title}
      className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={column.getToggleSortingHandler()}
    >
      {children}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );
}

type FragmentTableMeta = {
  schema: FragmentSchemaColumn[];
  editingRowId: string | null;
  setEditingRowId: (id: string | null) => void;
  editValues: Record<string, unknown>;
  setEditValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  startEdit: (frag: Record<string, unknown>) => void;
  saving: string | null;
  onSave: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => void;
  onArchive: (fragment: Record<string, unknown>) => void;
};

export function FragmentTableSkeleton({ table }: { table: string }) {
  const n = getColumnsForTable(table).length + 3;
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading fragments">
      <div className="h-9 max-w-md animate-pulse rounded-md bg-muted" />
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {Array.from({ length: n }, (_, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, ri) => (
              <tr key={ri} className="border-b border-border last:border-b-0">
                {Array.from({ length: n }, (_, ci) => (
                  <td key={ci} className="px-3 py-2">
                    <div
                      className="h-4 animate-pulse rounded bg-muted"
                      style={{ width: `${40 + (ci % 4) * 20}px` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sr-only">Loading fragment list…</p>
    </div>
  );
}

export function FragmentTable({
  fragments,
  loading,
  table,
  prefsScope,
  saving,
  onSave,
  onArchive,
}: {
  fragments: Record<string, unknown>[];
  loading: boolean;
  table: string;
  /** Key for persisted column visibility (per market + URL entity + fragment table name). */
  prefsScope: { marketId: string; entity: string };
  saving: string | null;
  onSave: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => void;
  onArchive: (fragment: Record<string, unknown>) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const visible = useMemo(
    () => (showArchived ? fragments : fragments.filter((f) => String(f.status) !== 'archived')),
    [fragments, showArchived]
  );

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [columnVisibility, setColumnVisibility] = useState<FragmentColumnVisibility>({});
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);

  const schema = useMemo(() => getColumnsForTable(table), [table]);

  const allowedColumnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of schema) ids.add(c.key);
    ids.add('version');
    ids.add('status');
    return ids;
  }, [schema]);

  const columnPrefsKey = useMemo(
    () => fragmentColumnPrefsStorageKey(prefsScope.marketId, prefsScope.entity, table),
    [prefsScope.marketId, prefsScope.entity, table]
  );

  useEffect(() => {
    setColumnVisibility(readFragmentColumnVisibility(columnPrefsKey, allowedColumnIds));
  }, [columnPrefsKey, allowedColumnIds]);

  const onColumnVisibilityChange = useCallback(
    (updater: FragmentColumnVisibility | ((prev: FragmentColumnVisibility) => FragmentColumnVisibility)) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        writeFragmentColumnVisibility(columnPrefsKey, next);
        return next;
      });
    },
    [columnPrefsKey]
  );

  const resetColumnVisibility = useCallback(() => {
    clearFragmentColumnVisibility(columnPrefsKey);
    setColumnVisibility({});
  }, [columnPrefsKey]);

  const columnPickerRows = useMemo(
    () =>
      [
        ...schema.map((c) => ({ id: c.key, label: c.label })),
        { id: 'version', label: 'Version' },
        { id: 'status', label: 'Status' },
      ] as const,
    [schema]
  );

  const isDataColumnVisible = useCallback(
    (id: string) => columnVisibility[id] !== false,
    [columnVisibility]
  );

  const startEdit = useCallback(
    (frag: Record<string, unknown>) => {
      const vals: Record<string, unknown> = {};
      for (const col of schema) {
        if (col.editable) vals[col.key] = frag[col.key];
      }
      setEditValues(vals);
      setEditingRowId(String(frag.id));
    },
    [schema]
  );

  const fragmentGlobalFilterFn: FilterFn<Record<string, unknown>> = useCallback(
    (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '')
        .trim()
        .toLowerCase();
      if (!q) return true;
      const f = row.original;
      const bits: string[] = [];
      for (const c of schema) {
        if (columnVisibility[c.key] === false) continue;
        bits.push(formatValue(f[c.key]));
      }
      if (columnVisibility.version !== false) bits.push(String(f.version_number ?? ''));
      if (columnVisibility.status !== false) bits.push(String(f.status ?? ''));
      return bits.join(' ').toLowerCase().includes(q);
    },
    [schema, columnVisibility]
  );

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const dataCols: ColumnDef<Record<string, unknown>>[] = schema.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => <SortHeader column={column}>{col.label}</SortHeader>,
      cell: ({ row, table: tbl }) => {
        const meta = tbl.options.meta as FragmentTableMeta;
        const frag = row.original;
        const editing = meta.editingRowId === String(frag.id);
        if (editing && col.editable) {
          return (
            <input
              type="text"
              value={String(meta.editValues[col.key] ?? '')}
              onChange={(e) => meta.setEditValues((prev) => ({ ...prev, [col.key]: e.target.value }))}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          );
        }
        return <span className="text-sm">{formatValue(frag[col.key])}</span>;
      },
      sortingFn: 'alphanumeric',
    }));

    return [
      ...dataCols,
      {
        id: 'version',
        accessorKey: 'version_number',
        header: ({ column }) => <SortHeader column={column}>Ver</SortHeader>,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">v{String(row.original.version_number)}</span>
        ),
        sortingFn: 'basic',
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              row.original.status === 'active'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {String(row.original.status)}
          </span>
        ),
        sortingFn: 'alphanumeric',
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => (
          <span className="block w-full text-right" title="Row actions">
            Actions
          </span>
        ),
        cell: ({ row, table: tbl }) => {
          const meta = tbl.options.meta as FragmentTableMeta;
          const frag = row.original;
          const rowSaving = meta.saving === frag.id;
          const editing = meta.editingRowId === String(frag.id);
          const rowLabel =
            typeof frag.name === 'string' && frag.name.trim()
              ? frag.name.trim()
              : typeof frag.label === 'string' && frag.label.trim()
                ? frag.label.trim()
                : String(frag.id ?? 'row');
          if (editing) {
            return (
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    meta.onSave(frag, meta.editValues);
                    meta.setEditingRowId(null);
                    meta.setEditValues({});
                  }}
                  disabled={rowSaving}
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {rowSaving ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    meta.setEditingRowId(null);
                    meta.setEditValues({});
                  }}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            );
          }
          const canArchive = String(frag.status) !== 'archived';
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    aria-label={`Actions for ${rowLabel}`}
                    disabled={rowSaving}
                  >
                    <MoreHorizontal className="h-4 w-4 opacity-80" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="text-sm"
                    onSelect={() => {
                      meta.startEdit(frag);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  {canArchive ? (
                    <DropdownMenuItem
                      className="text-sm"
                      destructive
                      disabled={rowSaving}
                      onSelect={() => {
                        meta.onArchive(frag);
                      }}
                    >
                      Archive
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
  }, [schema]);

  const meta: FragmentTableMeta = useMemo(
    () => ({
      schema,
      editingRowId,
      setEditingRowId,
      editValues,
      setEditValues,
      startEdit,
      saving,
      onSave,
      onArchive,
    }),
    [schema, editingRowId, editValues, saving, onSave, onArchive, startEdit]
  );

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [globalFilter, visible, table, columnVisibility]);

  useEffect(() => {
    setSorting((prev) => prev.filter((s) => columnVisibility[s.id] !== false));
  }, [columnVisibility]);

  const tableInstance = useReactTable({
    data: visible,
    columns,
    state: { sorting, globalFilter, pagination, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: fragmentGlobalFilterFn,
    meta,
  });

  if (loading) return <FragmentTableSkeleton table={table} />;
  if (fragments.length === 0) return <div className="py-8 text-center text-muted-foreground">No fragments found</div>;
  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border"
          />
          Show archived records
        </label>
        <div className="py-8 text-center text-muted-foreground">
          No active or draft records. Enable &quot;Show archived&quot; to see archived rows.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="rounded border-border"
        />
        Show archived records
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="fragment-table-filter" className="sr-only">
            Filter rows
          </label>
          <input
            id="fragment-table-filter"
            type="search"
            placeholder="Filter…"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={columnsPanelOpen}
              aria-controls="fragment-column-visibility-panel"
              onClick={() => setColumnsPanelOpen((o) => !o)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Columns3 className="h-4 w-4 opacity-70" aria-hidden />
              Columns
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {tableInstance.getFilteredRowModel().rows.length} of {visible.length}
        </p>
      </div>
      {columnsPanelOpen ? (
        <div
          id="fragment-column-visibility-panel"
          role="group"
          aria-label="Column visibility"
          className="rounded-lg border border-border bg-muted/20 px-3 py-3"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Show or hide columns</span>
            <button
              type="button"
              onClick={resetColumnVisibility}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Reset to default
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {columnPickerRows.map(({ id, label }) => (
              <label key={id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={isDataColumnVisible(id)}
                  onChange={() => {
                    onColumnVisibilityChange((old) => {
                      const next = { ...old };
                      if (next[id] === false) {
                        delete next[id];
                      } else {
                        next[id] = false;
                      }
                      return next;
                    });
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="max-h-[min(70vh,52rem)] overflow-y-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
              {tableInstance.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {tableInstance.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, tableInstance.getVisibleLeafColumns().length)}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                tableInstance.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-muted/15 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page {tableInstance.getState().pagination.pageIndex + 1} of{' '}
            {Math.max(1, tableInstance.getPageCount())} · {tableInstance.getFilteredRowModel().rows.length} row(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={tableInstance.getState().pagination.pageSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  tableInstance.setPageSize(n);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted disabled:opacity-40"
                disabled={!tableInstance.getCanPreviousPage()}
                onClick={() => tableInstance.previousPage()}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted disabled:opacity-40"
                disabled={!tableInstance.getCanNextPage()}
                onClick={() => tableInstance.nextPage()}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
