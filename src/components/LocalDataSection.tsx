import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeViewModeId, STORAGE_KEYS, VIEW_MODES } from '@/lib/constants';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { applyScenarioToStore } from '@/lib/scenarioApply';
import { isRunwayAllMarkets, RUNWAY_ALL_MARKETS_LABEL } from '@/lib/markets';
import { parseRiskHeatmapCurve } from '@/lib/riskHeatmapTransfer';
import {
  SCENARIOS_CHANGED,
  deleteScenario,
  getScenarios,
  setAtcDsl,
  setScenariosList,
  type ScenarioState,
} from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';

function formatSavedAt(iso?: string): string {
  if (!iso?.trim()) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : iso.slice(0, 19);
}

function viewModeLabel(layer: string): string {
  const id = normalizeViewModeId(layer);
  return VIEW_MODES.find((m) => m.id === id)?.label ?? layer;
}

function marketLabel(picker: string): string {
  return isRunwayAllMarkets(picker) ? RUNWAY_ALL_MARKETS_LABEL : picker;
}

function parseScenariosImport(raw: unknown): ScenarioState[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ScenarioState[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const o = row as Record<string, unknown>;
    if (
      typeof o.id !== 'string' ||
      typeof o.name !== 'string' ||
      typeof o.picker !== 'string' ||
      typeof o.layer !== 'string'
    ) {
      return null;
    }
    const fullDsl =
      typeof o.fullDsl === 'string' && o.fullDsl.trim()
        ? o.fullDsl
        : typeof o.dsl === 'string' && o.dsl.trim()
          ? o.dsl
          : '';
    if (!fullDsl.trim()) return null;

    const s: ScenarioState = {
      id: o.id,
      name: o.name,
      fullDsl,
      dsl: typeof o.dsl === 'string' ? o.dsl : fullDsl,
      picker: o.picker,
      layer: o.layer,
    };
    if (typeof o.savedAt === 'string' && o.savedAt.trim()) s.savedAt = o.savedAt;

    if (o.riskTuning && typeof o.riskTuning === 'object') {
      s.riskTuning = o.riskTuning as RiskModelTuning;
    }

    if (Array.isArray(o.runwayMarketOrder)) {
      const ord = o.runwayMarketOrder.filter((x): x is string => typeof x === 'string');
      if (ord.length) s.runwayMarketOrder = ord;
    }

    if (o.dslByMarket && typeof o.dslByMarket === 'object' && !Array.isArray(o.dslByMarket)) {
      const dm: Record<string, string> = {};
      for (const [k, v] of Object.entries(o.dslByMarket as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) dm[k] = v;
      }
      if (Object.keys(dm).length) s.dslByMarket = dm;
    }

    if (typeof o.riskHeatmapGamma === 'number' && Number.isFinite(o.riskHeatmapGamma)) {
      s.riskHeatmapGamma = o.riskHeatmapGamma;
    }
    if (typeof o.riskHeatmapCurve === 'string') {
      s.riskHeatmapCurve = parseRiskHeatmapCurve(o.riskHeatmapCurve);
    }
    if (typeof o.discoMode === 'boolean') s.discoMode = o.discoMode;
    if (o.theme === 'light' || o.theme === 'dark') s.theme = o.theme;
    if (o.heatmapRenderStyle === 'mono' || o.heatmapRenderStyle === 'spectrum') {
      s.heatmapRenderStyle = o.heatmapRenderStyle;
    }
    if (typeof o.heatmapMonoColor === 'string' && o.heatmapMonoColor.trim()) {
      s.heatmapMonoColor = o.heatmapMonoColor.trim();
    }

    out.push(s);
  }
  return out;
}

