import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { RiskRow } from '@/engine/riskModel';
import type { MarketConfig } from '@/engine/types';
import { RunwayGrid, type SlotSelection } from '@/components/RunwayGrid';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { WORKBENCH_URL_KEYS } from '@/lib/workbenchUrlViewState';
import { useAtcStore } from '@/store/useAtcStore';
import type { ViewModeId } from '@/lib/constants';
import type { RunwayQuarter } from '@/lib/runwayDateFilter';

const LANDING_HERO_MARKET = 'AU';
const LANDING_HERO_FROM = '2026-04-23';
const LANDING_HERO_TO = '2027-09-23';

type LandingWorkbenchSnap = {
  country: string;
  viewMode: ViewModeId;
  theme: 'light' | 'dark';
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
  runwayCustomRangeStartYmd: string | null;
  runwayCustomRangeEndYmd: string | null;
  runwayLedgerExcludedEntryIds: string[];
  runwayLedgerImplicitBaselineFootprint: boolean;
};

function cloneLandingWorkbenchSnap(): LandingWorkbenchSnap {
  const s = useAtcStore.getState();
  return {
    country: s.country,
    viewMode: s.viewMode,
    theme: s.theme,
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
    runwayCustomRangeStartYmd: s.runwayCustomRangeStartYmd,
    runwayCustomRangeEndYmd: s.runwayCustomRangeEndYmd,
    runwayLedgerExcludedEntryIds: [...s.runwayLedgerExcludedEntryIds],
    runwayLedgerImplicitBaselineFootprint: s.runwayLedgerImplicitBaselineFootprint,
  };
}

function restoreLandingWorkbenchSnap(snap: LandingWorkbenchSnap) {
  useAtcStore.setState({
    country: snap.country,
    viewMode: snap.viewMode,
    theme: snap.theme,
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
    runwayCustomRangeStartYmd: snap.runwayCustomRangeStartYmd,
    runwayCustomRangeEndYmd: snap.runwayCustomRangeEndYmd,
    runwayLedgerExcludedEntryIds: [...snap.runwayLedgerExcludedEntryIds],
    runwayLedgerImplicitBaselineFootprint: snap.runwayLedgerImplicitBaselineFootprint,
  });
  document.documentElement.classList.remove('dark');
}

function seedAuSingleMarketWorkbenchDemo() {
  const st = useAtcStore.getState();
  st.setTheme('light');
  st.setRunwayMarketOrder([LANDING_HERO_MARKET]);
  st.setDslByMarket({ [LANDING_HERO_MARKET]: defaultDslForMarket(LANDING_HERO_MARKET) });
  st.setRunwayCustomRangeFields({
    startYmd: LANDING_HERO_FROM,
    endYmd: LANDING_HERO_TO,
  });
  st.setRunwayIncludeFollowingQuarter(true);
  st.setViewMode('combined');
  st.setCountry(LANDING_HERO_MARKET, {});
  st.clearRunwayLedgerExclusions();
  st.setRunwayLedgerImplicitBaselineFootprint(true);
}

function demoUrlQuery(): string {
  const p = new URLSearchParams();
  p.set(WORKBENCH_URL_KEYS.country, LANDING_HERO_MARKET);
  p.set(WORKBENCH_URL_KEYS.viewMode, 'combined');
  p.set(WORKBENCH_URL_KEYS.runwayFollowQuarter, '1');
  p.set(WORKBENCH_URL_KEYS.runwayFrom, LANDING_HERO_FROM);
  p.set(WORKBENCH_URL_KEYS.runwayTo, LANDING_HERO_TO);
  return p.toString();
}

type Props = { reducedMotion: boolean };

