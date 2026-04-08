import { memo, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { heatmapColorDiscrete } from '@/lib/riskHeatmapColors';
import { cn } from '@/lib/utils';

type GanttPhase = 'prep' | 'deploy' | 'hypercare';

/** One horizontal strip: coloured phase chunks flush inside a single bar; optional gaps (no colour). */
type BarBlock = {
  /** Share of the **programme bar** (sum of non-gap blocks + gaps = 100). */
  readonly fr: number;
  readonly phase?: GanttPhase;
  /** 0–1 runway heat when not a gap */
  readonly heat?: number;
  readonly label: string;
  readonly gap?: boolean;
  /** Calendar-style strip (grey), not runway heat colours */
  readonly neutralGrey?: boolean;
};

type GanttRow = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** Bar position on 0–100 timeline */
  readonly barLeftPct: number;
  readonly barWidthPct: number;
  readonly blocks: readonly BarBlock[];
  /** Muted row chrome (e.g. public holiday lane) */
  readonly greyRow?: boolean;
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] as const;

/**
 * Single square-ended bar per row; phases are adjacent coloured segments (runway palette). Marketing uses `gap` blocks
 * between campaign waves.
 */
/** Jan 1–Jun 30 (181 days). Illustrative ~2wk window positioned like a spring public-holiday fortnight (e.g. 2026 Easter span). */
const HOLIDAY_ILLUSTRATIVE_LEFT_PCT = (88 / 181) * 100;
const HOLIDAY_ILLUSTRATIVE_WIDTH_PCT = (14 / 181) * 100;