/** Scenarios, export/import, and browser storage actions (for use inside a dialog or sheet). */
export function LocalDataPanelContent() {
  const [scenarios, setScenarios] = useState(() => getScenarios());
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrateFromStorage = useAtcStore((s) => s.hydrateFromStorage);

  const refresh = useCallback(() => setScenarios(getScenarios()), []);

  const sortedScenarios = useMemo(
    () =>
      [...scenarios].sort((a, b) => {
        const ta = a.savedAt ? Date.parse(a.savedAt) : 0;
        const tb = b.savedAt ? Date.parse(b.savedAt) : 0;
        if (tb !== ta) return tb - ta;
        return a.name.localeCompare(b.name);
      }),
    [scenarios]
  );

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(SCENARIOS_CHANGED, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(SCENARIOS_CHANGED, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getScenarios(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `capacity-workspace-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as unknown;
      const list = parseScenariosImport(parsed);
      if (!list) {
        window.alert(
          'Import failed: JSON array required. Each row needs id, name, picker, layer, and fullDsl or dsl (YAML).'
        );
        return;
      }
      setScenariosList(list);
      refresh();
      window.alert(`Imported ${list.length} snapshot(s).`);
    } catch {
      window.alert('Import failed: could not read or parse JSON.');
    }
  };

  const clearAppliedDsl = () => {
    setAtcDsl(null);
    hydrateFromStorage();
  };

  const resetPersistedPrefs = () => {
    if (
      !window.confirm(
        'Remove saved country, view mode, theme, and pressure mix controls from this browser? The page will reload.'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.capacity_atc);
      localStorage.removeItem(STORAGE_KEYS.picker);
      localStorage.removeItem(STORAGE_KEYS.layer);
      localStorage.removeItem(STORAGE_KEYS.theme);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const clearAllLocalData = () => {
    if (
      !window.confirm(
        'Remove all Capacity data in this browser (scenarios, applied DSL, and preferences)? The page will reload.'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.atc_scenarios);
      localStorage.removeItem(STORAGE_KEYS.atc_dsl);
      localStorage.removeItem(STORAGE_KEYS.capacity_atc);
      localStorage.removeItem(STORAGE_KEYS.picker);
      localStorage.removeItem(STORAGE_KEYS.layer);
      localStorage.removeItem(STORAGE_KEYS.theme);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const scenarioSummary =
    scenarios.length === 0
      ? 'No saved snapshots'
      : `${scenarios.length} workspace snapshot${scenarios.length === 1 ? '' : 's'}`;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{scenarioSummary}</span>
        {' · '}
        Export to back up; import replaces the whole history. Click a row or Load to restore.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={exportJson}>
          Export history
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          Import history
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onImportFile}
        />
        <Button type="button" variant="outline" size="sm" onClick={clearAppliedDsl}>
          Clear applied DSL
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={resetPersistedPrefs}>
          Reset preferences
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
          onClick={clearAllLocalData}
        >
          Clear everything
        </Button>
      </div>

      <div className="max-h-[min(48vh,22rem)] min-h-0 overflow-auto rounded-md border border-border/60 bg-muted/15">
        {scenarios.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No saved snapshots yet.</p>
        ) : (
          <div className="min-w-[28rem]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-border/80 bg-muted/40 backdrop-blur-sm">
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">
                    Saved
                  </th>
                  <th scope="col" className="min-w-[6rem] px-2 py-1.5 font-medium text-muted-foreground">
                    Name
                  </th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">
                    Market
                  </th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">
                    View
                  </th>
                  <th scope="col" className="w-[1%] whitespace-nowrap px-2 py-1.5 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedScenarios.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/25"
                    onClick={() => applyScenarioToStore(s)}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground tabular-nums">
                      {formatSavedAt(s.savedAt)}
                    </td>
                    <td className="max-w-[10rem] truncate px-2 py-1.5 font-medium text-foreground" title={s.name}>
                      {s.name}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{marketLabel(s.picker)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                      {viewModeLabel(s.layer)}
                    </td>
                    <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          onClick={() => applyScenarioToStore(s)}
                        >
                          Load
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            if (!window.confirm(`Delete snapshot “${s.name}”?`)) return;
                            deleteScenario(s.id);
                            refresh();
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
