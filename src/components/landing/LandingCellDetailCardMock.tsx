import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { runPipelineFromDsl } from '@/engine/pipeline';
import { parseDate } from '@/engine/calendar';
import { DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import type { ViewModeId } from '@/lib/constants';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { buildRunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim } from '@/lib/runwayViewMetrics';
import { RunwayDayDetailsPayloadBody } from '@/components/RunwayDayDetailsBody';

/** Same defaults as the workbench heatmap for a fresh session (discrete spectrum + power curve). */
const LANDING_DETAIL_HEATMAP_OPTS: HeatmapColorOpts = {
  riskHeatmapCurve: 'power',
  riskHeatmapGamma: 1,
  riskHeatmapTailPower: 1,
  businessHeatmapPressureOffset: 0,
  renderStyle: 'spectrum',
  heatmapSpectrumMode: 'discrete',
};

const DEMO_DATE = '2026-12-17';
const DEMO_MARKET = 'DE';
const VIEW_MODE: ViewModeId = 'market_risk';
const TECH_SCOPE = 'all' as const;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function weekdayShortFromYmd(ymd: string): string {
  return WD[parseDate(ymd).getDay()] ?? '—';
}

/** Mirrors {@link RunwayGrid} `fillMetric*` helpers for `market_risk`. */
const FILL_HEADLINE = 'Market risk';
const FILL_LABEL =
  'Market risk score (0–1): deployment and calendar fragility from holidays, Q4 month ramp, store intensity, campaigns, and optional deployment events in YAML.';
const FILL_LEAD_COMPACT =
  'Market risk: deployment/calendar fragility in the model (0–1); hotter = more fragile, not a ban.';

export const LandingCellDetailCardMock = memo(function LandingCellDetailCardMock() {
  const reducedMotion = useReducedMotion();

  const payload = useMemo(() => {
    const { riskSurface, configs, parseError } = runPipelineFromDsl(
      defaultDslForMarket(DEMO_MARKET),
      DEFAULT_RISK_TUNING
    );
    if (parseError) return null;

    const row = riskSurface.find((r) => r.market === DEMO_MARKET && r.date === DEMO_DATE);
    if (!row) return null;

    const config = configs.find((c) => c.market === DEMO_MARKET);
    const metric = heatmapCellMetric(row, VIEW_MODE, DEFAULT_RISK_TUNING, TECH_SCOPE);
    const { fill: cellFillHex } = runwayHeatmapCellFillAndDim(
      VIEW_MODE,
      TECH_SCOPE,
      metric,
      LANDING_DETAIL_HEATMAP_OPTS,
      row
    );

    return buildRunwayTooltipPayload({
      dateStr: DEMO_DATE,
      weekdayShort: weekdayShortFromYmd(DEMO_DATE),
      market: DEMO_MARKET,
      viewMode: VIEW_MODE,
      row,
      config,
      tuning: DEFAULT_RISK_TUNING,
      fillMetricHeadline: FILL_HEADLINE,
      fillMetricLabel: FILL_LABEL,
      fillMetricLeadCompact: FILL_LEAD_COMPACT,
      fillMetricValue: metric ?? 0,
      cellFillHex,
      techWorkloadScope: TECH_SCOPE,
    });
  }, []);

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="cell-detail-mock-heading"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-10 xl:gap-12">
        <div className="max-w-2xl shrink-0 lg:max-w-[min(100%,22rem)] lg:pt-1 xl:max-w-md">
          <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/85">
            Day detail
          </p>
          <h2 id="cell-detail-mock-heading" className="font-landing text-2xl font-semibold text-white">
            Heatmap detail cards
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Click a cell in the workbench and you get this structured summary — planning blend, fill score, campaigns,
            and expandable breakdowns. This preview uses a live payload from bundled Germany YAML ({DEMO_DATE}).
          </p>
        </div>

        <div className="flex min-w-0 flex-1 justify-center lg:justify-end">
          <div className="relative w-full max-w-md">
            <div
              className="pointer-events-none absolute inset-0 z-0 scale-110 opacity-50 blur-3xl sm:scale-125"
              style={{
                background:
                  'radial-gradient(ellipse 65% 55% at 55% 25%, rgba(251, 113, 133, 0.22), transparent 58%), radial-gradient(ellipse 50% 50% at 15% 85%, rgba(99, 102, 241, 0.16), transparent 55%)',
              }}
              aria-hidden
            />
            {payload ? (
              <div className="relative z-10 overflow-hidden rounded-xl border border-white/[0.1] bg-background shadow-xl ring-1 ring-white/[0.06]">
                <div
                  className="pointer-events-none absolute left-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-90"
                  aria-hidden
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </div>
                <RunwayDayDetailsPayloadBody p={payload} presentation="popover" />
              </div>
            ) : (
              <p className="relative z-10 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-8 text-center font-landing text-sm text-zinc-500">
                Day detail preview unavailable (pipeline did not return {DEMO_MARKET} · {DEMO_DATE}).
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
});
