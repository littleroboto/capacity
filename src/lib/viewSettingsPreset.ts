import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { riskTuningFromPersisted } from '@/engine/riskModelTuning';
import { normalizeViewModeId, type ViewModeId } from '@/lib/constants';
import type { HeatmapRenderStyle } from '@/lib/riskHeatmapColors';
import { normalizeHeatmapMonoHex } from '@/lib/riskHeatmapColors';
import type { HeatmapTuningLensId, PerLensHeatmapTuning } from '@/lib/heatmapTuningPerLens';
import {
  parseRiskHeatmapTuningByLens,
  riskHeatmapTuningByLensFromLegacyGlobals,
} from '@/lib/heatmapTuningPerLens';
import { parseRiskHeatmapCurve } from '@/lib/riskHeatmapTransfer';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';
import type { TechWorkloadScope } from '@/lib/runwayViewMetrics';

/** File wrapper for export/import (JSON). */
export const VIEW_SETTINGS_FILE_KIND = 'capacity-view-settings-v1' as const;

export type ViewSettingsExportScope = 'preferences' | 'full';

export type ViewSettingsPayloadV1 = {
  country?: string;
  viewMode?: ViewModeId;
  theme?: 'light' | 'dark';
  riskTuning?: RiskModelTuning;
  discoMode?: boolean;
  runway3dHeatmap?: boolean;
  runwaySvgHeatmap?: boolean;
  heatmapRenderStyle?: HeatmapRenderStyle;
  heatmapMonoColor?: string;
  heatmapSpectrumContinuous?: boolean;
  techWorkloadScope?: TechWorkloadScope;
  dslLlmAssistantEnabled?: boolean;
  runwayFilterYear?: number | null;
  runwayFilterQuarter?: RunwayQuarter | null;
  runwayIncludeFollowingQuarter?: boolean;
  /**
   * Single-market heatmap: last selected calendar day (`YYYY-MM-DD`) for cell highlight + side summary.
   * Cleared when the runway focus market changes.
   */
  runwaySelectedDayYmd?: string | null;
  /** Per runway lens (Technology Teams, Restaurant Activity, Deployment Risk); same tuning for every column. */
  riskHeatmapTuningByLens?: Record<HeatmapTuningLensId, PerLensHeatmapTuning>;
};

export type ViewSettingsFileV1 = {
  kind: typeof VIEW_SETTINGS_FILE_KIND;
  version: 1;
  exportedAt: string;
  scope: ViewSettingsExportScope;
  label?: string;
  settings: Partial<ViewSettingsPayloadV1>;
};

/** Keys persisted in Zustand `partialize` — single list for export/import parity. */
export const VIEW_SETTINGS_PAYLOAD_KEYS = [
  'country',
  'viewMode',
  'theme',
  'riskTuning',
  'discoMode',
  'runway3dHeatmap',
  'runwaySvgHeatmap',
  'heatmapRenderStyle',
  'heatmapMonoColor',
  'heatmapSpectrumContinuous',
  'techWorkloadScope',
  'dslLlmAssistantEnabled',
  'runwayFilterYear',
  'runwayFilterQuarter',
  'runwayIncludeFollowingQuarter',
  'runwaySelectedDayYmd',
  'riskHeatmapTuningByLens',
] as const satisfies readonly (keyof ViewSettingsPayloadV1)[];

export type ViewSettingsPayloadKey = (typeof VIEW_SETTINGS_PAYLOAD_KEYS)[number];

/**
 * Zustand `partialize` must include exactly these keys — use this helper so new payload keys cannot be
 * added to export/import without also persisting (or the omission is an explicit one-off).
 */
export function sliceViewSettingsForPersist(
  s: Record<ViewSettingsPayloadKey, unknown>
): Record<ViewSettingsPayloadKey, unknown> {
  const out = {} as Record<ViewSettingsPayloadKey, unknown>;
  for (const key of VIEW_SETTINGS_PAYLOAD_KEYS) {
    out[key] = s[key];
  }
  return out;
}

export function buildViewSettingsFile(
  settings: Partial<ViewSettingsPayloadV1>,
  scope: ViewSettingsExportScope,
  label?: string
): ViewSettingsFileV1 {
  return {
    kind: VIEW_SETTINGS_FILE_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    ...(label?.trim() ? { label: label.trim() } : {}),
    settings,
  };
}

function clampGamma(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x)
    ? Math.min(3, Math.max(0.35, Math.round(x * 100) / 100))
    : fallback;
}

function clampTailPower(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 1
    ? Math.min(2.75, Math.max(1, Math.round(x * 100) / 100))
    : fallback;
}

