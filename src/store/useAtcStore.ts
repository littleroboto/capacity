import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeViewModeId, STORAGE_KEYS, type ViewModeId } from '@/lib/constants';
import { parseYamlToConfigs, runPipelineFromDsl } from '@/engine/pipeline';
import type { RiskRow } from '@/engine/riskModel';
import { clampRiskTuning, DEFAULT_RISK_TUNING, type RiskModelTuning } from '@/engine/riskModelTuning';
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
import { patchDslRiskHeatmapVisual } from '@/lib/dslRiskHeatmapPatch';
import {
  patchDslTradingMonthlyPattern,
  type TradingMonthlyPatternPatch,
} from '@/lib/dslTradingMonthlyPatch';
import { patchDslTechWeeklyPattern, type TechWeeklyPatternPatch } from '@/lib/dslTechRhythmPatch';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import { syncRiskHeatmapVisualFromConfigs } from '@/lib/heatmapVisualFromConfigs';
import { getAtcDsl, setAtcDsl, setStored, getStored } from '@/lib/storage';

/** Debounce writes to `atc_dsl` while dragging the heatmap γ slider. */
let atcDslGammaPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while painting `tech.weekly_pattern`. */
let atcDslTechRhythmPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce writes to `atc_dsl` while editing `trading.monthly_pattern`. */
let atcDslTradingMonthlyPersistTimer: ReturnType<typeof setTimeout> | null = null;

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
  /** Pressure heatmap: γ for power/sigmoid/log (see `risk_heatmap_gamma` in YAML). */
  riskHeatmapGamma: number;
  /** Pressure heatmap transfer (`risk_heatmap_curve` in YAML; `power` = default / legacy). */
  riskHeatmapCurve: RiskHeatmapCurveId;
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  parseError: string | null;
  /** Runway heatmap: optional sparkle / twinkle on every cell when on (dark theme, honour reduced-motion). */
  discoMode: boolean;
  setCountry: (c: string) => void;
  setViewMode: (v: ViewModeId) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setDiscoMode: (v: boolean) => void;
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
  applyDsl: (text?: string) => void;
  resetDsl: () => void;
  /** `multiDocFallback`: bundled all-markets YAML when `atc_dsl` is empty (first visit). */
  hydrateFromStorage: (multiDocFallback?: string) => void;
};

function rerunPipeline(get: () => AtcState, set: (partial: Partial<AtcState>) => void) {
  const full = mergeStateToFullMultiDoc(get());
  if (!full.trim() || !looksLikeYamlDsl(full)) return;
  const { riskTuning, country, runwayMarketOrder } = get();
  const r = runPipelineFromDsl(full, riskTuning);
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
      theme: getStored('theme') === 'dark' ? 'dark' : 'light',
      runwayMarketOrder: [...FALLBACK_RUNWAY_MARKET_IDS],
      dslText: '',
      dslByMarket: {},
      riskTuning: DEFAULT_RISK_TUNING,
      riskHeatmapGamma: 1,
      riskHeatmapCurve: 'power',
      riskSurface: [],
      configs: [],
      parseError: null,
      discoMode: false,

      setCountry: (c) => {
        setStored('picker', c);
        const prev = get().country;
        let dslByMarket = { ...get().dslByMarket };
        if (!isRunwayAllMarkets(prev)) {
          dslByMarket[prev] = get().dslText.trim();
        }
        set({ country: c, dslByMarket });

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
          const r = runPipelineFromDsl(full, riskTuning);
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
        const full = mergeStateToFullMultiDoc(get());
        const r = runPipelineFromDsl(full, riskTuning);
        set({
          riskSurface: r.riskSurface,
          configs: r.configs,
          parseError: r.parseError ?? null,
          ...syncRiskHeatmapVisualFromConfigs(r.configs, c, get().runwayMarketOrder),
        });
      },

      setViewMode: (v) => {
        setStored('layer', v);
        set({ viewMode: v });
      },

      setTheme: (t) => {
        setStored('theme', t);
        set({ theme: t });
        document.documentElement.classList.toggle('dark', t === 'dark');
      },

      setDiscoMode: (v) => set({ discoMode: v }),

      setDslText: (t) => set({ dslText: t }),

      setRunwayMarketOrder: (ids) => set({ runwayMarketOrder: ids.length ? [...ids] : [...FALLBACK_RUNWAY_MARKET_IDS] }),

      setDslByMarket: (m) => set({ dslByMarket: m }),

      setRiskTuning: (patch) => {
        const next = clampRiskTuning({ ...get().riskTuning, ...patch });
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
        set({ riskHeatmapGamma: g, dslText, dslByMarket });
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
        const r = runPipelineFromDsl(fullFinal, get().riskTuning);
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
        const r = runPipelineFromDsl(full, riskTuning);
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
        set({ dslText, dslByMarket: nextByMarket });
        const r = runPipelineFromDsl(dsl, riskTuning);
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
      /** One-time: blend-weight UI removed — snap persisted importances to fixed balanced mix. */
      version: 1,
      migrate: (persistedState, fromVersion) => {
        const ps = (persistedState ?? {}) as Partial<{
          country: string;
          viewMode: ViewModeId;
          theme: 'light' | 'dark';
          riskTuning: RiskModelTuning;
          discoMode: boolean;
        }>;
        if (fromVersion < 1) {
          return {
            ...ps,
            riskTuning: clampRiskTuning(DEFAULT_RISK_TUNING),
          };
        }
        return ps;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AtcState> & { runwayCompareAllMarkets?: boolean };
        const { stressCutoff: _legacyStressCutoff, ...pWithoutStress } = p as Partial<AtcState> & {
          stressCutoff?: number;
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
        return {
          ...rest,
          country,
          viewMode: normalizeViewModeId(typeof base.viewMode === 'string' ? base.viewMode : 'combined'),
          riskTuning: clampRiskTuning({ ...DEFAULT_RISK_TUNING, ...base.riskTuning }),
        };
      },
      partialize: (s) => ({
        country: s.country,
        viewMode: s.viewMode,
        theme: s.theme,
        riskTuning: s.riskTuning,
        discoMode: s.discoMode,
      }),
    }
  )
);
