import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type FilterFn,
  type HeaderContext,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { HolidayCalendarsEditor } from '@/pages/admin/HolidayCalendarsEditor';
import {
  fetchFragments,
  fetchMarkets,
  updateFragmentApi,
  deleteFragmentApi,
  buildMarketApi,
  publishBuildApi,
  fetchBuilds,
  fetchConfigYaml,
  validateMarketApi,
  fetchAuditLog,
  previewYamlImport,
  applyYamlImport,
} from '@/lib/adminApi';
import { AdminCampaignCreate } from '@/pages/admin/AdminCampaignCreate';
import { AdminTechProgrammeCreate } from '@/pages/admin/AdminTechProgrammeCreate';
import type { AdminMarketRow } from '@/pages/admin/AdminMarketsDataTable';

const TABS = [
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

type SchemaCol = { key: string; label: string; editable?: boolean };

function getColumnsForTable(table: string): SchemaCol[] {
  switch (table) {
    case 'campaign_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'duration_days', label: 'Duration', editable: true },
        { key: 'promo_weight', label: 'Weight', editable: true },
        { key: 'impact', label: 'Impact', editable: true },
      ];
    case 'tech_programme_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'duration_days', label: 'Duration', editable: true },
      ];
    case 'resource_configs':
      return [
        { key: 'labs_capacity', label: 'Labs', editable: true },
        { key: 'staff_capacity', label: 'Staff', editable: true },
        { key: 'testing_capacity', label: 'Testing', editable: true },
      ];
    case 'bau_configs':
      return [
        { key: 'days_in_use', label: 'Days In Use' },
        { key: 'weekly_cycle', label: 'Weekly Cycle' },
      ];
    case 'trading_configs':
      return [
        { key: 'campaign_effect_scale', label: 'Effect Scale', editable: true },
        { key: 'payday_month_peak_multiplier', label: 'Payday Mult', editable: true },
        { key: 'campaign_store_boost_live', label: 'Boost Live', editable: true },
      ];
    case 'holiday_calendars':
      return [
        { key: 'calendar_type', label: 'Type' },
        { key: 'auto_import', label: 'Auto Import' },
        { key: 'staffing_multiplier', label: 'Staff Mult', editable: true },
        { key: 'trading_multiplier', label: 'Trade Mult', editable: true },
      ];
    case 'national_leave_band_configs':
      return [
        { key: 'label', label: 'Label', editable: true },
        { key: 'from_date', label: 'From', editable: true },
        { key: 'to_date', label: 'To', editable: true },
        { key: 'capacity_multiplier', label: 'Multiplier', editable: true },
      ];
    case 'deployment_risk_configs':
      return [{ key: 'deployment_risk_week_weight', label: 'Week Weight', editable: true }];
    case 'operating_window_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'end_date', label: 'End', editable: true },
      ];
    default:
      return [{ key: 'id', label: 'ID' }];
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
  return String(val);
}