const GANTT_ROWS: readonly GanttRow[] = [
  {
    id: 'holiday-periods',
    title: 'Holiday Periods',
    subtitle: 'Public holidays tighten the lane · ~2 weeks shown (illustrative)',
    barLeftPct: Math.round(HOLIDAY_ILLUSTRATIVE_LEFT_PCT * 10) / 10,
    barWidthPct: Math.round(HOLIDAY_ILLUSTRATIVE_WIDTH_PCT * 10) / 10,
    greyRow: true,
    blocks: [{ fr: 100, neutralGrey: true, label: 'Holiday period · ~2 weeks (illustrative)' }],
  },
  {
    id: 'pos',
    title: 'POS deployment',
    subtitle: 'Stores · payments path',
    barLeftPct: 0.5,
    barWidthPct: 68,
    blocks: [
      { fr: 28, phase: 'prep', heat: 0.3, label: 'POS · Prep & test' },
      { fr: 36, phase: 'deploy', heat: 0.6, label: 'POS · Roll-out' },
      { fr: 36, phase: 'hypercare', heat: 0.85, label: 'POS · Hypercare' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    subtitle: 'Three campaigns · short gaps · one programme bar',
    barLeftPct: 3,
    barWidthPct: 96,
    blocks: [
      { fr: 14, phase: 'prep', heat: 0.33, label: 'Winter · Prep' },
      { fr: 16, phase: 'deploy', heat: 0.55, label: 'Winter · Live' },
      { fr: 7, phase: 'hypercare', heat: 0.7, label: 'Winter · Sustain' },
      { fr: 8, gap: true, label: 'Gap between campaigns' },
      { fr: 11, phase: 'prep', heat: 0.36, label: 'Spring · Prep' },
      { fr: 14, phase: 'deploy', heat: 0.58, label: 'Spring · Live' },
      { fr: 6, phase: 'hypercare', heat: 0.74, label: 'Spring · Sustain' },
      { fr: 7, gap: true, label: 'Gap between campaigns' },
      { fr: 10, phase: 'prep', heat: 0.37, label: 'Summer · Prep' },
      { fr: 12, phase: 'deploy', heat: 0.6, label: 'Summer · Live' },
      { fr: 5, phase: 'hypercare', heat: 0.78, label: 'Summer · Sustain' },
    ],
  },
  {
    id: 'hardware',
    title: 'Hardware upgrade',
    subtitle: 'Estate refresh',
    barLeftPct: 5,
    barWidthPct: 88,
    blocks: [
      { fr: 32, phase: 'prep', heat: 0.35, label: 'Hardware · Prep & staging' },
      { fr: 34, phase: 'deploy', heat: 0.64, label: 'Hardware · Deployment waves' },
      { fr: 34, phase: 'hypercare', heat: 0.87, label: 'Hardware · Hypercare' },
    ],
  },
] as const;

const PHASE_LEGEND: { phase: GanttPhase; label: string; heat: number }[] = [
  { phase: 'prep', label: 'Prep & test', heat: 0.34 },
  { phase: 'deploy', label: 'Live / deployment', heat: 0.62 },
  { phase: 'hypercare', label: 'Sustain / hypercare', heat: 0.84 },
];

function SegmentedProgrammeBar({
  row,
  reducedMotion,
  rowIndex,
}: {
  row: GanttRow;
  reducedMotion: boolean;
  rowIndex: number;
}) {
  const frSum = row.blocks.reduce((s, b) => s + b.fr, 0);

  return (
    <div className="relative min-h-[36px] w-full sm:min-h-[38px]">
      <div
        className="pointer-events-none absolute inset-0 grid grid-cols-6 bg-[#050506]"
        aria-hidden
      >
        {MONTHS_SHORT.map((m) => (
          <div
            key={m}
            className="border-r border-white/[0.05] last:border-r-0 sm:border-white/[0.06]"
          />
        ))}
      </div>
      <div
        className="absolute top-1/2 z-[1] -translate-y-1/2"
        style={{
          left: `${row.barLeftPct}%`,
          width: `${row.barWidthPct}%`,
        }}
      >
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, scaleX: 0.2 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true, margin: '-30px' }}
          transition={{
            delay: reducedMotion ? 0 : rowIndex * 0.1,
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
          className={cn(
            'flex h-[11px] w-full overflow-hidden rounded-none sm:h-[13px]',
            row.greyRow
              ? 'ring-1 ring-zinc-500/45 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
              : 'ring-1 ring-black/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
          )}
          style={{ transformOrigin: 'left center' }}
          role="presentation"
        >
          {row.blocks.map((b, i) => {
            const wPct = frSum > 0 ? (b.fr / frSum) * 100 : 0;
            if (wPct <= 0) return null;
            return (
              <div
                key={`${row.id}-b-${i}`}
                title={b.label}
                className={cn(
                  'min-w-0 shrink-0',
                  b.gap && 'bg-zinc-800/55',
                  i > 0 && !b.gap && !b.neutralGrey && 'border-l border-black/25',
                  i > 0 && b.gap && 'border-l border-white/[0.06]'
                )}
                style={{
                  width: `${wPct}%`,
                  backgroundColor: b.gap
                    ? undefined
                    : b.neutralGrey
                      ? '#6b7280'
                      : heatmapColorDiscrete(b.heat ?? 0.5),
                }}
              />
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

export const LandingGanttBridgeMock = memo(function LandingGanttBridgeMock() {
  const reducedMotion = !!useReducedMotion();
  const headingId = useId().replace(/:/g, '');

  const ariaDiagram =
    'Illustrative Gantt from January through June: top row is a grey holiday period of about two weeks; below, each row is one programme bar split into coloured prep, live, and sustain segments using the runway heatmap palette. Marketing shows three campaigns with short gaps on the same bar.';

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby={`${headingId}-h`}
    >
      <div className="mb-6 max-w-2xl">
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#FFC72C]">
          Your Gantt is not your runway
        </p>
        <h2 id={`${headingId}-h`} className="font-landing text-2xl font-semibold text-white">
          The draw on capacity Gantt never quite shows
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Roadmaps own <span className="text-zinc-300">dates and accountability</span>. They almost never own{' '}
          <span className="text-zinc-300">capacity</span>—the cumulative pull on{' '}
          <span className="text-zinc-300">people, time, equipment, and shared services</span> when work overlaps. That is
          the blind spot: <span className="text-zinc-300">stacking</span>, <span className="text-zinc-300">holiday and
          busy-season windows</span>, and load that stays <span className="text-zinc-300">implicit</span> for the
          department left holding the bag. The strip below is the same <span className="text-zinc-300">phased-bar
          vocabulary</span> you already export from PPM, tinted with this page’s{' '}
          <span className="text-zinc-300">runway heat palette</span> so the thread is obvious. Familiar layout—so what it
          usually <span className="text-zinc-300">omits</span> is harder to ignore.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#111114] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">illustration · </span>
            <span className="text-zinc-400">traditional shape, unstated load</span>
            <span className="text-zinc-600"> · two quarters</span>
          </div>
        </div>

        <div className="border-b border-white/[0.05] bg-[#0a0a0c] px-3 py-2.5 sm:px-4">
          <p className="font-landing text-[11px] font-medium text-zinc-500">
            Jan–Jun · <span className="text-zinc-400">Q1–Q2</span>{' '}
            <span className="text-zinc-600">(not live schedule data)</span>
          </p>
        </div>

        <div className="p-2.5 sm:p-3" role="img" aria-label={ariaDiagram}>
          <div className="mb-1 grid grid-cols-2 gap-0 font-landing text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:text-[11px]">
            <div className="border-b border-white/[0.06] pb-1.5 pl-1 text-center sm:pl-2">Q1</div>
            <div className="border-b border-white/[0.06] pb-1.5 pr-1 text-center sm:pr-2">Q2</div>
          </div>

          <div className="mb-1.5 grid grid-cols-6 gap-0 border-b border-white/[0.06] pb-1.5 sm:mb-2 sm:pb-2">
            {MONTHS_SHORT.map((m) => (
              <div
                key={m}
                className="text-center font-landing text-[9px] font-semibold tabular-nums text-zinc-500 sm:text-[10px]"
              >
                {m}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-0.5 sm:gap-1">
            {GANTT_ROWS.map((row, ri) => (
              <div
                key={row.id}
                className={cn(
                  'flex flex-col gap-1 rounded-md border px-1.5 py-1 sm:flex-row sm:items-center sm:gap-2 sm:px-2 sm:py-1.5',
                  row.greyRow
                    ? 'border-zinc-600/25 bg-zinc-800/35'
                    : 'border-white/[0.05] bg-[#070708]'
                )}
              >
                <div className="flex shrink-0 flex-col justify-center sm:w-[min(10.5rem,30%)] sm:max-w-[12rem]">
                  <p
                    className={cn(
                      'font-landing text-[11px] font-semibold leading-tight sm:text-xs',
                      row.greyRow ? 'text-zinc-400' : 'text-zinc-200'
                    )}
                  >
                    {row.title}
                  </p>
                  <p
                    className={cn(
                      'font-landing text-[9px] leading-snug sm:text-[10px]',
                      row.greyRow ? 'text-zinc-500' : 'text-zinc-600'
                    )}
                  >
                    {row.subtitle}
                  </p>
                </div>

                <div className="relative min-h-[36px] min-w-0 flex-1 sm:min-h-[38px]">
                  <SegmentedProgrammeBar row={row} reducedMotion={reducedMotion} rowIndex={ri} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-white/[0.05] pt-3 sm:mt-3 sm:pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
              {PHASE_LEGEND.map(({ phase, label, heat }) => (
                <div key={phase} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm ring-1 ring-black/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] sm:h-2.5 sm:w-2.5"
                    style={{ backgroundColor: heatmapColorDiscrete(heat) }}
                    aria-hidden
                  />
                  <span className="font-landing text-[10px] font-medium text-zinc-400 sm:text-[11px]">{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 border-l border-white/[0.08] pl-3 sm:pl-4">
                <span
                  className="h-2 w-2 shrink-0 rounded-none ring-1 ring-zinc-500/50"
                  style={{ backgroundColor: '#6b7280' }}
                  aria-hidden
                />
                <span className="font-landing text-[10px] font-medium text-zinc-500 sm:text-[11px]">
                  Holiday period
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-white/[0.08] pl-3 sm:pl-4">
                <span
                  className="h-2 w-4 shrink-0 rounded-sm bg-zinc-800/55 ring-1 ring-white/[0.06]"
                  aria-hidden
                />
                <span className="font-landing text-[10px] font-medium text-zinc-500 sm:text-[11px]">
                  Breathing room
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
});
