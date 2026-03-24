import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { applyScenarioToStore } from '@/lib/scenarioApply';
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
import { ChevronDown, Database, Rows2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SectionShell = 0 | 1 | 2;

function parseScenariosImport(raw: unknown): ScenarioState[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ScenarioState[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const o = row as Record<string, unknown>;
    if (
      typeof o.id !== 'string' ||
      typeof o.name !== 'string' ||
      typeof o.dsl !== 'string' ||
      typeof o.picker !== 'string' ||
      typeof o.layer !== 'string'
    ) {
      return null;
    }
    const s: ScenarioState = {
      id: o.id,
      name: o.name,
      dsl: o.dsl,
      picker: o.picker,
      layer: o.layer,
    };
    if (o.riskTuning && typeof o.riskTuning === 'object') {
      s.riskTuning = o.riskTuning as RiskModelTuning;
    }
    out.push(s);
  }
  return out;
}

export function LocalDataSection() {
  const [expanded, setExpanded] = useState(false);
  const [shell, setShell] = useState<SectionShell>(0);
  const cycleShell = () => setShell((s) => ((s + 1) % 3) as SectionShell);
  const [scenarios, setScenarios] = useState(() => getScenarios());
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrateFromStorage = useAtcStore((s) => s.hydrateFromStorage);

  const refresh = useCallback(() => setScenarios(getScenarios()), []);

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
    a.download = `capacity-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
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
        window.alert('Import failed: file must be a JSON array of scenarios with id, name, dsl, picker, layer.');
        return;
      }
      setScenariosList(list);
      refresh();
      window.alert(`Imported ${list.length} scenario(s).`);
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
        'Remove saved country, view mode, theme, and risk sliders from this browser? The page will reload.'
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
      ? 'No saved scenarios · browser only'
      : `${scenarios.length} saved scenario${scenarios.length === 1 ? '' : 's'} · export / import below`;

  const shellHint = ['Full header', 'Text strip', 'Icons only'][shell]!;

  return (
    <div className="flex min-h-0 flex-col rounded-md border border-border bg-muted/20">
      {shell === 2 ? (
        <div className="flex items-center justify-end gap-0.5 border-b border-border/60 px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title={expanded ? 'Hide local data' : 'Show local data'}
            aria-label={expanded ? 'Hide local data' : 'Show local data'}
          >
            <Database className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={cycleShell}
            title={`Section layout: ${shellHint}`}
            aria-label={`Cycle section layout, ${shellHint}`}
          >
            <Rows2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : shell === 1 ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 rounded-md py-0.5 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="text-xs font-semibold text-foreground">Local data</span>
              {!expanded ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{scenarioSummary}</p> : null}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
            onClick={cycleShell}
            title={`Layout: ${shellHint}`}
            aria-label={`Cycle section layout, ${shellHint}`}
          >
            <Rows2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-stretch gap-1 rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              <span className="flex items-center gap-2">
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                  aria-hidden
                />
                <span className="text-xs font-semibold text-foreground">Local data</span>
              </span>
              {!expanded ? <p className="pl-6 text-xs text-muted-foreground">{scenarioSummary}</p> : null}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
              onClick={cycleShell}
              title={`Layout: ${shellHint}. Next: compact strip.`}
              aria-label={`Cycle section layout, ${shellHint}`}
            >
              <Rows2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {expanded ? (
        <div className="flex min-h-0 flex-col gap-3 border-t border-border/60 px-3 pb-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Scenarios and applied DSL live in this browser only. Export to back up; import replaces the whole scenario
            list.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exportJson}>
              Export scenarios
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Import scenarios
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

          <div className="max-h-56 min-h-0 overflow-y-auto">
            {scenarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved scenarios.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {scenarios.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
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
                          if (!window.confirm(`Delete scenario “${s.name}”?`)) return;
                          deleteScenario(s.id);
                          refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