function SortHeader<TData>({
  column,
  children,
  title,
}: {
  column: HeaderContext<TData, unknown>['column'];
  children: React.ReactNode;
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
  schema: SchemaCol[];
  editingRowId: string | null;
  setEditingRowId: (id: string | null) => void;
  editValues: Record<string, unknown>;
  setEditValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  startEdit: (frag: Record<string, unknown>) => void;
  saving: string | null;
  onSave: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => void;
  onArchive: (fragment: Record<string, unknown>) => void;
};

function FragmentTableSkeleton({ table }: { table: string }) {
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
                    <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${40 + (ci % 4) * 20}px` }} />
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

export function AdminMarketDetail() {
  const { id: marketId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [fragments, setFragments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [marketRow, setMarketRow] = useState<AdminMarketRow | null>(null);

  // Build state
  const [builds, setBuilds] = useState<Record<string, unknown>[]>([]);
  const [buildLoading, setBuildLoading] = useState(false);

  // YAML state
  const [yamlContent, setYamlContent] = useState('');

  // Audit state
  const [auditEvents, setAuditEvents] = useState<Record<string, unknown>[]>([]);

  const currentTable = TABS.find(t => t.key === activeTab)?.table || '';

  const loadFragments = useCallback(async () => {
    if (!marketId || !currentTable) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFragments(currentTable, marketId);
      setFragments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [marketId, currentTable]);

  useEffect(() => {
    if (!marketId) {
      setMarketRow(null);
      return;
    }
    let cancelled = false;
    fetchMarkets()
      .then((rows) => {
        if (cancelled) return;
        const m = (rows as AdminMarketRow[]).find((r) => r.id === marketId);
        setMarketRow(m ?? null);
      })
      .catch(() => {
        if (!cancelled) setMarketRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  useEffect(() => {
    if (activeTab === 'build') {
      if (!marketId) return;
      setBuildLoading(true);
      fetchBuilds(marketId).then(setBuilds).catch(() => {}).finally(() => setBuildLoading(false));
    } else if (activeTab === 'yaml') {
      if (!marketId) return;
      setLoading(true);
      fetchConfigYaml(marketId).then(setYamlContent).catch((e) => setYamlContent(`Error: ${e.message}`)).finally(() => setLoading(false));
    } else if (activeTab === 'audit') {
      if (!marketId) return;
      setLoading(true);
      fetchAuditLog(marketId, 100).then(setAuditEvents).catch(() => {}).finally(() => setLoading(false));
    } else {
      loadFragments();
    }
  }, [activeTab, marketId, loadFragments]);

  const fragmentVersion = (f: Record<string, unknown>) => {
    const raw = f.version_number ?? f.versionNumber;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  const handleSave = async (fragment: Record<string, unknown>, updates: Record<string, unknown>) => {
    const id = fragment.id as string;
    setSaving(id);
    setSaveMessage(null);
    try {
      await updateFragmentApi(currentTable, id, {
        ...updates,
        expectedVersion: fragmentVersion(fragment),
      });
      setSaveMessage({ type: 'success', text: 'Saved successfully' });
      await loadFragments();
    } catch (e) {
      const err = e as Error & { code?: string };
      setSaveMessage({
        type: 'error',
        text: err.code === 'conflict' ? 'Conflict: someone else edited this. Reload and try again.' : err.message,
      });
    } finally {
      setSaving(null);
    }
  };

  const handleArchive = async (fragment: Record<string, unknown>) => {
    const id = fragment.id as string;
    const v = fragmentVersion(fragment);
    if (!Number.isFinite(v)) {
      setSaveMessage({ type: 'error', text: 'Cannot archive: missing version. Reload and try again.' });
      return;
    }
    const label = String(
      fragment.name ?? fragment.calendar_type ?? fragment.title ?? fragment.id ?? 'this record',
    );
    if (!window.confirm(`Archive "${label}"? It will be excluded from new builds until edited back to active or draft.`)) {
      return;
    }
    setSaving(id);
    setSaveMessage(null);
    try {
      await deleteFragmentApi(currentTable, id, v);
      setSaveMessage({ type: 'success', text: 'Archived successfully' });
      await loadFragments();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const conflict = /conflict|409/i.test(msg);
      setSaveMessage({
        type: 'error',
        text: conflict ? 'Conflict: someone else edited this. Reload and try again.' : msg,
      });
    } finally {
      setSaving(null);
    }
  };

  const handleBuild = async () => {
    if (!marketId) return;
    setBuildLoading(true);
    try {
      await buildMarketApi(marketId);
      const updated = await fetchBuilds(marketId);
      setBuilds(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuildLoading(false);
    }
  };

  const handlePublish = async (buildId: string) => {
    setBuildLoading(true);
    try {
      await publishBuildApi(buildId);
      if (marketId) {
        const updated = await fetchBuilds(marketId);
        setBuilds(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuildLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const report = await validateMarketApi(marketId);
      setSaveMessage({
        type: report.isValid ? 'success' : 'error',
        text: `Validation: ${report.errorCount} errors, ${report.warningCount} warnings`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Markets</Link>
          <h1 className="text-2xl font-semibold">{marketId}</h1>
        </div>
        <button
          onClick={handleValidate}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Validate
        </button>
      </div>

      {saveMessage && (
        <div className={`mb-4 rounded-md p-3 text-sm ${
          saveMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {saveMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSaveMessage(null); }}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {error && <div className="mb-4 text-sm text-red-500">{error}</div>}

      {activeTab === 'build' ? (
        <BuildTab
          builds={builds}
          loading={buildLoading}
          onBuild={handleBuild}
          onPublish={handlePublish}
        />
      ) : activeTab === 'yaml' ? (
        <YamlTab content={yamlContent} loading={loading} marketId={marketId || ''} />
      ) : activeTab === 'audit' ? (
        <AuditTab events={auditEvents} loading={loading} />
      ) : activeTab === 'holidays' ? (
        <HolidayCalendarsEditor
          fragments={fragments}
          loading={loading}
          saving={saving}
          onSave={handleSave}
          onArchive={handleArchive}
          onRefresh={loadFragments}
        />
      ) : (
        <>
          {activeTab === 'campaigns' && marketRow ? (
            <AdminCampaignCreate
              market={marketRow}
              onCreated={() => {
                void loadFragments();
              }}
            />
          ) : null}
          {activeTab === 'tech' && marketRow ? (
            <AdminTechProgrammeCreate
              market={marketRow}
              onCreated={() => {
                void loadFragments();
              }}
            />
          ) : null}
          <FragmentTable
            fragments={fragments}
            loading={loading}
            table={currentTable}
            saving={saving}
            onSave={handleSave}
            onArchive={handleArchive}
          />
        </>
      )}
    </div>
  );
}

