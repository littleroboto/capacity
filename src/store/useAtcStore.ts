import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeViewModeId, STORAGE_KEYS, type ViewModeId } from '@/lib/constants';
import { parseYamlToConfigs, runPipelineFromDsl } from '@/engine/pipeline';
import type { RiskRow } from '@/engine/riskModel';
import {
  applyRiskTuningPatch,
  DEFAULT_RISK_TUNING,
  riskTuningForPipelineView,
  riskTuningFromPersisted,
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
  isRunwayAllMarkets,
  RUNWAY_ALL_MARKETS_VALUE,
} from '@/lib/markets';

/** Optional `setCountry` behaviour (e.g. remember LIOM when drilling from compare-all). */
export type SetCountryOptions = {
  /**
   * Picker value to offer as “Back” after this navigation. Omit to clear any saved back target.
   * Pass `null` to clear explicitly.
   */
  returnPickerForBack?: string | null;
};
import { patchDslRiskHeatmapVisual } from '@/lib/dslRiskHeatmapPatch';
import {
  patchDslTradingMonthlyPattern,
  type TradingMonthlyPatternPatch,
} from '@/lib/dslTradingMonthlyPatch';
import {
  patchDslDeploymentRiskContextMonthCurve,
  type DeploymentRiskContextMonthPatch,
} from '@/lib/dslDeploymentRiskContextMonthPatch';
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
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import {
  DEFAULT_HEATMAP_MONO_COLOR,
  normalizeHeatmapMonoHex,
  type HeatmapRenderStyle,
} from '@/lib/riskHeatmapColors';
import { syncRiskHeatmapVisualFromConfigs } from '@/lib/heatmapVisualFromConfigs';
import type { TechWorkloadScope } from '@/lib/runwayViewMetrics';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';
import { getAtcDsl, setAtcDsl, setStored, getStored } from '@/lib/storage';

/** Debounce writes to `atc_dsl` while dragging the heatmap γ slider. */
let atcDslGammaPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while painting `tech.weekly_pattern`. */
let atcDslTechRhythmPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while editing `trading.monthly_pattern`. */
let atcDslTradingMonthlyPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes while editing `deployment_risk_context_month_curve`. */
let atcDslDeploymentRiskContextPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while editing `trading.weekly_pattern`. */
let atcDslTradingWeeklyPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while editing `tech.support_*_pattern`. */
let atcDslTechSupportPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes while editing tech capacity planning (resources / tech.available / holiday staffing). */
let atcDslTechCapacityPlanningPersistTimer: ReturnType<typeof setTimeout> | null = null;

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
  /** Panel slider + legacy YAML: Technology lens γ. */
  riskHeatmapGamma: number;
  riskHeatmapGammaTech: number;
  riskHeatmapGammaBusiness: number;
  /** Pressure heatmap transfer (`risk_heatmap_curve` in YAML; `power` = default / legacy). */
  riskHeatmapCurve: RiskHeatmapCurveId;
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
  /** Runway cell fill: multi-band temperature ramp vs one hue with alpha by intensity. */
  heatmapRenderStyle: HeatmapRenderStyle;
  /** `#rrggbb` when {@link heatmapRenderStyle} is `mono`. */
  heatmapMonoColor: string;
  /**
   * When non-null, workbench shows Back → this picker value (set when opening a single market from
   * LIOM column header). Not persisted.
   */
  runwayReturnPicker: string | null;
  /** When true, Monaco YAML editor is read-only (DSL assistant is streaming or applying). Not persisted. */
  dslAssistantEditorLock: boolean;
  setDslAssistantEditorLock: (v: boolean) => void;
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
  setHeatmapRenderStyle: (v: HeatmapRenderStyle) => void;
  setHeatmapMonoColor: (hex: string) => void;
  setDslText: (t: string) => void;
  setRunwayMarketOrder: (ids: string[]) => void;
  setDslByMarket: (m: Record<string, string>) => void;
  setRiskTuning: (patch: Partial<RiskModelTuning>) => void;
  resetRiskTuning: () => void;
  setRiskHeatmapGamma: (gamma: number) => void;
  setRiskHeatmapCurve: (curve: RiskHeatmapCurveId) => void;
  /** Writes explicit Mon–Sun `tech.weekly_pattern` for the focused market and re-runs the pipeline. */
  setTechWeeklyPattern: (pattern: TechWeeklyPatternPatch) => void;
  /** Writes explicit Jan–Dec `trading.monthly_pattern` (0–1) for the focused market and re-runs the pipeline. */
  setTradingMonthlyPattern: (pattern: TradingMonthlyPatternPatch) => void;
  /** Writes Jan–Dec `deployment_risk_context_month_curve` (0–1, additive Market risk); all-zero removes the YAML block. */
  setDeploymentRiskContextMonthCurve: (pattern: DeploymentRiskContextMonthPatch) => void;
  /** Writes explicit Mon–Sun `trading.weekly_pattern` (0–1) for the focused market and re-runs the pipeline. */
  setTradingWeeklyPattern: (pattern: TradingWeeklyPatternPatch) => void;
  /** Writes explicit Mon–Sun `tech.support_weekly_pattern` (0–1) for the focused market. */
  setTechSupportWeeklyPattern: (pattern: TechSupportWeeklyPatternPatch) => void;
  /** Writes explicit Jan–Dec `tech.support_monthly_pattern` (0–1) for the focused market. */
  setTechSupportMonthlyPattern: (pattern: TechSupportMonthlyPatternPatch) => void;
  setResourcesLabsMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => void;
  setResourcesStaffMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => void;
  setTechAvailableCapacityPattern: (pattern: TechAvailableCapacityPatternPatch) => void;
  setHolidayStaffingMultiplier: (kind: HolidayStaffingBlockKind, value: number) => void;
  applyDsl: (text?: string) => void;
  resetDsl: () => void;
  /** `multiDocFallback`: bundled all-markets YAML when `atc_dsl` is empty (first visit). */
  hydrateFromStorage: (multiDocFallback?: string) => void;
};

