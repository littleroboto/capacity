import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { riskTuningFromPersisted } from '@/engine/riskModelTuning';
import { normalizeViewModeId, type ViewModeId } from '@/lib/constants';
import type { HeatmapRenderStyle } from '@/lib/riskHeatmapColors';
import { normalizeHeatmapMonoHex } from '@/lib/riskHeatmapColors';
import { parseRiskHeatmapCurve, type RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
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
  riskHeatmapGamma?: number;
  riskHeatmapGammaTech?: number;
  riskHeatmapGammaBusiness?: number;
  riskHeatmapCurve?: RiskHeatmapCurveId;
  riskHeatmapTailPower?: number;
  riskHeatmapBusinessPressureOffset?: number;
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
  'riskHeatmapGamma',
  'riskHeatmapGammaTech',
  'riskHeatmapGammaBusiness',
  'riskHeatmapCurve',
  'riskHeatmapTailPower',
  'riskHeatmapBusinessPressureOffset',
] as const satisfies readonly (keyof ViewSettingsPayloadV1)[];

export type ViewSettingsPayloadKey = (typeof VIEW_SETTINGS_PAYLOAD_KEYS)[number];

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

  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGamma')) {
    out.riskHeatmapGamma = clampGamma(raw.riskHeatmapGamma, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGammaTech')) {
    out.riskHeatmapGammaTech = clampGamma(raw.riskHeatmapGammaTech, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapGammaBusiness')) {
    out.riskHeatmapGammaBusiness = clampGamma(raw.riskHeatmapGammaBusiness, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapTailPower')) {
    out.riskHeatmapTailPower = clampTailPower(raw.riskHeatmapTailPower, 1);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapBusinessPressureOffset')) {
    out.riskHeatmapBusinessPressureOffset = clampBusinessOffset(raw.riskHeatmapBusinessPressureOffset, 0);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'riskHeatmapCurve')) {
    out.riskHeatmapCurve = parseRiskHeatmapCurve(
      typeof raw.riskHeatmapCurve === 'string' ? raw.riskHeatmapCurve : undefined
    );
  }

  /** Older exports used separate market-risk transfer keys; fold into global if primary keys absent. */
  if (!Object.prototype.hasOwnProperty.call(out, 'riskHeatmapCurve') && raw.marketRiskHeatmapCurve != null) {
    out.riskHeatmapCurve = parseRiskHeatmapCurve(
      typeof raw.marketRiskHeatmapCurve === 'string' ? raw.marketRiskHeatmapCurve : undefined
    );
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'riskHeatmapGamma') && raw.marketRiskHeatmapGamma != null) {
    const g = clampGamma(raw.marketRiskHeatmapGamma, 1);
    out.riskHeatmapGamma = g;
    out.riskHeatmapGammaTech = g;
    out.riskHeatmapGammaBusiness = g;
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'riskHeatmapTailPower') && raw.marketRiskHeatmapTailPower != null) {
    out.riskHeatmapTailPower = clampTailPower(raw.marketRiskHeatmapTailPower, 1);
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
