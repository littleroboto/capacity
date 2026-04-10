import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewModeId } from '@/lib/constants';
import { parseYamlToConfigs, runPipelineFromDsl } from '@/engine/pipeline';
import type { RiskRow } from '@/engine/riskModel';
import {
  applyRiskTuningPatch,
  DEFAULT_RISK_TUNING,
  riskTuningForPipelineView,
  type RiskModelTuning,
} from '@/engine/riskModelTuning';
import type { MarketConfig } from '@/engine/types';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import {
  extractMarketDocument,
  mergeStateToFullMultiDoc,
  splitToDslByMarket,
} from '@/lib/multiDocMarketYaml';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  gammaFocusMarket,
  isRunwayMultiMarketStrip,
  RUNWAY_ALL_MARKETS_VALUE,
  runwayCompareMarketIds,
} from '@/lib/markets';

/** Optional `setCountry` behaviour (e.g. remember LIOM when drilling from compare-all). */
export type SetCountryOptions = {
  /**
   * Picker value to offer as “Back” after this navigation. Omit to clear any saved back target.
   * Pass `null` to clear explicitly.
   */
  returnPickerForBack?: string | null;
};
import {
  patchDslTradingMonthlyPattern,
  type TradingMonthlyPatternPatch,
} from '@/lib/dslTradingMonthlyPatch';
import {
  patchDslDeploymentRiskContextMonthCurve,
  type DeploymentRiskContextMonthPatch,
} from '@/lib/dslDeploymentRiskContextMonthPatch';
import {
  patchDslTradingPaydayKnotMultipliers,
} from '@/lib/dslTradingPaydayPatch';
import {
  patchDslTradingWeeklyPattern,
  type TradingWeeklyPatternPatch,
} from '@/lib/dslTradingWeeklyPatch';
import {
  patchDslTechSupportMonthlyPattern,
  patchDslTechSupportWeeklyPattern,
  type TechSupportMonthlyPatternPatch,
  type TechSupportWeeklyPatternPatch,
} from '@/lib/dslTechSupportPatternPatch';
import {
  patchDslResourcesLabsMonthlyPattern,
  patchDslResourcesStaffMonthlyPattern,
  type ResourceCapacityMonthlyPatternPatch,
} from '@/lib/dslResourcesCapacityMonthlyPatch';
import {
  patchDslTechAvailableCapacityPattern,
  type TechAvailableCapacityPatternPatch,
} from '@/lib/dslTechAvailableCapacityPatch';
import { patchDslHolidayStaffingMultiplier, type HolidayStaffingBlockKind } from '@/lib/dslHolidayStaffingPatch';
import { patchDslTechWeeklyPattern, type TechWeeklyPatternPatch } from '@/lib/dslTechRhythmPatch';
import type { PaydayKnotTuple } from '@/engine/paydayMonthShape';
import {
  clampPerLensHeatmapTuning,
  defaultRiskHeatmapTuningByLens,
  type HeatmapTuningLensId,
  type PerLensHeatmapTuning,
} from '@/lib/heatmapTuningPerLens';
import {
  DEFAULT_HEATMAP_MONO_COLOR,
  normalizeHeatmapMonoHex,
  type HeatmapRenderStyle,
} from '@/lib/riskHeatmapColors';
import type { TechWorkloadScope } from '@/lib/runwayViewMetrics';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';
import {
  buildViewSettingsFile,
  parseViewSettingsFile,
  pickViewSettingsPayload,
  sliceViewSettingsForPersist,
  type ViewSettingsExportScope,
  type ViewSettingsFileV1,
  type ViewSettingsPayloadKey,
  type ViewSettingsPayloadV1,
} from '@/lib/viewSettingsPreset';

const CAPACITY_ATC_PERSIST_KEY = 'capacity_atc';
const CAPACITY_ATC_PERSIST_VERSION = 1;

/** Last bundle/server multi-doc passed to hydrateFromStorage (session only; not localStorage). */
let lastBootstrapMultiDoc: string | undefined;

function countParsedMarkets(dsl: string): number {
  try {
    return parseYamlToConfigs(dsl).length;
  } catch {
    return 0;
  }
}