export function LandingSingleMarketWorkbenchMock({ reducedMotion }: Props) {
  const savedRef = useRef<LandingWorkbenchSnap | null>(null);
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const parseError = useAtcStore((s) => s.parseError);
  const configs = useAtcStore((s) => s.configs);

  const noopSlot = useCallback((_s: SlotSelection | null) => {}, []);

  const ready = useMemo(() => {
    if (parseError) return false;
    if (country !== LANDING_HERO_MARKET) return false;
    if (viewMode !== 'combined') return false;
    if (!configs.some((c) => c.market === LANDING_HERO_MARKET)) return false;
    return riskSurface.some((r) => r.market === LANDING_HERO_MARKET);
  }, [parseError, country, viewMode, configs, riskSurface]);

  useLayoutEffect(() => {
    savedRef.current = cloneLandingWorkbenchSnap();
    seedAuSingleMarketWorkbenchDemo();
    return () => {
      if (savedRef.current) restoreLandingWorkbenchSnap(savedRef.current);
    };
  }, []);

  const q = demoUrlQuery();

  return (
    <motion.div
      className={cn(
        'relative w-full min-w-0',
        'mx-auto max-w-[min(100%,1100px)]',
        'lg:mx-0 lg:max-w-none',
        // Laptop/desktop: at least fill the wider grid column, then grow toward the viewport right edge (no 1100px cap).
        'lg:w-[min(min(100vw-1rem,96rem),max(100%,calc(100%+max(0px,(100vw-72rem)/2)+1.5rem)))]'
      )}
      initial={reducedMotion ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="landing-nebula-motion pointer-events-none absolute -inset-3 rounded-[1.35rem] blur-2xl sm:-inset-5 sm:rounded-[1.5rem] sm:blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse 72% 58% at 45% 18%, rgba(34, 211, 238, 0.07), transparent 58%), radial-gradient(ellipse 55% 48% at 88% 72%, rgba(244, 63, 94, 0.04), transparent 52%), radial-gradient(ellipse 48% 42% at 12% 65%, rgba(129, 140, 248, 0.05), transparent 50%)',
        }}
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_22px_70px_-18px_rgba(15,23,42,0.12)] ring-1 ring-zinc-950/[0.04]">
          <div className="border-b border-zinc-200/90 bg-zinc-100/90">
            <div className="mx-auto flex w-full max-w-[min(100%,28rem)] items-center gap-3 px-4 py-3 sm:max-w-xl sm:px-5">
              <div className="flex shrink-0 gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-zinc-200/90 bg-white px-3 py-2 font-mono text-[10px] leading-snug text-zinc-600 shadow-inner shadow-zinc-950/[0.03] sm:text-[11px]">
                <span className="text-zinc-500">https://</span>
                <span className="text-zinc-800">capacity</span>
                <span className="text-zinc-500">.app</span>
                <span className="text-cyan-700"> /app</span>
                <span className="text-zinc-600">?{q}</span>
              </div>
            </div>
          </div>

          <div className="landing-workbench-light-scope bg-background text-foreground">
            <div className="border-b border-border bg-muted/40 px-3 py-2 sm:px-4">
              <p className="font-landing text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Live workbench preview
              </p>
            </div>

            <div className="max-h-[min(78vh,920px)] min-h-[min(52vh,520px)] w-full min-w-0 overflow-y-auto overflow-x-auto">
              {parseError ? (
                <p className="px-4 py-10 text-center text-sm text-destructive">{parseError}</p>
              ) : ready ? (
                <div className="min-w-0 px-1 pb-2 pt-1 sm:px-2 sm:pb-3 sm:pt-2">
                  <RunwayGrid
                    riskSurface={riskSurface}
                    viewMode="combined"
                    onSlotSelection={noopSlot}
                    landingMinimalChrome
                    landingCompareDisableCellDetails
                    landingTechSparklineSweep={!reducedMotion}
                    landingTechSparklineTightFill
                  />
                </div>
              ) : (
                <div
                  className="flex min-h-[min(48vh,420px)] items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground"
                  role="status"
                >
                  Loading runway (same engine as the workbench)…
                </div>
              )}
            </div>

            <div className="border-t border-border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="mx-auto max-w-3xl text-center font-landing text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                Triple-lens stack, contribution strip, and activity ledger — identical components to{' '}
                <span className="font-medium text-foreground/80">/app</span> with bundled Australia YAML and a fixed planning
                window.
              </p>
            </div>
          </div>
        </div>
    </motion.div>
  );
}
