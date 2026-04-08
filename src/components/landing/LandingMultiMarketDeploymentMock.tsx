import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { RiskRow } from '@/engine/riskModel';
import type { MarketConfig } from '@/engine/types';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { VIEW_MODES, type ViewModeId } from '@/lib/constants';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { RUNWAY_ALL_MARKETS_LABEL, RUNWAY_ALL_MARKETS_VALUE } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

/** Subset of LIOM for the landing strip (order = compare columns left → right). */
const LANDING_COMPARE_MARKETS = ['DE', 'FR', 'UK', 'AU', 'CA'] as const;

const LANDING_COMPARE_MARKET_SET = new Set<string>(LANDING_COMPARE_MARKETS);

/** ~4 months of ISO dates; grid shows only {@link RiskRow} dates in this band (no full-calendar padding). */
const LANDING_COMPARE_DATE_START = '2026-01-01';
const LANDING_COMPARE_DATE_END = '2026-04-30';

function filterLandingCompareRiskSurface(rows: RiskRow[]): RiskRow[] {
  return rows.filter(
    (r) =>
      LANDING_COMPARE_MARKET_SET.has(r.market) &&
      r.date >= LANDING_COMPARE_DATE_START &&
      r.date <= LANDING_COMPARE_DATE_END
  );
}

type AtcSnapshot = {
  country: string;
  viewMode: ViewModeId;
  dslText: string;
  dslByMarket: Record<string, string>;
  runwayMarketOrder: string[];
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  parseError: string | null;
  runwayReturnPicker: string | null;
  runwayFilterYear: number | null;
  runwayFilterQuarter: RunwayQuarter | null;
  runwayIncludeFollowingQuarter: boolean;
};

function cloneLandingState(): AtcSnapshot {
  const s = useAtcStore.getState();
  return {
    country: s.country,
    viewMode: s.viewMode,
    dslText: s.dslText,
    dslByMarket: { ...s.dslByMarket },
    runwayMarketOrder: [...s.runwayMarketOrder],
    riskSurface: s.riskSurface,
    configs: s.configs,
    parseError: s.parseError,
    runwayReturnPicker: s.runwayReturnPicker,
    runwayFilterYear: s.runwayFilterYear,
    runwayFilterQuarter: s.runwayFilterQuarter,
    runwayIncludeFollowingQuarter: s.runwayIncludeFollowingQuarter,
  };
}

function seedLandingCompareStrip() {
  const dslByMarket: Record<string, string> = {};
  for (const id of LANDING_COMPARE_MARKETS) {
    dslByMarket[id] = defaultDslForMarket(id);
  }
  const order = [...LANDING_COMPARE_MARKETS];
  const st = useAtcStore.getState();
  st.setRunwayMarketOrder(order);
  st.setDslByMarket(dslByMarket);
  st.setDslText(defaultDslForMarket('DE'));
  st.setCountry(RUNWAY_ALL_MARKETS_VALUE, {});
  st.setViewMode('market_risk');
  st.setRunwayFilterYear(null);
  st.setRunwayFilterQuarter(null);
  st.setRunwayIncludeFollowingQuarter(false);
}

function restoreLandingState(snap: AtcSnapshot) {
  useAtcStore.setState({
    country: snap.country,
    viewMode: snap.viewMode,
    dslText: snap.dslText,
    dslByMarket: { ...snap.dslByMarket },
    runwayMarketOrder: [...snap.runwayMarketOrder],
    riskSurface: snap.riskSurface,
    configs: snap.configs,
    parseError: snap.parseError,
    runwayReturnPicker: snap.runwayReturnPicker,
    runwayFilterYear: snap.runwayFilterYear,
    runwayFilterQuarter: snap.runwayFilterQuarter,
    runwayIncludeFollowingQuarter: snap.runwayIncludeFollowingQuarter,
  });
}

export function LandingMultiMarketDeploymentMock() {
  const reducedMotion = useReducedMotion();
  const savedRef = useRef<AtcSnapshot | null>(null);
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const viewMode = useAtcStore((s) => s.viewMode);
  const parseError = useAtcStore((s) => s.parseError);

  const landingRiskSurface = useMemo(() => filterLandingCompareRiskSurface(riskSurface), [riskSurface]);

  const noopSlot = useCallback((_s: SlotSelection | null) => {}, []);

  useLayoutEffect(() => {
    savedRef.current = cloneLandingState();
    seedLandingCompareStrip();
    return () => {
      if (savedRef.current) restoreLandingState(savedRef.current);
    };
  }, []);

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="multimarket-runway-heading"
    >
      <header className="mb-6 sm:mb-8">
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#FFC72C]">
          Compare lanes
        </p>
        <h2
          id="multimarket-runway-heading"
          className="font-landing max-w-3xl text-balance text-2xl font-semibold leading-snug text-white sm:text-[1.65rem]"
        >
          Where's the gap for the next push?
        </h2>
      </header>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,720px)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_min(100%,780px)]">
        <p className="max-w-xs text-pretty text-sm leading-relaxed text-zinc-400 sm:max-w-sm lg:max-w-[15.5rem] lg:pt-0.5 xl:max-w-[17rem]">
          Planning needs a straight answer: <span className="text-zinc-300">which teams or regions can take</span> the
          next pilot or wave without landing on an already hot quarter. The same{' '}
          <span className="text-zinc-300">risk lens</span> runs across every column—here{' '}
          {RUNWAY_ALL_MARKETS_LABEL} with five sample <span className="text-zinc-300">lanes</span> (Germany, France, the
          UK, Australia, and Canada). Your config might be departments, products, or geographies; the idea is identical.
          The preview trims to a few months (January–April 2026), renders only days the model emits, and uses compact
          cells so every column fits without horizontal scroll. Click a cell for the same day-detail card as the
          workbench; open the app for your full programme and configuration.
        </p>

        <div className="w-full min-w-0 justify-self-stretch lg:justify-self-end">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#111114] px-2.5 py-2 sm:px-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-300 sm:text-[10px]">
                  {RUNWAY_ALL_MARKETS_LABEL}
                </span>
                <span className="font-landing text-[9px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[10px]">
                  Workbench preview
                </span>
              </div>
              <div
                className="flex max-w-full flex-wrap justify-end gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-0.5 sm:p-1"
                aria-hidden
              >
                {(['combined', 'in_store', 'market_risk'] as const).map((id) => {
                  const m = VIEW_MODES.find((x) => x.id === id);
                  if (!m) return null;
                  return (
                    <span
                      key={m.id}
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:py-1 sm:text-[11px]',
                        m.id === 'market_risk'
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/80'
                          : 'text-muted-foreground'
                      )}
                    >
                      {m.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="w-full overflow-hidden bg-background p-1.5 sm:p-2">
              {parseError ? (
                <p className="px-2 py-6 text-center text-sm text-destructive">{parseError}</p>
              ) : landingRiskSurface.length > 0 && viewMode === 'market_risk' ? (
                <RunwayGrid
                  riskSurface={landingRiskSurface}
                  viewMode={viewMode}
                  onSlotSelection={noopSlot}
                  disableCompareColumnNavigation
                  landingMinimalChrome
                  landingCompareMarketOrder={LANDING_COMPARE_MARKETS}
                  landingCompareMaxCellPx={12}
                  landingCompareNoScroll
                />
              ) : (
                <div
                  className="flex min-h-[200px] items-center justify-center font-landing text-sm text-muted-foreground"
                  role="status"
                >
                  Loading runway preview…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