type AtcState = {
  country: string;
  viewMode: ViewModeId;
  theme: 'light' | 'dark';
  /** Ordered ids from `public/data/markets/manifest.json` (matches multi-doc YAML order). */
  runwayMarketOrder: string[];
  /** Editor + applied DSL (applied on Apply). */
  dslText: string;
  dslByMarket: Record<string, string>;
  riskTuning: RiskModelTuning;
  /**
   * Heatmap transfer + pressure Δ per runway lens (Technology Teams, Restaurant Activity, Deployment Risk).
   * Same values for every market column; not YAML.
   */
  riskHeatmapTuningByLens: Record<HeatmapTuningLensId, PerLensHeatmapTuning>;
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  parseError: string | null;
  /** Runway heatmap: optional sparkle / twinkle on every cell when on (dark theme, honour reduced-motion). */
  discoMode: boolean;
  /**
   * Single-market runway only: isometric lattice + extruded pressure columns (skyline).
   * Ignored when comparing all markets.
   */
  runway3dHeatmap: boolean;
  /**
   * Flat heatmaps (quarter grid + compare-all columns): SVG by default. Ignored when single-market 3D runway is on.
   * Turn off for HTML cells + colour swoosh / disco twinkle.
   */
  runwaySvgHeatmap: boolean;
  /**
   * Code view: show the LLM YAML assistant dock (also enabled when URL has `?llm`). Persisted.
   */
  dslLlmAssistantEnabled: boolean;
  /** Runway heatmap: filter by calendar year; `null` = all years in the model. Persisted. */
  runwayFilterYear: number | null;
  /** Runway heatmap: filter by quarter when {@link runwayFilterYear} is set; `null` = full year. Persisted. */
  runwayFilterQuarter: RunwayQuarter | null;
  /**
   * When {@link runwayFilterYear} is set, extend the visible date range through the calendar quarter
   * after the selected span (e.g. full 2026 + Q1 2027). Persisted.
   */
  runwayIncludeFollowingQuarter: boolean;
  /**
   * Single-market runway: selected heatmap day (`YYYY-MM-DD`) for highlight + day summary. Persisted;
   * cleared when switching market or entering LIOM compare.
   */
  runwaySelectedDayYmd: string | null;
  /** Runway cell fill: multi-band temperature ramp vs one hue with alpha by intensity. */
  heatmapRenderStyle: HeatmapRenderStyle;
  /** `#rrggbb` when {@link heatmapRenderStyle} is `mono`. */
  heatmapMonoColor: string;
  /**
   * When {@link heatmapRenderStyle} is `spectrum`, use smooth RGB interpolation between palette anchors
   * instead of 10 solid bands (see `heatmapColorContinuous` in `riskHeatmapColors.ts`).
   */
  heatmapSpectrumContinuous: boolean;
  /**
   * When non-null, workbench shows Back → this picker value (set when opening a single market from
   * LIOM column header). Not persisted.
   */
  runwayReturnPicker: string | null;
  /** When true, Monaco YAML editor is read-only (DSL assistant is streaming or applying). Not persisted. */
  dslAssistantEditorLock: boolean;
  setDslAssistantEditorLock: (v: boolean) => void;
  /** When true, YAML-backed store actions no-op (cloud viewers). Not persisted. */
  dslMutationLocked: boolean;
  setDslMutationLocked: (v: boolean) => void;
  /**
   * Technology lens only: heatmap + slot selection use total tech load, BAU surface only, or project surfaces only.
   */
  techWorkloadScope: TechWorkloadScope;
  setTechWorkloadScope: (v: TechWorkloadScope) => void;
  setCountry: (c: string, options?: SetCountryOptions) => void;
  setViewMode: (v: ViewModeId) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setDiscoMode: (v: boolean) => void;
  setRunway3dHeatmap: (v: boolean) => void;
  setRunwaySvgHeatmap: (v: boolean) => void;
  setDslLlmAssistantEnabled: (v: boolean) => void;
  setRunwayFilterYear: (y: number | null) => void;
  setRunwayFilterQuarter: (q: RunwayQuarter | null) => void;
  setRunwayIncludeFollowingQuarter: (v: boolean) => void;
  setRunwaySelectedDayYmd: (ymd: string | null) => void;
  setHeatmapRenderStyle: (v: HeatmapRenderStyle) => void;
  setHeatmapMonoColor: (hex: string) => void;
  setHeatmapSpectrumContinuous: (v: boolean) => void;
  setDslText: (t: string) => void;
  setRunwayMarketOrder: (ids: string[]) => void;
  setDslByMarket: (m: Record<string, string>) => void;
  setRiskTuning: (patch: Partial<RiskModelTuning>) => void;
  resetRiskTuning: () => void;
  patchRiskHeatmapTuningForLens: (
    lens: HeatmapTuningLensId,
    patch: Partial<PerLensHeatmapTuning>
  ) => void;
  /** Writes explicit Mon–Sun `weekday_intensity` (bundled YAML) for the focused market and re-runs the pipeline. */
  setTechWeeklyPattern: (pattern: TechWeeklyPatternPatch) => void;
  /** Writes explicit Jan–Dec `trading.monthly_pattern` (0–1) for the focused market and re-runs the pipeline. */
  setTradingMonthlyPattern: (pattern: TradingMonthlyPatternPatch) => void;
  /** Writes Jan–Dec `deployment_risk_context_month_curve` (0–1, additive Deployment Risk); all-zero removes the YAML block. */
  setDeploymentRiskContextMonthCurve: (pattern: DeploymentRiskContextMonthPatch) => void;
  /** Writes explicit Mon–Sun `trading.weekly_pattern` (0–1) for the focused market and re-runs the pipeline. */
  setTradingWeeklyPattern: (pattern: TradingWeeklyPatternPatch) => void;
  /** Writes `trading.payday_month_knot_multipliers` for the focused market (removes peak key); re-runs the pipeline. */
  setTradingPaydayKnotMultipliers: (knots: PaydayKnotTuple) => void;
  /** Writes explicit Mon–Sun `extra_support_weekdays` (0–1) for the focused market. */
  setTechSupportWeeklyPattern: (pattern: TechSupportWeeklyPatternPatch) => void;
  /** Writes explicit Jan–Dec `extra_support_months` (0–1) for the focused market. */
  setTechSupportMonthlyPattern: (pattern: TechSupportMonthlyPatternPatch) => void;
  setResourcesLabsMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => void;
  setResourcesStaffMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => void;
  setTechAvailableCapacityPattern: (pattern: TechAvailableCapacityPatternPatch) => void;
  setHolidayStaffingMultiplier: (kind: HolidayStaffingBlockKind, value: number) => void;
  applyDsl: (text?: string) => void;
  resetDsl: () => void;
  /** `multiDocFallback`: bundled or cloud multi-doc YAML from bootstrap (session memory only). */
  hydrateFromStorage: (multiDocFallback?: string) => void;
  /** Last valid `multiDocFallback` from bootstrap (for “reset DSL” without reload). */
  getLastBootstrapMultiDoc: () => string | undefined;
  /** JSON snapshot of persisted UI state (heatmap, filters, tuning — not YAML). */
  exportViewSettingsFile: (scope: ViewSettingsExportScope, label?: string) => ViewSettingsFileV1;
  /** Apply a file from {@link exportViewSettingsFile} or {@link parseViewSettingsFile}. */
  importViewSettingsFromJson: (jsonText: string) => { ok: true } | { ok: false; error: string };
};

