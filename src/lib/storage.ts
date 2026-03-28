import { STORAGE_KEYS } from './constants';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import type { HeatmapRenderStyle } from '@/lib/riskHeatmapColors';

/** Same-tab refresh for scenario list (localStorage has no event in-tab). */
export const SCENARIOS_CHANGED = 'atc-scenarios-changed';

export function notifyScenariosChanged(): void {
  window.dispatchEvent(new CustomEvent(SCENARIOS_CHANGED));
}

export function getStored(key: keyof typeof STORAGE_KEYS | string): string | null {
  try {
    const k = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] ?? key;
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function setStored(key: keyof typeof STORAGE_KEYS | string, value: string | null): void {
  try {
    const k = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] ?? key;
    if (value == null) localStorage.removeItem(k);
    else localStorage.setItem(k, String(value));
  } catch {
    /* ignore */
  }
}

export function getAtcDsl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.atc_dsl);
  } catch {
    return null;
  }
}

export function setAtcDsl(text: string | null): void {
  try {
    if (text == null) localStorage.removeItem(STORAGE_KEYS.atc_dsl);
    else localStorage.setItem(STORAGE_KEYS.atc_dsl, String(text));
  } catch {
    /* ignore */
  }
}

export type ScenarioState = {
  id: string;
  name: string;
  /** When this snapshot was saved (ISO). Omitted in very old exports. */
  savedAt?: string;
  /** Canonical merged multi-doc YAML. Prefer over `dsl`. */
  fullDsl?: string;
  /** Legacy field; same as `fullDsl` when `fullDsl` absent. */
  dsl?: string;
  picker: string;
  layer: string;
  riskTuning?: RiskModelTuning;
  runwayMarketOrder?: string[];
  dslByMarket?: Record<string, string>;
  riskHeatmapGamma?: number;
  riskHeatmapCurve?: RiskHeatmapCurveId;
  discoMode?: boolean;
  theme?: 'light' | 'dark';
  heatmapRenderStyle?: HeatmapRenderStyle;
  heatmapMonoColor?: string;
};

export function getScenarios(): ScenarioState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.atc_scenarios);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as ScenarioState[]) : [];
  } catch {
    return [];
  }
}

/** Append a fully-built snapshot (see `buildWorkspaceSnapshot` / import). */
export function appendScenario(row: ScenarioState): void {
  const list = getScenarios();
  list.push(row);
  try {
    localStorage.setItem(STORAGE_KEYS.atc_scenarios, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  notifyScenariosChanged();
}

/**
 * @deprecated Use `saveNamedWorkspace` / `saveNamedWorkspaceInteractive` from `@/lib/workspaceSnapshot`.
 */
export function saveScenario(
  name: string,
  state: { dsl: string; picker: string; layer: string; riskTuning?: RiskModelTuning }
): string {
  const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: ScenarioState = {
    id,
    name,
    savedAt: new Date().toISOString(),
    fullDsl: state.dsl,
    dsl: state.dsl,
    picker: state.picker,
    layer: state.layer,
    riskTuning: state.riskTuning,
  };
  appendScenario(row);
  return id;
}

export function deleteScenario(id: string): void {
  const list = getScenarios().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.atc_scenarios, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  notifyScenariosChanged();
}

export function setScenariosList(list: ScenarioState[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.atc_scenarios, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  notifyScenariosChanged();
}

export function loadScenario(id: string): ScenarioState | null {
  const list = getScenarios();
  return list.find((s) => s.id === id) ?? null;
}