function FragmentTable({
  fragments,
  loading,
  table,
  saving,
  onSave,
  onArchive,
}: {
  fragments: Record<string, unknown>[];
  loading: boolean;
  table: string;
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

  const schema = useMemo(() => getColumnsForTable(table), [table]);

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
      const bits = schema.map((c) => formatValue(f[c.key])).concat(String(f.status ?? ''), String(f.version_number ?? ''));
      return bits.join(' ').toLowerCase().includes(q);
    },
    [schema]
  );

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const dataCols: ColumnDef<Record<string, unknown>>[] = schema.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => <SortHeader column={column}>{col.label}</SortHeader>,
      cell: ({ row, table }) => {
        const meta = table.options.meta as FragmentTableMeta;
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
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => <span className="block w-full text-right">Actions</span>,
        cell: ({ row, table }) => {
          const meta = table.options.meta as FragmentTableMeta;
          const frag = row.original;
          const rowSaving = meta.saving === frag.id;
          const editing = meta.editingRowId === String(frag.id);
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
          return (
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => meta.startEdit(frag)}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                Edit
              </button>
              {String(frag.status) !== 'archived' && (
                <button
                  type="button"
                  onClick={() => meta.onArchive(frag)}
                  disabled={rowSaving}
                  className="rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Archive
                </button>
              )}
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

  const tableInstance = useReactTable({
    data: visible,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="text-xs text-muted-foreground">
          Showing {tableInstance.getFilteredRowModel().rows.length} of {visible.length}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            {tableInstance.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/50">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableInstance.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
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
    </div>
  );
}

function BuildTab({
  builds,
  loading,
  onBuild,
  onPublish,
}: {
  builds: Record<string, unknown>[];
  loading: boolean;
  onBuild: () => void;
  onPublish: (buildId: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () => [
      {
        id: 'build_number',
        accessorKey: 'build_number',
        header: ({ column }) => <SortHeader column={column}>Build #</SortHeader>,
        cell: ({ row }) => <span>#{String(row.original.build_number)}</span>,
        sortingFn: 'basic',
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                b.status === 'published'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : b.status === 'validated'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : b.status === 'failed'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {String(b.status)}
            </span>
          );
        },
        sortingFn: 'alphanumeric',
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{new Date(row.original.created_at as string).toLocaleString()}</span>
        ),
        sortingFn: 'alphanumeric',
      },
      {
        id: 'actions',
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => <span className="block w-full text-right">Actions</span>,
        cell: ({ row, table }) => {
          const b = row.original;
          const busy = (table.options.meta as { loading: boolean }).loading;
          if (b.status !== 'validated') return null;
          return (
            <div className="text-right">
              <button
                type="button"
                onClick={() => onPublish(b.id as string)}
                disabled={busy}
                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Publish
              </button>
            </div>
          );
        },
      },
    ],
    [onPublish]
  );

  const buildGlobalFilter: FilterFn<Record<string, unknown>> = useCallback((row, _columnId, filterValue) => {
    const q = String(filterValue ?? '')
      .trim()
      .toLowerCase();
    if (!q) return true;
    const b = row.original;
    const hay = [String(b.build_number ?? ''), String(b.status ?? ''), String(b.created_at ?? '')].join(' ').toLowerCase();
    return hay.includes(q);
  }, []);

  const tableInstance = useReactTable({
    data: builds,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: buildGlobalFilter,
    meta: { loading },
    getRowId: (row) => String(row.id),
  });

  return (
    <div className="space-y-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBuild}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Building…' : 'Build'}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="build-filter" className="sr-only">
          Filter builds
        </label>
        <input
          id="build-filter"
          type="search"
          placeholder="Filter builds…"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="text-xs text-muted-foreground">
          Showing {tableInstance.getFilteredRowModel().rows.length} of {builds.length}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            {tableInstance.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/50">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {builds.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  No builds yet
                </td>
              </tr>
            ) : tableInstance.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
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
    </div>
  );
}

type YamlPreviewRow = { section: string; action: string; count: number };

const yamlPreviewColumns: ColumnDef<YamlPreviewRow>[] = [
  {
    accessorKey: 'section',
    header: ({ column }) => <SortHeader column={column}>Section</SortHeader>,
    sortingFn: 'alphanumeric',
  },
  {
    accessorKey: 'action',
    header: ({ column }) => <SortHeader column={column}>Action</SortHeader>,
    cell: ({ row }) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          row.original.action === 'create'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        }`}
      >
        {row.original.action}
      </span>
    ),
    sortingFn: 'alphanumeric',
  },
  {
    accessorKey: 'count',
    header: ({ column }) => (
      <SortHeader
        column={column}
        title="For public_holidays and school_holidays: unique ISO days after merging dates and ranges (same as engine import)."
      >
        Count
      </SortHeader>
    ),
    cell: ({ getValue }) => <div className="text-right tabular-nums">{String(getValue())}</div>,
    sortingFn: 'basic',
  },
];

const yamlPreviewGlobalFilter: FilterFn<YamlPreviewRow> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const r = row.original;
  return `${r.section} ${r.action} ${r.count}`.toLowerCase().includes(q);
};

function YamlPreviewSectionsTable({ sections }: { sections: YamlPreviewRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const tableInstance = useReactTable({
    data: sections,
    columns: yamlPreviewColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: yamlPreviewGlobalFilter,
    getRowId: (row) => row.section,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="yaml-preview-filter" className="sr-only">
          Filter preview rows
        </label>
        <input
          id="yaml-preview-filter"
          type="search"
          placeholder="Filter sections…"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="text-xs text-muted-foreground">
          Showing {tableInstance.getFilteredRowModel().rows.length} of {sections.length}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            {tableInstance.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/40">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-2 py-2 text-left font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableInstance.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={yamlPreviewColumns.length} className="px-2 py-6 text-center text-muted-foreground">
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              tableInstance.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-2 align-middle">
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

type YamlImportPreview = { sections: { section: string; action: string; count: number }[] };
type YamlImportApply = { fragmentsCreated: number; warnings: string[]; errors: string[] };

function YamlTab({ content, loading, marketId }: { content: string; loading: boolean; marketId: string }) {
  const [editorValue, setEditorValue] = useState('');
  const [preview, setPreview] = useState<YamlImportPreview | null>(null);
  const [applyResult, setApplyResult] = useState<YamlImportApply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (content) setEditorValue(content);
  }, [content]);

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    setApplyResult(null);
    try {
      const result = (await previewYamlImport(marketId, editorValue)) as YamlImportPreview;
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    setError(null);
    setApplyResult(null);
    try {
      const result = (await applyYamlImport(marketId, editorValue)) as YamlImportApply;
      setApplyResult(result);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Expert YAML Editor</span>
        <span className="text-xs text-muted-foreground">Paste or edit YAML, preview changes, then apply</span>
      </div>

      <textarea
        value={editorValue}
        onChange={(e) => setEditorValue(e.target.value)}
        className="w-full rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed"
        rows={24}
        spellCheck={false}
      />

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={busy || !editorValue.trim()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Preview Changes'}
        </button>
        {preview && (
          <button
            onClick={handleApply}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Apply Changes
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-medium">Preview: fragments to be created</h3>
          <YamlPreviewSectionsTable sections={preview.sections} />
        </div>
      )}

      {applyResult && (
        <div className={`rounded-md p-3 text-sm ${
          applyResult.errors.length > 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
        }`}>
          <p className="font-medium">{applyResult.fragmentsCreated} fragments created</p>
          {applyResult.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {applyResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {applyResult.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {applyResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AuditTab({ events, loading }: { events: Record<string, unknown>[]; loading: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () => [
      {
        id: 'event_type',
        accessorKey: 'event_type',
        header: ({ column }) => <SortHeader column={column}>Event</SortHeader>,
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.event_type)}</span>,
        sortingFn: 'alphanumeric',
      },
      {
        id: 'actor',
        accessorFn: (row) => String(row.actor_email || row.actor_id || ''),
        header: ({ column }) => <SortHeader column={column}>Actor</SortHeader>,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{String(row.original.actor_email || row.original.actor_id || '—')}</span>
        ),
        sortingFn: 'alphanumeric',
      },
      {
        id: 'target',
        accessorFn: (row) => `${row.target_type ?? ''} ${row.target_id ?? ''}`,
        header: ({ column }) => <SortHeader column={column}>Target</SortHeader>,
        cell: ({ row }) => (
          <span className="text-xs">
            {String(row.original.target_type || '')} {String(row.original.target_id || '').slice(0, 8)}
          </span>
        ),
        sortingFn: 'alphanumeric',
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.created_at as string).toLocaleString()}
          </span>
        ),
        sortingFn: 'alphanumeric',
      },
    ],
    []
  );

  const auditGlobalFilter: FilterFn<Record<string, unknown>> = useCallback((row, _columnId, filterValue) => {
    const q = String(filterValue ?? '')
      .trim()
      .toLowerCase();
    if (!q) return true;
    const e = row.original;
    const hay = [
      String(e.event_type ?? ''),
      String(e.actor_email ?? e.actor_id ?? ''),
      String(e.target_type ?? ''),
      String(e.target_id ?? ''),
      String(e.created_at ?? ''),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }, []);

  const tableInstance = useReactTable({
    data: events,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: auditGlobalFilter,
    getRowId: (row, i) => String(row.id ?? i),
  });

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="audit-filter" className="sr-only">
          Filter audit log
        </label>
        <input
          id="audit-filter"
          type="search"
          placeholder="Filter events…"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="text-xs text-muted-foreground">
          Showing {tableInstance.getFilteredRowModel().rows.length} of {events.length}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            {tableInstance.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted/50">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  No audit events
                </td>
              </tr>
            ) : tableInstance.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
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
    </div>
  );
}