function shouldBlockDslMutation(get: () => AtcState): boolean {
  return get().dslMutationLocked;
}

function rerunPipeline(get: () => AtcState, set: (partial: Partial<AtcState>) => void) {
  const full = mergeStateToFullMultiDoc(get());
  if (!full.trim() || !looksLikeYamlDsl(full)) return;
  const { riskTuning, country } = get();
  const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
  set({
    riskSurface: r.riskSurface,
    configs: r.configs,
    parseError: r.parseError ?? null,
  });
}

function mergePersistedViewSettings(
  persistedState: unknown,
  currentState: AtcState
): AtcState {
  if (persistedState === undefined) {
    return currentState;
  }
  if (persistedState === null || typeof persistedState !== 'object') {
    return currentState;
  }
  const p = persistedState as Partial<Record<ViewSettingsPayloadKey, unknown>>;
  const next = { ...currentState };
  for (const key of Object.keys(p) as ViewSettingsPayloadKey[]) {
    if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
    const v = p[key];
    (next as unknown as Record<string, unknown>)[key] = v;
  }
  return next;
}

export const useAtcStore = create<AtcState>()(
  persist(
    (set, get) => ({
      country: RUNWAY_ALL_MARKETS_VALUE,
      viewMode: 'in_store',
      theme: 'dark',
      runwayMarketOrder: [...FALLBACK_RUNWAY_MARKET_IDS],
      dslText: '',
      dslByMarket: {},
      riskTuning: DEFAULT_RISK_TUNING,
      riskHeatmapTuningByLens: defaultRiskHeatmapTuningByLens(),
      runway3dHeatmap: false,
      runwaySvgHeatmap: true,
      dslLlmAssistantEnabled: false,
      runwayFilterYear: null,
      runwayFilterQuarter: null,
      runwayIncludeFollowingQuarter: false,
      runwaySelectedDayYmd: null,
      heatmapRenderStyle: 'spectrum',
      heatmapMonoColor: DEFAULT_HEATMAP_MONO_COLOR,
      heatmapSpectrumContinuous: true,
      riskSurface: [],
      configs: [],
      parseError: null,
      discoMode: false,
      runwayReturnPicker: null,
      dslAssistantEditorLock: false,
      dslMutationLocked: false,
      techWorkloadScope: 'all',

      setDslAssistantEditorLock: (v) => set({ dslAssistantEditorLock: v }),
      setDslMutationLocked: (v) => set({ dslMutationLocked: Boolean(v) }),
      setTechWorkloadScope: (v) => {
        const next: TechWorkloadScope =
          v === 'bau' || v === 'project' || v === 'all' ? v : 'all';
        set({ techWorkloadScope: next });
      },

      setCountry: (c, options?: SetCountryOptions) => {
        const nextRunwayReturnPicker =
          options !== undefined &&
          Object.prototype.hasOwnProperty.call(options, 'returnPickerForBack')
            ? options.returnPickerForBack ?? null
            : null;

        const prev = get().country;
        let dslByMarket = { ...get().dslByMarket };
        if (!isRunwayMultiMarketStrip(prev)) {
          dslByMarket[prev] = get().dslText.trim();
        }
        let runwaySelectedDayYmdPatch: string | null | undefined;
        if (isRunwayMultiMarketStrip(c)) {
          runwaySelectedDayYmdPatch = null;
        } else if (!isRunwayMultiMarketStrip(prev) && prev !== c) {
          runwaySelectedDayYmdPatch = null;
        }
        set({
          country: c,
          dslByMarket,
          runwayReturnPicker: nextRunwayReturnPicker,
          ...(runwaySelectedDayYmdPatch !== undefined
            ? { runwaySelectedDayYmd: runwaySelectedDayYmdPatch }
            : {}),
        });

        const order = get().runwayMarketOrder;
        const riskTuning = get().riskTuning;
        const mergedFromMap = mergeMarketsToMultiDocYaml(get().dslByMarket, order);

        if (isRunwayMultiMarketStrip(c)) {
          const segmentOrder = runwayCompareMarketIds(c, order);
          let segmentYaml = mergeMarketsToMultiDocYaml(get().dslByMarket, segmentOrder);
          if (!segmentYaml.trim() || !looksLikeYamlDsl(segmentYaml)) {
            const fb = segmentOrder[0] ?? order[0]!;
            segmentYaml = get().dslByMarket[fb] ?? defaultDslForMarket(fb);
          }
          if (!looksLikeYamlDsl(segmentYaml)) {
            segmentYaml = defaultDslForMarket(segmentOrder[0] ?? order[0]!);
          }
          const split = splitToDslByMarket(segmentYaml);
          if (Object.keys(split).length) {
            set({ dslByMarket: { ...get().dslByMarket, ...split } });
          }
          set({ dslText: segmentYaml });
          if (get().viewMode === 'code') return;
          const full = mergeStateToFullMultiDoc(get());
          const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, c));
          set({
            riskSurface: r.riskSurface,
            configs: r.configs,
            parseError: r.parseError ?? null,
          });
          return;
        }

        const fallbackMarket = c;
        const singleFromMerged =
          mergedFromMap.trim() && looksLikeYamlDsl(mergedFromMap)
            ? extractMarketDocument(mergedFromMap, c)
            : null;
        let nextSingle =
          singleFromMerged ?? get().dslByMarket[c] ?? defaultDslForMarket(fallbackMarket);
        if (!looksLikeYamlDsl(nextSingle)) nextSingle = defaultDslForMarket(fallbackMarket);
        set({ dslText: nextSingle });
        if (get().viewMode === 'code') return;
        const full = mergeStateToFullMultiDoc(get());
        const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, c));
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
        });
      },

      setViewMode: (v) => {
        const prev = get().viewMode;
        if (prev === 'code' && v !== 'code') {
          get().applyDsl();
        }
        set({ viewMode: v });
      },

      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.classList.toggle('dark', t === 'dark');
      },

      setDiscoMode: (v) => set({ discoMode: v }),

      setRunway3dHeatmap: (v) => set({ runway3dHeatmap: v }),
      setRunwaySvgHeatmap: (v) => set({ runwaySvgHeatmap: v }),
      setDslLlmAssistantEnabled: (v) => set({ dslLlmAssistantEnabled: v }),
      setRunwayFilterYear: (y) =>
        set({
          runwayFilterYear: y,
          runwayFilterQuarter: y == null ? null : get().runwayFilterQuarter,
          runwayIncludeFollowingQuarter: y == null ? false : get().runwayIncludeFollowingQuarter,
        }),
      setRunwayFilterQuarter: (q) => set({ runwayFilterQuarter: q }),
      setRunwayIncludeFollowingQuarter: (v) => set({ runwayIncludeFollowingQuarter: v }),
      setRunwaySelectedDayYmd: (ymd) => {
        if (ymd != null) {
          const t = String(ymd).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
            set({ runwaySelectedDayYmd: null });
            return;
          }
          set({ runwaySelectedDayYmd: t });
          return;
        }
        set({ runwaySelectedDayYmd: null });
      },

      setHeatmapRenderStyle: (v) => set({ heatmapRenderStyle: v }),
      setHeatmapMonoColor: (hex) => set({ heatmapMonoColor: normalizeHeatmapMonoHex(hex) }),
      setHeatmapSpectrumContinuous: (v) => set({ heatmapSpectrumContinuous: Boolean(v) }),

      exportViewSettingsFile: (scope, label) =>
        buildViewSettingsFile(
          pickViewSettingsPayload(get() as unknown as Record<ViewSettingsPayloadKey, unknown>, scope),
          scope,
          label
        ),

      importViewSettingsFromJson: (jsonText) => {
        let raw: unknown;
        try {
          raw = JSON.parse(jsonText);
        } catch {
          return { ok: false, error: 'Could not parse JSON.' };
        }
        const parsed = parseViewSettingsFile(raw);
        if (!parsed.ok) return parsed;

        const { scope, settings } = parsed.file;
        const patch: Partial<ViewSettingsPayloadV1> = { ...settings };
        if (scope === 'preferences') {
          delete patch.country;
          delete patch.viewMode;
        }

        const { country, viewMode, theme, ...rest } = patch;

        if (theme !== undefined) {
          get().setTheme(theme);
        }

        if (scope === 'full' && country !== undefined && country !== get().country) {
          get().setCountry(country, {});
        }
        if (scope === 'full' && viewMode !== undefined && viewMode !== get().viewMode) {
          get().setViewMode(viewMode);
        }

        if (Object.keys(rest).length > 0) {
          set(rest as Partial<AtcState>);
        }

        rerunPipeline(get, set);
        return { ok: true };
      },

      setDslText: (t) => {
        if (shouldBlockDslMutation(get)) return;
        set({ dslText: t });
      },

      setRunwayMarketOrder: (ids) => set({ runwayMarketOrder: ids.length ? [...ids] : [...FALLBACK_RUNWAY_MARKET_IDS] }),

      setDslByMarket: (m) => set({ dslByMarket: m }),

      setRiskTuning: (patch) => {
        const next = applyRiskTuningPatch(get().riskTuning, patch);
        set({ riskTuning: next });
        rerunPipeline(get, set);
      },

      resetRiskTuning: () => {
        set({ riskTuning: DEFAULT_RISK_TUNING });
        rerunPipeline(get, set);
      },

      patchRiskHeatmapTuningForLens: (lens, patch) => {
        set((s) => ({
          riskHeatmapTuningByLens: {
            ...s.riskHeatmapTuningByLens,
            [lens]: clampPerLensHeatmapTuning({ ...s.riskHeatmapTuningByLens[lens], ...patch }),
          },
        }));
      },

      setTechWeeklyPattern: (pattern) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTradingMonthlyPattern: (pattern: TradingMonthlyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTradingMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setDeploymentRiskContextMonthCurve: (pattern: DeploymentRiskContextMonthPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslDeploymentRiskContextMonthCurve(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTradingWeeklyPattern: (pattern: TradingWeeklyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTradingWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTradingPaydayKnotMultipliers: (knots: PaydayKnotTuple) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTradingPaydayKnotMultipliers(full, market, knots);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTechSupportWeeklyPattern: (pattern: TechSupportWeeklyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechSupportWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTechSupportMonthlyPattern: (pattern: TechSupportMonthlyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechSupportMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setResourcesLabsMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslResourcesLabsMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setResourcesStaffMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const staffBasis =
          get().configs.find((x) => x.market === market)?.staffMonthlyPatternBasis === 'absolute'
            ? 'absolute'
            : 'relative';
        const nextFull = patchDslResourcesStaffMonthlyPattern(full, market, pattern, {
          staffBasis,
        });
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setTechAvailableCapacityPattern: (pattern: TechAvailableCapacityPatternPatch) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechAvailableCapacityPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      setHolidayStaffingMultiplier: (kind: HolidayStaffingBlockKind, value: number) => {
        if (shouldBlockDslMutation(get)) return;
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslHolidayStaffingMultiplier(full, market, kind, value);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayMultiMarketStrip(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
      },

      applyDsl: (text) => {
        if (shouldBlockDslMutation(get)) return;
        const dsl = (text ?? get().dslText).trim();
        if (!looksLikeYamlDsl(dsl)) {
          set({
            parseError:
              'Editor content is not valid workspace YAML (e.g. HTML, a JS/TS source file like api/_sharedDslImpl.ts, or a bad cloud pull). Reset the workspace or paste real market DSL. If the team Blob has the wrong file, re-save valid YAML from the editor.',
          });
          return;
        }
        const co = get().country;
        const order = get().runwayMarketOrder;
        let dslByMarket = { ...get().dslByMarket };
        if (!isRunwayMultiMarketStrip(co)) {
          dslByMarket[co] = dsl;
        }
        let full: string;
        if (isRunwayMultiMarketStrip(co)) {
          const splitSeg = splitToDslByMarket(dsl);
          dslByMarket = { ...dslByMarket, ...splitSeg };
          full = mergeMarketsToMultiDocYaml(dslByMarket, order);
        } else {
          full = mergeMarketsToMultiDocYaml(dslByMarket, order);
        }
        const fullFinal = full.trim() && looksLikeYamlDsl(full) ? full : dsl;
        const split = splitToDslByMarket(fullFinal);
        if (Object.keys(split).length) {
          dslByMarket = { ...dslByMarket, ...split };
        }
        const nextEditorText = isRunwayMultiMarketStrip(co)
          ? mergeMarketsToMultiDocYaml(dslByMarket, runwayCompareMarketIds(co, order))
          : dsl;
        set({
          dslText: nextEditorText,
          dslByMarket,
        });
        const r = runPipelineFromDsl(
          fullFinal,
          riskTuningForPipelineView(get().riskTuning, co)
        );
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
        });
      },

      resetDsl: () => {
        if (shouldBlockDslMutation(get)) return;
        const { country, dslByMarket, riskTuning, runwayMarketOrder } = get();
        const merged = mergeMarketsToMultiDocYaml(dslByMarket, runwayMarketOrder);
        const fallbackMarket = isRunwayMultiMarketStrip(country)
          ? (runwayCompareMarketIds(country, runwayMarketOrder)[0] ?? runwayMarketOrder[0]!)
          : country;
        let full =
          merged.trim() && looksLikeYamlDsl(merged)
            ? merged
            : (isRunwayMultiMarketStrip(country)
                ? defaultDslForMarket(fallbackMarket)
                : (dslByMarket[country] ?? defaultDslForMarket(fallbackMarket)));
        if (!looksLikeYamlDsl(full)) full = defaultDslForMarket(fallbackMarket);
        const split = splitToDslByMarket(full);
        const nextByMarket = Object.keys(split).length ? { ...dslByMarket, ...split } : dslByMarket;
        const editorText = isRunwayMultiMarketStrip(country)
          ? mergeMarketsToMultiDocYaml(nextByMarket, runwayCompareMarketIds(country, runwayMarketOrder))
          : extractMarketDocument(full, country) ??
            nextByMarket[country] ??
            defaultDslForMarket(fallbackMarket);
        set({ dslText: looksLikeYamlDsl(editorText) ? editorText : full, dslByMarket: nextByMarket });
        const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
        });
      },

      getLastBootstrapMultiDoc: () => lastBootstrapMultiDoc,

      hydrateFromStorage: (multiDocFallback) => {
        if (multiDocFallback?.trim() && looksLikeYamlDsl(multiDocFallback)) {
          lastBootstrapMultiDoc = multiDocFallback.trim();
        }
        const { country, dslByMarket, riskTuning, runwayMarketOrder } = get();
        const mergedFromDisk = mergeMarketsToMultiDocYaml(dslByMarket, runwayMarketOrder);
        const firstId = runwayMarketOrder[0] ?? FALLBACK_RUNWAY_MARKET_IDS[0]!;
        let singleFallback: string;
        if (isRunwayMultiMarketStrip(country)) {
          const segOrder = runwayCompareMarketIds(country, runwayMarketOrder);
          const segYaml = mergeMarketsToMultiDocYaml(dslByMarket, segOrder);
          const fb = segOrder[0] ?? firstId;
          singleFallback =
            segYaml.trim() && looksLikeYamlDsl(segYaml)
              ? segYaml
              : (dslByMarket[fb] ?? defaultDslForMarket(fb));
        } else {
          singleFallback = dslByMarket[country] ?? defaultDslForMarket(country);
        }
        if (!looksLikeYamlDsl(singleFallback)) {
          if (isRunwayMultiMarketStrip(country)) {
            const fb = runwayCompareMarketIds(country, runwayMarketOrder)[0] ?? firstId;
            singleFallback = defaultDslForMarket(fb);
          } else {
            singleFallback = defaultDslForMarket(country);
          }
        }
        const merged =
          multiDocFallback?.trim() && looksLikeYamlDsl(multiDocFallback)
            ? multiDocFallback.trim()
            : mergedFromDisk;
        const mergedOk = merged.length > 0 && looksLikeYamlDsl(merged);
        const diskOk = mergedFromDisk.length > 0 && looksLikeYamlDsl(mergedFromDisk);
        const bundledCount = mergedOk ? countParsedMarkets(merged) : 0;
        const diskCount = diskOk ? countParsedMarkets(mergedFromDisk) : 0;
        /** Prefer bootstrap/cloud multi-doc when it has more markets than in-memory merge (e.g. new shipped markets). */
        const preferBundled = mergedOk && bundledCount > 0 && (!diskOk || bundledCount > diskCount);
        const dsl = preferBundled ? merged : diskOk ? mergedFromDisk : mergedOk ? merged : singleFallback;
        const split = splitToDslByMarket(dsl);
        const nextByMarket =
          Object.keys(split).length > 0 ? { ...get().dslByMarket, ...split } : { ...get().dslByMarket };
        let dslText = dsl;
        if (isRunwayMultiMarketStrip(country)) {
          dslText = mergeMarketsToMultiDocYaml(
            nextByMarket,
            runwayCompareMarketIds(country, runwayMarketOrder)
          );
          if (!looksLikeYamlDsl(dslText)) dslText = singleFallback;
        } else {
          dslText =
            extractMarketDocument(dsl, country) ?? nextByMarket[country] ?? singleFallback;
          if (!looksLikeYamlDsl(dslText)) dslText = singleFallback;
        }
        set({ dslText, dslByMarket: nextByMarket, runwayReturnPicker: null });
        const r = runPipelineFromDsl(dsl, riskTuningForPipelineView(riskTuning, country));
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
        });
        const th = get().theme;
        document.documentElement.classList.toggle('dark', th === 'dark');
      },
    }),
    {
      name: CAPACITY_ATC_PERSIST_KEY,
      version: CAPACITY_ATC_PERSIST_VERSION,
      partialize: (s) =>
        sliceViewSettingsForPersist(s as unknown as Record<ViewSettingsPayloadKey, unknown>),
      merge: (persistedState, currentState) =>
        mergePersistedViewSettings(persistedState, currentState as AtcState),
    }
  )
);
