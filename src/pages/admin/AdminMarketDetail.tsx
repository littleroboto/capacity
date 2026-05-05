import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
import { HolidayCalendarsEditor } from '@/pages/admin/HolidayCalendarsEditor';
import { AdminHolidayEntryCreate } from '@/pages/admin/AdminHolidayEntryCreate';
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
import { AdminResourceConfigPanel } from '@/pages/admin/AdminResourceConfigPanel';
import type { AdminMarketRow } from '@/pages/admin/AdminMarketsDataTable';
import {
  ADMIN_MARKET_ENTITY_TABS as TABS,
  adminMarketEntityPath,
  DEFAULT_ADMIN_MARKET_ENTITY,
  isAdminMarketEntityKey,
} from '@/pages/admin/adminMarketTabs';
import { FragmentTable, SortHeader } from '@/pages/admin/FragmentTable';
import { FragmentSectionEditorSheet } from '@/pages/admin/FragmentSectionEditorSheet';
import { FRAGMENT_FULL_EDITOR_TABLES } from '@/pages/admin/fragmentSectionEditorDraft';
import { AdminMarketYamlMonacoEditor } from '@/components/AdminMarketYamlMonacoEditor';

export function AdminMarketDetail() {
  const { id: marketId, entity: entityParam } = useParams<{ id: string; entity: string }>();
  const navigate = useNavigate();
  const activeTab = entityParam && isAdminMarketEntityKey(entityParam) ? entityParam : DEFAULT_ADMIN_MARKET_ENTITY;
  const [fragments, setFragments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [fragmentListError, setFragmentListError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    detail?: ReactNode;
  } | null>(null);
  const [marketRow, setMarketRow] = useState<AdminMarketRow | null>(null);

  // Build state
  const [builds, setBuilds] = useState<Record<string, unknown>[]>([]);
  const [buildLoading, setBuildLoading] = useState(false);

  // YAML state
  const [yamlContent, setYamlContent] = useState('');

  // Audit state
  const [auditEvents, setAuditEvents] = useState<Record<string, unknown>[]>([]);

  /** Row opened in the full-section YAML dialog (table = current fragment table for that tab). */
  const [sectionEditorRow, setSectionEditorRow] = useState<Record<string, unknown> | null>(null);

  const currentTable = TABS.find(t => t.key === activeTab)?.table || '';

  useEffect(() => {
    if (!marketId || !entityParam) return;
    if (!isAdminMarketEntityKey(entityParam)) {
      navigate(adminMarketEntityPath(marketId, DEFAULT_ADMIN_MARKET_ENTITY), { replace: true });
    }
  }, [marketId, entityParam, navigate]);

  const loadFragments = useCallback(async () => {
    if (!marketId || !currentTable) return;
    setLoading(true);
    setFragmentListError(null);
    try {
      const data = await fetchFragments(currentTable, marketId);
      setFragments(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFragmentListError(`Failed to load ${currentTable}: ${msg}`);
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
    setSectionEditorRow(null);
  }, [activeTab]);

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

  const persistFragment = useCallback(
    async (fragment: Record<string, unknown>, updates: Record<string, unknown>) => {
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
        throw err;
      } finally {
        setSaving(null);
      }
    },
    [currentTable, loadFragments],
  );

  const handleSave = useCallback(
    async (fragment: Record<string, unknown>, updates: Record<string, unknown>) => {
      await persistFragment(fragment, updates);
    },
    [persistFragment],
  );

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
    setSaveMessage(null);
    try {
      await buildMarketApi(marketId);
      const updated = await fetchBuilds(marketId);
      setBuilds(updated);
      setSaveMessage({ type: 'success', text: 'Build submitted successfully.' });
    } catch (e) {
      setSaveMessage({
        type: 'error',
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBuildLoading(false);
    }
  };

  const handlePublish = async (buildId: string) => {
    setBuildLoading(true);
    setSaveMessage(null);
    try {
      await publishBuildApi(buildId);
      if (marketId) {
        const updated = await fetchBuilds(marketId);
        setBuilds(updated);
      }
      setSaveMessage({ type: 'success', text: 'Build published successfully.' });
    } catch (e) {
      setSaveMessage({
        type: 'error',
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBuildLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!marketId) return;
    setValidating(true);
    setSaveMessage(null);
    try {
      const report = await validateMarketApi(marketId);
      const rawErr = Number(report.errorCount);
      const rawWarn = Number(report.warningCount);
      const errN = Number.isFinite(rawErr) ? rawErr : 0;
      const warnN = Number.isFinite(rawWarn) ? rawWarn : 0;
      const hasIssues = errN > 0 || warnN > 0;
      setSaveMessage({
        type: report.isValid ? 'success' : 'error',
        text: `Market validation: ${errN} error${errN === 1 ? '' : 's'}, ${warnN} warning${warnN === 1 ? '' : 's'}.`,
        detail:
          hasIssues ? (
            <p className="mt-2 text-xs opacity-90">
              <Link
                to={adminMarketEntityPath(marketId, 'yaml')}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Open Expert YAML
              </Link>{' '}
              to inspect source and fix issues.
            </p>
          ) : undefined,
      });
    } catch (e) {
      setSaveMessage({
        type: 'error',
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Markets</Link>
          <h1 className="text-2xl font-semibold">{marketId}</h1>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={handleValidate}
            disabled={validating}
            title="Runs validation across the whole market, not only the current section."
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {validating ? 'Validating…' : 'Validate market'}
          </button>
          <span className="max-w-[14rem] text-right text-[11px] text-muted-foreground leading-snug">
            Whole-market check (all sections)
          </span>
        </div>
      </div>

      {fragmentListError && (
        <div
          className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
          role="alert"
        >
          {fragmentListError}
        </div>
      )}

      {saveMessage && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            saveMessage.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
          role="status"
        >
          <p>{saveMessage.text}</p>
          {saveMessage.detail}
        </div>
      )}

      <FragmentSectionEditorSheet
        open={sectionEditorRow !== null && FRAGMENT_FULL_EDITOR_TABLES.has(currentTable)}
        onOpenChange={(next) => {
          if (!next) setSectionEditorRow(null);
        }}
        table={currentTable}
        fragment={sectionEditorRow}
        saving={sectionEditorRow != null && saving === String(sectionEditorRow.id)}
        onSave={persistFragment}
      />

      {/* Tab content — section nav lives in AdminLayout sidebar */}

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
        <div className="space-y-8">
          <AdminHolidayEntryCreate marketId={marketId ?? ''} onEntriesAdded={loadFragments} />
          <HolidayCalendarsEditor
            fragments={fragments}
            loading={loading}
            saving={saving}
            onSave={handleSave}
            onArchive={handleArchive}
            onRefresh={loadFragments}
          />
        </div>
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
          {activeTab === 'resources' ? (
            <AdminResourceConfigPanel fragments={fragments} saving={saving} onPersist={persistFragment} />
          ) : null}
          <FragmentTable
            fragments={fragments}
            loading={loading}
            table={currentTable}
            prefsScope={{ marketId: marketId ?? '', entity: activeTab }}
            saving={saving}
            onSave={handleSave}
            onArchive={handleArchive}
            onOpenSectionEditor={
              FRAGMENT_FULL_EDITOR_TABLES.has(currentTable)
                ? (f) => setSectionEditorRow(f)
                : undefined
            }
          />
        </>
      )}
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

      <AdminMarketYamlMonacoEditor
        value={editorValue}
        onChange={setEditorValue}
        readOnly={busy}
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