function rerunPipeline(get: () => AtcState, set: (partial: Partial<AtcState>) => void) {
  const full = mergeStateToFullMultiDoc(get());
  if (!full.trim() || !looksLikeYamlDsl(full)) return;
  const { riskTuning, country, runwayMarketOrder } = get();
  const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
  set({
    riskSurface: r.riskSurface,
    configs: r.configs,
    parseError: r.parseError ?? null,
    ...syncRiskHeatmapVisualFromConfigs(r.configs, country, runwayMarketOrder),
  });
}

function initialViewMode(): ViewModeId {
  return normalizeViewModeId(getStored('layer'));
}

export const useAtcStore = create<AtcState>()(
  persist(
    (set, get) => ({
      country: getStored('picker') || 'DE',
      viewMode: initialViewMode(),
      theme: getStored('theme') === 'light' ? 'light' : 'dark',
      runwayMarketOrder: [...FALLBACK_RUNWAY_MARKET_IDS],
      dslText: '',
      dslByMarket: {},
      riskTuning: DEFAULT_RISK_TUNING,
      riskHeatmapGamma: 1,
      riskHeatmapGammaTech: 1,
      riskHeatmapGammaBusiness: 1,
      riskHeatmapCurve: 'power',
      runway3dHeatmap: false,
      runwaySvgHeatmap: true,
      dslLlmAssistantEnabled: false,
      runwayFilterYear: null,
      runwayFilterQuarter: null,
      runwayIncludeFollowingQuarter: false,
      heatmapRenderStyle: 'spectrum',
      heatmapMonoColor: DEFAULT_HEATMAP_MONO_COLOR,
      riskSurface: [],
      configs: [],
      parseError: null,
      discoMode: false,
      runwayReturnPicker: null,
      dslAssistantEditorLock: false,
      techWorkloadScope: 'all',

      setDslAssistantEditorLock: (v) => set({ dslAssistantEditorLock: v }),
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

        setStored('picker', c);
        const prev = get().country;
        let dslByMarket = { ...get().dslByMarket };
        if (!isRunwayAllMarkets(prev)) {
          dslByMarket[prev] = get().dslText.trim();
        }
        set({ country: c, dslByMarket, runwayReturnPicker: nextRunwayReturnPicker });

        const order = get().runwayMarketOrder;
        const riskTuning = get().riskTuning;
        const mergedFromMap = mergeMarketsToMultiDocYaml(get().dslByMarket, order);

        if (isRunwayAllMarkets(c)) {
          let full = mergedFromMap;
          if (!full.trim() || !looksLikeYamlDsl(full)) {
            const fb = order[0]!;
            full = get().dslByMarket[fb] ?? defaultDslForMarket(fb);
          }
          if (!looksLikeYamlDsl(full)) full = defaultDslForMarket(order[0]!);
          const split = splitToDslByMarket(full);
          if (Object.keys(split).length) {
            set({ dslByMarket: { ...get().dslByMarket, ...split } });
          }
          set({ dslText: full });
          if (get().viewMode === 'code') return;
          const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, c));
          set({
            riskSurface: r.riskSurface,
            configs: r.configs,
            parseError: r.parseError ?? null,
            ...syncRiskHeatmapVisualFromConfigs(r.configs, c, get().runwayMarketOrder),
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
          ...syncRiskHeatmapVisualFromConfigs(r.configs, c, get().runwayMarketOrder),
        });
      },

      setViewMode: (v) => {
        const prev = get().viewMode;
        if (prev === 'code' && v !== 'code') {
          get().applyDsl();
        }
        setStored('layer', v);
        set({ viewMode: v });
      },

      setTheme: (t) => {
        setStored('theme', t);
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

      setHeatmapRenderStyle: (v) => set({ heatmapRenderStyle: v }),
      setHeatmapMonoColor: (hex) => set({ heatmapMonoColor: normalizeHeatmapMonoHex(hex) }),

      setDslText: (t) => set({ dslText: t }),

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

      setRiskHeatmapGamma: (gamma) => {
        const g = Math.min(3, Math.max(0.35, Math.round(gamma * 100) / 100));
        const state = get();
        const { country, configs, riskHeatmapCurve } = state;
        const market = gammaFocusMarket(country, configs);
        const full = mergeStateToFullMultiDoc(state);
        const nextFull = patchDslRiskHeatmapVisual(full, market, { gamma: g, curve: riskHeatmapCurve });
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ riskHeatmapGamma: g, riskHeatmapGammaTech: g, riskHeatmapGammaBusiness: g, dslText, dslByMarket });
        if (atcDslGammaPersistTimer != null) clearTimeout(atcDslGammaPersistTimer);
        atcDslGammaPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslGammaPersistTimer = null;
        }, 450);
      },

      setRiskHeatmapCurve: (curve) => {
        const state = get();
        const { country, configs, riskHeatmapGamma } = state;
        const market = gammaFocusMarket(country, configs);
        const full = mergeStateToFullMultiDoc(state);
        const nextFull = patchDslRiskHeatmapVisual(full, market, {
          gamma: riskHeatmapGamma,
          curve,
        });
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ riskHeatmapCurve: curve, dslText, dslByMarket });
        if (atcDslGammaPersistTimer != null) clearTimeout(atcDslGammaPersistTimer);
        atcDslGammaPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslGammaPersistTimer = null;
        }, 450);
      },

      setTechWeeklyPattern: (pattern) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechRhythmPersistTimer != null) clearTimeout(atcDslTechRhythmPersistTimer);
        atcDslTechRhythmPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechRhythmPersistTimer = null;
        }, 450);
      },

      setTradingMonthlyPattern: (pattern: TradingMonthlyPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTradingMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTradingMonthlyPersistTimer != null) clearTimeout(atcDslTradingMonthlyPersistTimer);
        atcDslTradingMonthlyPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTradingMonthlyPersistTimer = null;
        }, 450);
      },

      setDeploymentRiskContextMonthCurve: (pattern: DeploymentRiskContextMonthPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslDeploymentRiskContextMonthCurve(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslDeploymentRiskContextPersistTimer != null) {
          clearTimeout(atcDslDeploymentRiskContextPersistTimer);
        }
        atcDslDeploymentRiskContextPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslDeploymentRiskContextPersistTimer = null;
        }, 450);
      },

      setTradingWeeklyPattern: (pattern: TradingWeeklyPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTradingWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTradingWeeklyPersistTimer != null) clearTimeout(atcDslTradingWeeklyPersistTimer);
        atcDslTradingWeeklyPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTradingWeeklyPersistTimer = null;
        }, 450);
      },

      setTechSupportWeeklyPattern: (pattern: TechSupportWeeklyPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechSupportWeeklyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechSupportPersistTimer != null) clearTimeout(atcDslTechSupportPersistTimer);
        atcDslTechSupportPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechSupportPersistTimer = null;
        }, 450);
      },

      setTechSupportMonthlyPattern: (pattern: TechSupportMonthlyPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechSupportMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechSupportPersistTimer != null) clearTimeout(atcDslTechSupportPersistTimer);
        atcDslTechSupportPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechSupportPersistTimer = null;
        }, 450);
      },

      setResourcesLabsMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslResourcesLabsMonthlyPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechCapacityPlanningPersistTimer != null) clearTimeout(atcDslTechCapacityPlanningPersistTimer);
        atcDslTechCapacityPlanningPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechCapacityPlanningPersistTimer = null;
        }, 450);
      },

      setResourcesStaffMonthlyPattern: (pattern: ResourceCapacityMonthlyPatternPatch) => {
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
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechCapacityPlanningPersistTimer != null) clearTimeout(atcDslTechCapacityPlanningPersistTimer);
        atcDslTechCapacityPlanningPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechCapacityPlanningPersistTimer = null;
        }, 450);
      },

      setTechAvailableCapacityPattern: (pattern: TechAvailableCapacityPatternPatch) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslTechAvailableCapacityPattern(full, market, pattern);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechCapacityPlanningPersistTimer != null) clearTimeout(atcDslTechCapacityPlanningPersistTimer);
        atcDslTechCapacityPlanningPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechCapacityPlanningPersistTimer = null;
        }, 450);
      },

      setHolidayStaffingMultiplier: (kind: HolidayStaffingBlockKind, value: number) => {
        const state = get();
        const { country, configs, runwayMarketOrder } = state;
        const market = gammaFocusMarket(country, configs, runwayMarketOrder);
        const full = mergeStateToFullMultiDoc(state);
        if (!full.trim() || !looksLikeYamlDsl(full)) return;
        const nextFull = patchDslHolidayStaffingMultiplier(full, market, kind, value);
        const split = splitToDslByMarket(nextFull);
        const dslByMarket = { ...state.dslByMarket, ...split };
        let dslText = nextFull;
        if (!isRunwayAllMarkets(country)) {
          dslText = extractMarketDocument(nextFull, country) ?? nextFull;
        }
        set({ dslText, dslByMarket });
        rerunPipeline(get, set);
        if (atcDslTechCapacityPlanningPersistTimer != null) clearTimeout(atcDslTechCapacityPlanningPersistTimer);
        atcDslTechCapacityPlanningPersistTimer = setTimeout(() => {
          setAtcDsl(mergeStateToFullMultiDoc(get()));
          atcDslTechCapacityPlanningPersistTimer = null;
        }, 450);
      },

      applyDsl: (text) => {
        const dsl = (text ?? get().dslText).trim();
        if (!looksLikeYamlDsl(dsl)) {
          set({
            parseError: 'Editor content looks like HTML or a page bundle, not YAML. Use Reset or paste a valid DSL.',
          });
          return;
        }
        const co = get().country;
        const order = get().runwayMarketOrder;
        let dslByMarket = { ...get().dslByMarket };
        if (!isRunwayAllMarkets(co)) {
          dslByMarket[co] = dsl;
        }
        const full = isRunwayAllMarkets(co)
          ? dsl
          : mergeMarketsToMultiDocYaml(dslByMarket, order);
        const fullFinal = full.trim() && looksLikeYamlDsl(full) ? full : dsl;
        const split = splitToDslByMarket(fullFinal);
        if (Object.keys(split).length) {
          dslByMarket = { ...dslByMarket, ...split };
        }
        setAtcDsl(fullFinal);
        set({
          dslText: isRunwayAllMarkets(co) ? fullFinal : dsl,
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
          ...syncRiskHeatmapVisualFromConfigs(r.configs, co, get().runwayMarketOrder),
        });
      },

      resetDsl: () => {
        const { country, dslByMarket, riskTuning, runwayMarketOrder } = get();
        const merged = mergeMarketsToMultiDocYaml(dslByMarket, runwayMarketOrder);
        const fallbackMarket = isRunwayAllMarkets(country) ? runwayMarketOrder[0]! : country;
        let full =
          merged.trim() && looksLikeYamlDsl(merged)
            ? merged
            : (dslByMarket[country] ?? defaultDslForMarket(fallbackMarket));
        if (!looksLikeYamlDsl(full)) full = defaultDslForMarket(fallbackMarket);
        const split = splitToDslByMarket(full);
        const nextByMarket = Object.keys(split).length ? { ...dslByMarket, ...split } : dslByMarket;
        const editorText = isRunwayAllMarkets(country)
          ? full
          : extractMarketDocument(full, country) ??
            nextByMarket[country] ??
            defaultDslForMarket(fallbackMarket);
        set({ dslText: looksLikeYamlDsl(editorText) ? editorText : full, dslByMarket: nextByMarket });
        setAtcDsl(full);
        const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
          ...syncRiskHeatmapVisualFromConfigs(r.configs, country, get().runwayMarketOrder),
        });
      },

      hydrateFromStorage: (multiDocFallback) => {
        const atc = getAtcDsl();
        const { country, dslByMarket, riskTuning, runwayMarketOrder } = get();
        const mergedFromDisk = mergeMarketsToMultiDocYaml(dslByMarket, runwayMarketOrder);
        const firstId = runwayMarketOrder[0] ?? FALLBACK_RUNWAY_MARKET_IDS[0]!;
        let singleFallback: string;
        if (isRunwayAllMarkets(country)) {
          singleFallback =
            mergedFromDisk.trim() && looksLikeYamlDsl(mergedFromDisk)
              ? mergedFromDisk
              : defaultDslForMarket(firstId);
        } else {
          singleFallback = dslByMarket[country] ?? defaultDslForMarket(country);
        }
        if (!looksLikeYamlDsl(singleFallback)) {
          singleFallback = isRunwayAllMarkets(country) ? defaultDslForMarket(firstId) : defaultDslForMarket(country);
        }
        const merged =
          multiDocFallback?.trim() && looksLikeYamlDsl(multiDocFallback)
            ? multiDocFallback.trim()
            : mergedFromDisk;
        const mergedOk = merged.length > 0 && looksLikeYamlDsl(merged);
        const storedOk = Boolean(atc?.trim()) && looksLikeYamlDsl(atc);
        if (atc?.trim() && !storedOk) {
          setAtcDsl(null);
        }
        const bundledCount = mergedOk ? countParsedMarkets(merged) : 0;
        const storedCount = storedOk ? countParsedMarkets(atc!) : 0;
        /** Shipped market list grew (e.g. IT/ES/PL): do not let an old `atc_dsl` win over the fetched bundle. */
        const preferBundled =
          mergedOk && bundledCount > 0 && (!storedOk || storedCount < bundledCount);
        const dsl = preferBundled ? merged : storedOk ? atc! : mergedOk ? merged : singleFallback;
        if (preferBundled && storedOk && storedCount < bundledCount) {
          setAtcDsl(merged);
        }
        const split = splitToDslByMarket(dsl);
        const nextByMarket =
          Object.keys(split).length > 0 ? { ...get().dslByMarket, ...split } : { ...get().dslByMarket };
        let dslText = dsl;
        if (!isRunwayAllMarkets(country)) {
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
          ...syncRiskHeatmapVisualFromConfigs(r.configs, country, get().runwayMarketOrder),
        });
        const th = get().theme;
        document.documentElement.classList.toggle('dark', th === 'dark');
      },
    }),
    {
      name: STORAGE_KEYS.capacity_atc,
      /** v1: balanced risk tuning. v2: default heatmap mono. v3: default temperature-band (spectrum) heatmap. v4: tech workload scope. v5: DSL LLM assistant toybox toggle. v6: runway year/quarter filter. v7: runway + following quarter. */
      version: 7,
      migrate: (persistedState, fromVersion) => {
        let ps = { ...(persistedState ?? {}) } as Record<string, unknown>;
        if (fromVersion < 1) {
          ps = {
            ...ps,
            riskTuning: riskTuningFromPersisted({}),
          };
        }
        if (fromVersion < 2) {
          ps = {
            ...ps,
            heatmapRenderStyle: 'mono',
            heatmapMonoColor: normalizeHeatmapMonoHex(DEFAULT_HEATMAP_MONO_COLOR),
          };
        }
        if (fromVersion < 3) {
          ps = {
            ...ps,
            heatmapRenderStyle: 'spectrum',
          };
        }
        if (fromVersion < 4) {
          ps = {
            ...ps,
            techWorkloadScope: 'all',
          };
        }
        if (fromVersion < 5) {
          ps = {
            ...ps,
            dslLlmAssistantEnabled: false,
          };
        }
        if (fromVersion < 6) {
          ps = {
            ...ps,
            runwayFilterYear: null,
            runwayFilterQuarter: null,
          };
        }
        if (fromVersion < 7) {
          ps = {
            ...ps,
            runwayIncludeFollowingQuarter: false,
          };
        }
        return ps;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AtcState> & {
          runwayCompareAllMarkets?: boolean;
          runwayCompareSvgHeatmap?: boolean;
          runwaySvgHeatmap?: boolean;
        };
        const {
          stressCutoff: _legacyStressCutoff,
          riskHeatmapStressCutoff: _dropStressCutoff,
          runwayCompareSvgHeatmap: legacyCompareSvg,
          runwaySvgHeatmap: persistedSvg,
          ...pWithoutStress
        } = p as Partial<AtcState> & {
          stressCutoff?: number;
          riskHeatmapStressCutoff?: number;
          runwayCompareSvgHeatmap?: boolean;
          runwaySvgHeatmap?: boolean;
        };
        const base = { ...current, ...pWithoutStress };
        let country = base.country;
        if (p.runwayCompareAllMarkets === true) {
          country = RUNWAY_ALL_MARKETS_VALUE;
          setStored('picker', country);
        }
        const { runwayCompareAllMarkets: _drop, ...rest } = base as typeof base & {
          runwayCompareAllMarkets?: boolean;
        };
        const runwaySvgHeatmap =
          typeof persistedSvg === 'boolean'
            ? persistedSvg
            : typeof legacyCompareSvg === 'boolean'
              ? legacyCompareSvg
              : current.runwaySvgHeatmap;
        const heatmapRenderStyle: HeatmapRenderStyle =
          base.heatmapRenderStyle === 'mono' || base.heatmapRenderStyle === 'spectrum'
            ? base.heatmapRenderStyle
            : current.heatmapRenderStyle;
        const heatmapMonoColor = normalizeHeatmapMonoHex(
          typeof base.heatmapMonoColor === 'string' ? base.heatmapMonoColor : current.heatmapMonoColor
        );
        const theme: 'light' | 'dark' =
          base.theme === 'light' || base.theme === 'dark' ? base.theme : current.theme;
        const tw = base.techWorkloadScope;
        const techWorkloadScope: TechWorkloadScope =
          tw === 'bau' || tw === 'project' || tw === 'all' ? tw : 'all';
        const dslLlmAssistantEnabled =
          typeof base.dslLlmAssistantEnabled === 'boolean'
            ? base.dslLlmAssistantEnabled
            : current.dslLlmAssistantEnabled;
        const runwayFilterYear =
          typeof base.runwayFilterYear === 'number' && Number.isFinite(base.runwayFilterYear)
            ? base.runwayFilterYear
            : base.runwayFilterYear === null
              ? null
              : current.runwayFilterYear;
        const rq = base.runwayFilterQuarter;
        const runwayFilterQuarter: RunwayQuarter | null =
          rq === 1 || rq === 2 || rq === 3 || rq === 4 ? rq : rq === null ? null : current.runwayFilterQuarter;
        const runwayIncludeFollowingQuarter =
          typeof base.runwayIncludeFollowingQuarter === 'boolean'
            ? base.runwayIncludeFollowingQuarter
            : current.runwayIncludeFollowingQuarter;
        return {
          ...rest,
          country,
          viewMode: normalizeViewModeId(typeof base.viewMode === 'string' ? base.viewMode : 'combined'),
          riskTuning: riskTuningFromPersisted(base.riskTuning as Partial<RiskModelTuning>),
          runwaySvgHeatmap,
          heatmapRenderStyle,
          heatmapMonoColor,
          theme,
          techWorkloadScope,
          dslLlmAssistantEnabled,
          runwayFilterYear,
          runwayFilterQuarter,
          runwayIncludeFollowingQuarter,
        };
      },
      partialize: (s) => ({
        country: s.country,
        viewMode: s.viewMode,
        theme: s.theme,
        riskTuning: s.riskTuning,
        discoMode: s.discoMode,
        runway3dHeatmap: s.runway3dHeatmap,
        runwaySvgHeatmap: s.runwaySvgHeatmap,
        heatmapRenderStyle: s.heatmapRenderStyle,
        heatmapMonoColor: s.heatmapMonoColor,
        techWorkloadScope: s.techWorkloadScope,
        dslLlmAssistantEnabled: s.dslLlmAssistantEnabled,
        runwayFilterYear: s.runwayFilterYear,
        runwayFilterQuarter: s.runwayFilterQuarter,
        runwayIncludeFollowingQuarter: s.runwayIncludeFollowingQuarter,
      }),
    }
  )
);
