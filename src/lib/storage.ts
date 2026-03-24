import { STORAGE_KEYS } from './constants';
import type { RiskModelTuning } from '@/engine/riskModelTuning';

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
  dsl: string;
  picker: string;
  layer: string;
  /** Saved when present (risk model sliders). */
  riskTuning?: RiskModelTuning;
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

export function saveScenario(
  name: string,
  state: { dsl: string; picker: string; layer: string; riskTuning?: RiskModelTuning }
): string {
  const list = getScenarios();
  const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: ScenarioState = { id, name, dsl: state.dsl, picker: state.picker, layer: state.layer };
  if (state.riskTuning) row.riskTuning = state.riskTuning;
  list.push(row);
  try {
    localStorage.setItem(STORAGE_KEYS.atc_scenarios, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  notifyScenariosChanged();
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