function clampBusinessOffset(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x)
    ? Math.min(0.5, Math.max(-0.5, Math.round(x * 100) / 100))
    : fallback;
}

const LEGACY_HEATMAP_JSON_KEYS = [
  'riskHeatmapGamma',
  'riskHeatmapGammaTech',
  'riskHeatmapGammaBusiness',
  'riskHeatmapCurve',
  'riskHeatmapTailPower',
  'riskHeatmapBusinessPressureOffset',
  'marketRiskHeatmapCurve',
  'marketRiskHeatmapGamma',
  'marketRiskHeatmapTailPower',
] as const;

function rawHasLegacyHeatmapKeys(raw: Record<string, unknown>): boolean {
  return LEGACY_HEATMAP_JSON_KEYS.some((k) => Object.prototype.hasOwnProperty.call(raw, k));
}

/** Read flat pre-epic export keys for migration into `riskHeatmapTuningByLens`. */
function legacyHeatmapGlobalsFromRaw(raw: Record<string, unknown>): Parameters<
  typeof riskHeatmapTuningByLensFromLegacyGlobals
>[0] {
  const legacy: Parameters<typeof riskHeatmapTuningByLensFromLegacyGlobals>[0] = {};

  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGamma')) {
    legacy.riskHeatmapGamma = clampGamma(raw.riskHeatmapGamma, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGammaTech')) {
    legacy.riskHeatmapGammaTech = clampGamma(raw.riskHeatmapGammaTech, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGammaBusiness')) {
    legacy.riskHeatmapGammaBusiness = clampGamma(raw.riskHeatmapGammaBusiness, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapTailPower')) {
    legacy.riskHeatmapTailPower = clampTailPower(raw.riskHeatmapTailPower, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapBusinessPressureOffset')) {
    legacy.riskHeatmapBusinessPressureOffset = clampBusinessOffset(raw.riskHeatmapBusinessPressureOffset, 0);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapCurve')) {
    legacy.riskHeatmapCurve = parseRiskHeatmapCurve(
      typeof raw.riskHeatmapCurve === 'string' ? raw.riskHeatmapCurve : undefined
    );
  }

  if (legacy.riskHeatmapCurve == null && raw.marketRiskHeatmapCurve != null) {
    legacy.riskHeatmapCurve = parseRiskHeatmapCurve(
      typeof raw.marketRiskHeatmapCurve === 'string' ? raw.marketRiskHeatmapCurve : undefined
    );
  }
  if (
    legacy.riskHeatmapGamma == null &&
    legacy.riskHeatmapGammaTech == null &&
    legacy.riskHeatmapGammaBusiness == null &&
    raw.marketRiskHeatmapGamma != null
  ) {
    const g = clampGamma(raw.marketRiskHeatmapGamma, 1);
    legacy.riskHeatmapGamma = g;
    legacy.riskHeatmapGammaTech = g;
    legacy.riskHeatmapGammaBusiness = g;
  }
  if (legacy.riskHeatmapTailPower == null && raw.marketRiskHeatmapTailPower != null) {
    legacy.riskHeatmapTailPower = clampTailPower(raw.marketRiskHeatmapTailPower, 1);
  }

  return legacy;
}

/** Parse and validate top-level file shape. */
export function parseViewSettingsFile(
  raw: unknown
): { ok: true; file: ViewSettingsFileV1 } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  const o = raw as Record<string, unknown>;
  if (o.kind !== VIEW_SETTINGS_FILE_KIND) {
    return { ok: false, error: `Not a Capacity view-settings file (missing kind "${VIEW_SETTINGS_FILE_KIND}").` };
  }
  if (o.version !== 1) {
    return { ok: false, error: `Unsupported version: ${String(o.version)}.` };
  }
  if (o.scope !== 'preferences' && o.scope !== 'full') {
    return { ok: false, error: 'Invalid scope (expected "preferences" or "full").' };
  }
  if (o.settings === null || typeof o.settings !== 'object') {
    return { ok: false, error: 'Missing or invalid "settings" object.' };
  }
  const exportedAt = typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString();
  const label = typeof o.label === 'string' ? o.label : undefined;
  const sanitized = sanitizeSettingsPayload(o.settings as Record<string, unknown>);
  return {
    ok: true,
    file: {
      kind: VIEW_SETTINGS_FILE_KIND,
      version: 1,
      exportedAt,
      scope: o.scope,
      ...(label !== undefined ? { label } : {}),
      settings: sanitized,
    },
  };
}

/**
 * Coerce loose JSON into a safe partial payload — only keys present in `raw` are set (no silent defaults).
 */
export function sanitizeSettingsPayload(raw: Record<string, unknown>): Partial<ViewSettingsPayloadV1> {
  const out: Partial<ViewSettingsPayloadV1> = {};

  if (Object.prototype.hasOwnProperty.call(raw, 'country')) {
    if (typeof raw.country === 'string' && raw.country.trim()) {
      out.country = raw.country.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'viewMode') && raw.viewMode != null) {
    out.viewMode = normalizeViewModeId(String(raw.viewMode));
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'theme')) {
    if (raw.theme === 'light' || raw.theme === 'dark') {
      out.theme = raw.theme;
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'riskTuning')) {
    if (raw.riskTuning !== null && typeof raw.riskTuning === 'object') {
      out.riskTuning = riskTuningFromPersisted(raw.riskTuning as Partial<RiskModelTuning>);
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'discoMode') && typeof raw.discoMode === 'boolean') {
    out.discoMode = raw.discoMode;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'runway3dHeatmap') && typeof raw.runway3dHeatmap === 'boolean') {
    out.runway3dHeatmap = raw.runway3dHeatmap;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'runwaySvgHeatmap') && typeof raw.runwaySvgHeatmap === 'boolean') {
    out.runwaySvgHeatmap = raw.runwaySvgHeatmap;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'heatmapRenderStyle')) {
    if (raw.heatmapRenderStyle === 'spectrum' || raw.heatmapRenderStyle === 'mono') {
      out.heatmapRenderStyle = raw.heatmapRenderStyle;
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'heatmapMonoColor') && typeof raw.heatmapMonoColor === 'string') {
    out.heatmapMonoColor = normalizeHeatmapMonoHex(raw.heatmapMonoColor);
  }

  if (
    Object.prototype.hasOwnProperty.call(raw, 'heatmapSpectrumContinuous') &&
    typeof raw.heatmapSpectrumContinuous === 'boolean'
  ) {
    out.heatmapSpectrumContinuous = raw.heatmapSpectrumContinuous;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'techWorkloadScope')) {
    if (raw.techWorkloadScope === 'bau' || raw.techWorkloadScope === 'project' || raw.techWorkloadScope === 'all') {
      out.techWorkloadScope = raw.techWorkloadScope;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(raw, 'dslLlmAssistantEnabled') &&
    typeof raw.dslLlmAssistantEnabled === 'boolean'
  ) {
    out.dslLlmAssistantEnabled = raw.dslLlmAssistantEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'runwayFilterYear')) {
    if (raw.runwayFilterYear === null) {
      out.runwayFilterYear = null;
    } else if (typeof raw.runwayFilterYear === 'number' && Number.isFinite(raw.runwayFilterYear)) {
      out.runwayFilterYear = Math.round(raw.runwayFilterYear);
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'runwayFilterQuarter')) {
    const rq = raw.runwayFilterQuarter;
    if (rq === null) {
      out.runwayFilterQuarter = null;
    } else if (rq === 1 || rq === 2 || rq === 3 || rq === 4) {
      out.runwayFilterQuarter = rq;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(raw, 'runwayIncludeFollowingQuarter') &&
    typeof raw.runwayIncludeFollowingQuarter === 'boolean'
  ) {
    out.runwayIncludeFollowingQuarter = raw.runwayIncludeFollowingQuarter;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'runwaySelectedDayYmd')) {
    const d = raw.runwaySelectedDayYmd;
    if (d === null) {
      out.runwaySelectedDayYmd = null;
    } else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
      out.runwaySelectedDayYmd = d.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapTuningByLens')) {
    const parsed = parseRiskHeatmapTuningByLens(raw.riskHeatmapTuningByLens);
    if (parsed) {
      out.riskHeatmapTuningByLens = parsed;
    }
  }
  if (!out.riskHeatmapTuningByLens && rawHasLegacyHeatmapKeys(raw)) {
    out.riskHeatmapTuningByLens = riskHeatmapTuningByLensFromLegacyGlobals(legacyHeatmapGlobalsFromRaw(raw));
  }

  return out;
}

export function pickViewSettingsPayload(
  s: Record<ViewSettingsPayloadKey, unknown>,
  scope: ViewSettingsExportScope
): Partial<ViewSettingsPayloadV1> {
  const out: Partial<ViewSettingsPayloadV1> = {};
  for (const key of VIEW_SETTINGS_PAYLOAD_KEYS) {
    if (scope === 'preferences' && (key === 'country' || key === 'viewMode')) {
      continue;
    }
    const v = s[key];
    if (v === undefined) continue;
    if (key === 'viewMode') {
      out.viewMode = v as ViewModeId;
    } else if (key === 'riskTuning') {
      out.riskTuning = v as RiskModelTuning;
    } else {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
