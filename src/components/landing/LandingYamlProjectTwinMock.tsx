import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { runPipelineFromDsl } from '@/engine/pipeline';
import { DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import type { RiskRow } from '@/engine/riskModel';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import type { RunwayCalendarCellValue } from '@/lib/calendarQuarterLayout';
import {
  EMPTY_LEFT,
  EMPTY_RIGHT,
  EMPTY_TOP,
  IsoColumnAtOrigin,
  ISO_GROUND_LABEL_TEXT_PROPS,
  calHeightFromMetric,
} from '@/components/RunwayIsoHeatCell';
import {
  computeSkylineBounds,
  isoCellTopLeft,
  isoGridSteps,
  isoWiForLayoutLi,
  SKYLINE_MONTH_ISO_GAP_STEPS,
} from '@/lib/runwayIsoSkylineLayout';
import {
  isoGroundLabelAnchorAtChronWeek,
  isoGroundMoMatrix,
  isoLabelBleedComp,
  isoLabelLaneDi,
} from '@/lib/runwayIsoGroundLabels';
import {
  buildConsecutiveMondayWeekRows,
  computeMonthStartChronWeeks,
  deckAndColumnY,
  LANDING_ISO_SKYLINE_CELL_PX,
  LANDING_ISO_SKYLINE_GAP_PX,
  LANDING_ISO_SKYLINE_ROW_TOWER_PX,
  monthAxisLabelsForChronWeeks,
  snapViewBoxDim,
  syntheticStressToIsoColumnStyle,
} from '@/components/landing/landingIsoSkylineShared';
import { cn } from '@/lib/utils';
import { Box, Landmark, Layers, Trees } from 'lucide-react';

const LAYER_PRESS_TRANSITION = { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.85 };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

type YamlToken = { t: string; c?: string };

function YamlLine({ num, tokens }: { num: number; tokens: readonly YamlToken[] }) {
  return (
    <div className="flex min-h-[1.35em] font-mono text-[9px] leading-[1.35] sm:text-[10px]">
      <span className="w-5 shrink-0 select-none pr-2 text-right text-zinc-600 tabular-nums sm:w-6">{num}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        {tokens.map((tok, i) => (
          <span key={i} className={tok.c}>
            {tok.t}
          </span>
        ))}
      </span>
    </div>
  );
}

type YamlDocLine = readonly YamlToken[];

/** Shared top of the landing preview: comments, resources, then `bau` (DE-style order). */
const LANDING_YAML_DOC_CORE: readonly YamlDocLine[] = [
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Baseline Technology load is driven by ', c: 'text-zinc-600' },
    { t: 'bau', c: 'text-cyan-300/85' },
    { t: ' — routine rhythm, not campaign waves.', c: 'text-zinc-600' },
  ],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Strip heat here is ', c: 'text-zinc-600' },
    { t: 'weekly_cycle', c: 'text-cyan-300/85' },
    { t: ' + ', c: 'text-zinc-600' },
    { t: 'market_it_weekly_load.weekday_intensity', c: 'text-cyan-300/85' },
    { t: '.', c: 'text-zinc-600' },
  ],
  [{ t: '', c: undefined }],
  [{ t: 'resources', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'labs', c: 'text-violet-300/95' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '6', c: 'text-amber-200/90' },
    { t: ' }', c: 'text-zinc-500' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'staff', c: 'text-violet-300/95' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '4', c: 'text-amber-200/90' },
    { t: ' }', c: 'text-zinc-500' },
  ],
  [{ t: '', c: undefined }],
  [{ t: 'bau', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'days_in_use', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '[mo, tu, we, th, fr, sa, su]', c: 'text-amber-200/90' },
  ],
  [{ t: '  ', c: undefined }, { t: 'weekly_cycle', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'labs_required', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-200/90' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'staff_required', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-200/90' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'support_days', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0', c: 'text-amber-200/90' },
  ],
  [{ t: '  ', c: undefined }, { t: 'market_it_weekly_load', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'weekday_intensity', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '      ', c: undefined },
    { t: 'Mon', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.87', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Tue', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.75', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Wed', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.34', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Thu', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.27', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Fri', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.45', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Sat', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.23', c: 'text-amber-200/90' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Sun', c: 'text-cyan-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.24', c: 'text-amber-200/90' },
  ],
];

const LANDING_YAML_CAMPAIGN_OFF: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'No campaign wave in YAML — ', c: 'text-zinc-600' },
    { t: 'campaigns', c: 'text-cyan-300/85' },
    { t: ' is empty; strip shows BAU + calendar layers only.', c: 'text-zinc-600' },
  ],
  [{ t: 'campaigns', c: 'text-violet-300/95' }, { t: ': ', c: 'text-zinc-500' }, { t: '[]', c: 'text-zinc-500' }],
];

const LANDING_YAML_CAMPAIGN_ON: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Ongoing programmes (POS, refresh, network) use the same blocks—different weights & durations', c: 'text-zinc-600' },
  ],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Campaign prep pulls Technology load forward', c: 'text-zinc-600' }],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Prep ends the day before go-live (testing_prep_duration).', c: 'text-zinc-600' }],
  [{ t: 'campaigns', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- name: ', c: 'text-zinc-500' }, { t: '"Summer launch"', c: 'text-cyan-300/90' }],
  [{ t: '    ', c: undefined }, { t: 'start_date', c: 'text-emerald-300/90' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-05-20', c: 'text-amber-200/90' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'duration', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '35', c: 'text-amber-200/90' }],
  [{ t: '    ', c: undefined }, { t: 'testing_prep_duration', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '21', c: 'text-amber-200/90' }],
  [{ t: '    ', c: undefined }, { t: 'impact', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: 'high', c: 'text-cyan-300/90' }],
  [{ t: '    ', c: undefined }, { t: '# Prep segment → heavier labs + tech_staff', c: 'text-zinc-600' }],
  [{ t: '    ', c: undefined }, { t: 'campaign_support', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '2', c: 'text-amber-200/90' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '1.5', c: 'text-amber-200/90' }],
  [{ t: '      ', c: undefined }, { t: 'ops', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.25', c: 'text-amber-200/90' }],
  [{ t: '    ', c: undefined }, { t: '# Live segment → steadier, lower support', c: 'text-zinc-600' }],
  [{ t: '    ', c: undefined }, { t: 'live_campaign_support', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '1', c: 'text-amber-200/90' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.5', c: 'text-amber-200/90' }],
];

/** Shown when neither holiday chip is on — points at the toolbar. */
const LANDING_YAML_CALENDAR_PLACEHOLDER: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    {
      t: 'public_holidays / school_holidays lists live here in a full market file — turn on National / School below to show sample YAML.',
      c: 'text-zinc-600',
    },
  ],
];

/** DE-style excerpt when National holidays preview is on. */
const LANDING_YAML_PUBLIC_HOLIDAYS: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Public holidays — explicit dates; ', c: 'text-zinc-600' },
    { t: 'staffing_multiplier', c: 'text-cyan-300/85' },
    { t: ' scales support load on those days.', c: 'text-zinc-600' },
  ],
  [{ t: 'public_holidays', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: 'auto', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: 'false', c: 'text-amber-200/90' }],
  [{ t: '  ', c: undefined }, { t: 'dates', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-01-01', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-05-01', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-12-25', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-12-26', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [{ t: '    ', c: undefined }, { t: '# …', c: 'text-zinc-600' }],
  [
    { t: '  ', c: undefined },
    { t: 'staffing_multiplier', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.25', c: 'text-amber-200/90' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'trading_multiplier', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.0', c: 'text-amber-200/90' },
  ],
];

/** DE-style excerpt when School holidays preview is on. */
const LANDING_YAML_SCHOOL_HOLIDAYS: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'School breaks — date ranges (sample spring window); ', c: 'text-zinc-600' },
    { t: 'load_effects', c: 'text-cyan-300/85' },
    { t: ' can tune lab/team lift.', c: 'text-zinc-600' },
  ],
  [{ t: 'school_holidays', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: 'auto', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: 'false', c: 'text-amber-200/90' }],
  [{ t: '  ', c: undefined }, { t: 'dates', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-04-06', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-04-07', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-04-08', c: 'text-amber-200/90' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [{ t: '    ', c: undefined }, { t: '# …', c: 'text-zinc-600' }],
  [
    { t: '  ', c: undefined },
    { t: 'staffing_multiplier', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.75', c: 'text-amber-200/90' },
  ],
  [{ t: '  ', c: undefined }, { t: 'load_effects', c: 'text-emerald-300/90' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'lab_load_mult', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.0', c: 'text-amber-200/90' },
  ],
];

const LANDING_YAML_DOC_FOOTER: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    {
      t: 'Optional holidays: block tapers lab ceiling vs the calendars above (see a full market.yaml).',
      c: 'text-zinc-600',
    },
  ],
  [{ t: 'holidays', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'capacity_taper_days', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-200/90' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'lab_capacity_scale', c: 'text-emerald-300/90' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.0', c: 'text-amber-200/90' },
  ],
];

/** Fixed viewport for YAML editor + Technology strip so toggles do not resize the row. */
const LANDING_TWIN_VIEWPORT_H =
  'h-[min(36vh,260px)] sm:h-[min(40vh,300px)] lg:h-[min(42vh,320px)]';

/** Two illustrative calendar quarters: twenty-six weeks × seven days (same iso lattice as the workbench). */
const STORY_WEEKS = 26;
const WEEK_DAYS = 7;

/** Monday start for the twin strip; DE pipeline rows resolve holiday flags on these dates. */
const TWIN_STORY_START_MONDAY = '2026-04-06';

/** First week index (0-based) of the live segment — go-live after prep. */
const GO_LIVE_WI = 9;
/** Prep weeks immediately before go-live (maps to testing_prep_duration in the YAML story). */
const PREP_WEEKS = 3;
/** Live weeks after go-live (operational support band). */
const LIVE_WEEKS = 5;

function cellHash01(wi: number, di: number): number {
  const x = Math.sin(wi * 12.9898 + di * 78.233 + 19.719) * 43758.5453;
  return x - Math.floor(x);
}

type CampaignPhase = 'base' | 'prep' | 'live';

function weekCampaignPhase(wi: number): CampaignPhase {
  if (wi >= GO_LIVE_WI && wi < GO_LIVE_WI + LIVE_WEEKS) return 'live';
  if (wi >= GO_LIVE_WI - PREP_WEEKS && wi < GO_LIVE_WI) return 'prep';
  return 'base';
}

/**
 * Weekly BAU shape on top of slow drift: `di` is Mon=0 … Sun=6 (consecutive Monday week rows).
 * Quiet weekend, peak Monday, easing through Wednesday, then Thu–Fri pick up again.
 */
const BAU_DOW_BUMP: readonly number[] = [
  0.2, // Mon — busiest
  0.15, // Tue — down a notch from Mon
  0.045, // Wed — mid-week lull
  0.08, // Thu — back up
  0.17, // Fri — strong finish
  -0.055, // Sat — quiet
  -0.08, // Sun — quieter
];

function bauActivityStress(wi: number, di: number): number {
  const seasonal = 0.065 * Math.sin((wi / STORY_WEEKS) * Math.PI * 2);
  const fortnight = 0.045 * Math.sin((wi / STORY_WEEKS) * Math.PI * 4 + 0.7);
  const dowBump = BAU_DOW_BUMP[di] ?? 0;
  const grain = (cellHash01(wi, di) - 0.5) * 0.08;
  const teamPulse = 0.048 * Math.sin(wi * 0.85 + di * 1.15);
  return clamp01(0.19 + seasonal + fortnight + dowBump + grain + teamPulse);
}

function campaignStressAddition(wi: number, di: number, campaignMix: number): number {
  if (campaignMix <= 0) return 0;
  const dow = di < 5 ? 1 : 0.58;
  const ph = weekCampaignPhase(wi);
  if (ph === 'prep') {
    const ramp = 0.88 + 0.12 * ((wi - (GO_LIVE_WI - PREP_WEEKS)) / Math.max(1, PREP_WEEKS - 1));
    return 0.62 * campaignMix * dow * ramp;
  }
  if (ph === 'live') {
    const fade = 1 - 0.22 * ((wi - GO_LIVE_WI) / Math.max(1, LIVE_WEEKS - 1));
    return 0.42 * campaignMix * dow * fade;
  }
  return 0.055 * campaignMix;
}

/** National holidays spike displayed capacity into the red; school breaks add trading-shaped load (same DE flags). */
function calendarStressAdjustment(
  row: RiskRow | undefined,
  publicMix: number,
  schoolMix: number
): number {
  if (!row) return 0;
  let delta = 0;
  if (publicMix > 0 && row.public_holiday_flag) delta += 0.52 * publicMix;
  if (schoolMix > 0 && row.school_holiday_flag) delta += 0.19 * schoolMix;
  return delta;
}

function technologyStressForCell(
  chronWi: number,
  di: number,
  row: RiskRow | undefined,
  bauMix: number,
  campaignMix: number,
  publicMix: number,
  schoolMix: number
): number {
  const bau = bauActivityStress(chronWi, di);
  const camp = campaignStressAddition(chronWi, di, campaignMix);
  const cal = calendarStressAdjustment(row, publicMix, schoolMix);
  return clamp01(bau * bauMix + camp + cal);
}

const TIMELINE_SEGMENTS: { phase: CampaignPhase; weeks: number; label: string; sub: string }[] = [
  { phase: 'base', weeks: GO_LIVE_WI - PREP_WEEKS, label: 'Baseline', sub: 'No campaign load' },
  { phase: 'prep', weeks: PREP_WEEKS, label: 'Prep', sub: 'Readiness · test' },
  { phase: 'live', weeks: LIVE_WEEKS, label: 'Live', sub: 'Operational support' },
  {
    phase: 'base',
    weeks: STORY_WEEKS - (GO_LIVE_WI - PREP_WEEKS) - PREP_WEEKS - LIVE_WEEKS,
    label: 'Tail',
    sub: 'Second quarter + carry',
  },
];

function PrepLiveTimelineBar({ mix, reducedMotion }: { mix: number; reducedMotion: boolean }) {
  const total = TIMELINE_SEGMENTS.reduce((s, x) => s + x.weeks, 0);
  return (
    <motion.div
      className="mt-3 w-full px-1 sm:px-0"
      initial={false}
      animate={{ opacity: 0.28 + mix * 0.72 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden={mix < 0.06}
    >
      <div className="flex h-9 w-full overflow-hidden rounded-lg border border-white/[0.08] bg-black/35 shadow-inner shadow-black/40">
        {TIMELINE_SEGMENTS.map(({ phase, weeks, label, sub }, i) => {
          const wPct = (weeks / total) * 100;
          const isPrep = phase === 'prep';
          const isLive = phase === 'live';
          return (
            <div
              key={`${phase}-${i}-${label}`}
              className={cn(
                'relative flex min-w-0 flex-col justify-center border-r border-white/[0.06] px-1.5 last:border-r-0',
                isPrep &&
                  'bg-gradient-to-b from-violet-500/[0.22] via-violet-600/[0.12] to-transparent shadow-[inset_0_0_24px_rgba(139,92,246,0.12)]',
                isLive &&
                  'border-l-2 border-[#FFC72C]/50 bg-gradient-to-b from-cyan-500/[0.18] via-cyan-600/[0.08] to-transparent shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]',
                phase === 'base' && 'bg-white/[0.02]'
              )}
              style={{ width: `${wPct}%` }}
              title={`${label} · ${sub}`}
            >
              <span
                className={cn(
                  'truncate font-landing text-[9px] font-bold leading-tight tracking-tight sm:text-[10px]',
                  isPrep && 'text-violet-100',
                  isLive && 'text-cyan-100',
                  phase === 'base' && 'text-zinc-500'
                )}
              >
                {label}
              </span>
              <span className="truncate font-mono text-[8px] leading-tight text-zinc-600 sm:text-[9px]">{sub}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function QuarterIsoMiniRunway({
  bauMix,
  campaignMix,
  publicMix,
  schoolMix,
  chronWeeks: chronWeeksProp,
  riskByDate,
}: {
  bauMix: number;
  campaignMix: number;
  publicMix: number;
  schoolMix: number;
  chronWeeks: RunwayCalendarCellValue[][];
  riskByDate: Map<string, RiskRow>;
}) {
  return useMemo(() => {
    const chronWeeks = chronWeeksProp;
    const monthStartChronWeeks = computeMonthStartChronWeeks(chronWeeks);
    const layoutWeeks = [...chronWeeks].reverse();
    const nWeeks = layoutWeeks.length;
    const monthPack = {
      monthGapSteps: SKYLINE_MONTH_ISO_GAP_STEPS,
      monthStartChronWeeks,
    };
    const cellPx = LANDING_ISO_SKYLINE_CELL_PX;
    const rowTowerPx = LANDING_ISO_SKYLINE_ROW_TOWER_PX;
    const gap = LANDING_ISO_SKYLINE_GAP_PX;

    const { minX, minY, vbW, vbH, L, runwayBandH } = computeSkylineBounds(
      layoutWeeks,
      cellPx,
      gap,
      rowTowerPx,
      monthPack
    );
    const { stepX, stepY } = isoGridSteps(cellPx, gap);

    const layoutToIsoWi = (layoutLi: number) =>
      isoWiForLayoutLi(layoutLi, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);

    const stubH = Math.max(2.5, L.dyy * 0.55);
    const maxDi = WEEK_DAYS - 1;
    const halfCell = cellPx / 2;
    const labelBleed = isoLabelBleedComp(stepX, stepY);
    const moFs = Math.max(7.5, stepX * 1.45);
    const diLaneMo = isoLabelLaneDi(maxDi, 0);

    const monthRow = monthAxisLabelsForChronWeeks(chronWeeks).map(({ chron, text }, i) => {
      const { tx, ty } = isoGroundLabelAnchorAtChronWeek(
        chron,
        diLaneMo,
        nWeeks,
        stepX,
        stepY,
        halfCell,
        minX,
        minY,
        L.canvasH,
        layoutToIsoWi
      );
      return { key: `mo-${i}-${text}`, tx, ty, text };
    });

    const labelPadRight = stepX * 3 + 28;
    const labelPadBottom = stepY * 3 + 24;
    const adjW = vbW + labelPadRight;
    const adjH = vbH + labelPadBottom;

    const cells: { li: number; di: number; cell: RunwayCalendarCellValue; depth: number }[] = [];
    for (let li = 0; li < layoutWeeks.length; li++) {
      const week = layoutWeeks[li]!;
      const isoW = layoutToIsoWi(li);
      for (let di = 0; di < week.length; di++) {
        cells.push({ li, di, cell: week[di]!, depth: isoW + di });
      }
    }
    cells.sort((a, b) => a.depth - b.depth);

    return (
      <svg
        viewBox={`0 0 ${snapViewBoxDim(adjW)} ${snapViewBoxDim(adjH)}`}
        width="100%"
        height="100%"
        className="block max-h-[min(48vh,360px)] min-h-[200px] w-full sm:min-h-[230px]"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Half-year Technology strip: BAU rhythm builds in first; optional campaign prep and live; national holidays spike into the red; school breaks add load when enabled"
      >
        {cells.map(({ li, di, cell }) => {
          const { ax, ay } = isoCellTopLeft(layoutToIsoWi(li), di, stepX, stepY);
          const gx = ax - minX;
          const gy = ay - minY;

          if (cell === false) {
            const calH = stubH;
            const columnTy = deckAndColumnY(L, calH, runwayBandH);
            return (
              <g key={`m-${li}-${di}-x`} transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`} aria-hidden>
                <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                  <IsoColumnAtOrigin
                    L={L}
                    calH={calH}
                    topC={EMPTY_TOP}
                    leftC={EMPTY_LEFT}
                    rightC={EMPTY_RIGHT}
                  />
                </g>
              </g>
            );
          }

          const chronWi = nWeeks - 1 - li;
          const dateStr = typeof cell === 'string' ? cell : null;
          const row = dateStr ? riskByDate.get(dateStr) : undefined;
          const stress = technologyStressForCell(
            chronWi,
            di,
            row,
            bauMix,
            campaignMix,
            publicMix,
            schoolMix
          );
          const { topC, leftC, rightC, height01 } = syntheticStressToIsoColumnStyle(stress);
          const calH = calHeightFromMetric(height01, rowTowerPx, false);
          const columnTy = deckAndColumnY(L, calH, runwayBandH);

          return (
            <g key={`m-${li}-${di}`} transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}>
              <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                <IsoColumnAtOrigin L={L} calH={calH} topC={topC} leftC={leftC} rightC={rightC} />
              </g>
            </g>
          );
        })}
        <g className="pointer-events-none" aria-hidden>
          {monthRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={labelBleed * moFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={isoGroundMoMatrix(tx, ty, stepX, stepY)}
              className="fill-zinc-500 font-medium tabular-nums tracking-tight"
              fontSize={moFs}
              {...ISO_GROUND_LABEL_TEXT_PROPS}
            >
              {text}
            </text>
          ))}
        </g>
      </svg>
    );
  }, [bauMix, campaignMix, publicMix, schoolMix, chronWeeksProp, riskByDate]);
}

type LayerMixes = { g: number; c: number; p: number; s: number };

const MIX_INITIAL: LayerMixes = { g: 0, c: 0, p: 0, s: 0 };

export function LandingYamlProjectTwinMock() {
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  /** Four stackable layers (strip + YAML): BAU first, then campaign on top, then calendars. */
  const [baselineOn, setBaselineOn] = useState(false);
  const [campaignOn, setCampaignOn] = useState(false);
  const [publicHolidaysOn, setPublicHolidaysOn] = useState(false);
  const [schoolHolidaysOn, setSchoolHolidaysOn] = useState(false);

  const [layerMixes, setLayerMixes] = useState<LayerMixes>(MIX_INITIAL);
  const mixRef = useRef<LayerMixes>(MIX_INITIAL);
  const [layerDemoDone, setLayerDemoDone] = useState(false);
  const [toolbarSeen, setToolbarSeen] = useState(false);
  const [pressKey, setPressKey] = useState<'baseline' | 'campaign' | 'national' | 'school' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.2) {
            setToolbarSeen(true);
            break;
          }
        }
      },
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: [0, 0.2, 0.35, 0.5, 0.75, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!toolbarSeen) return;
    let cancelled = false;
    const timers: number[] = [];

    const schedule = (ms: number, fn: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    };

    if (reducedMotion) {
      setBaselineOn(true);
      setCampaignOn(true);
      setPublicHolidaysOn(true);
      setSchoolHolidaysOn(true);
      setLayerDemoDone(true);
      return () => {
        cancelled = true;
        for (const t of timers) window.clearTimeout(t);
      };
    }

    const STEP_MS = 1180;
    const PRESS_MS = 260;
    const INITIAL_DELAY_MS = 720;

    const flash = (key: 'baseline' | 'campaign' | 'national' | 'school') => {
      setPressKey(key);
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) setPressKey(null);
        }, PRESS_MS)
      );
    };

    schedule(INITIAL_DELAY_MS, () => {
      flash('baseline');
      setBaselineOn(true);
    });
    schedule(INITIAL_DELAY_MS + STEP_MS, () => {
      flash('campaign');
      setCampaignOn(true);
    });
    schedule(INITIAL_DELAY_MS + STEP_MS * 2, () => {
      flash('national');
      setPublicHolidaysOn(true);
    });
    schedule(INITIAL_DELAY_MS + STEP_MS * 3, () => {
      flash('school');
      setSchoolHolidaysOn(true);
    });
    schedule(INITIAL_DELAY_MS + STEP_MS * 3 + 420, () => {
      if (!cancelled) setLayerDemoDone(true);
    });

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [toolbarSeen, reducedMotion]);

  useEffect(() => {
    const target: LayerMixes = {
      g: baselineOn ? 1 : 0,
      c: campaignOn ? 1 : 0,
      p: publicHolidaysOn ? 1 : 0,
      s: schoolHolidaysOn ? 1 : 0,
    };
    if (reducedMotion) {
      mixRef.current = target;
      setLayerMixes(target);
      return;
    }
    const from = { ...mixRef.current };
    let start: number | null = null;
    let raf = 0;
    const durationMs = 540;
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const e = ease(t);
      const next: LayerMixes = {
        g: from.g + (target.g - from.g) * e,
        c: from.c + (target.c - from.c) * e,
        p: from.p + (target.p - from.p) * e,
        s: from.s + (target.s - from.s) * e,
      };
      mixRef.current = next;
      setLayerMixes(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [baselineOn, campaignOn, publicHolidaysOn, schoolHolidaysOn, reducedMotion]);

  const { g: mixGrid, c: mixCampaign, p: mixPublic, s: mixSchool } = layerMixes;

  /** Chip matches toggle; optional glow tie-in while the mix eases in (same threshold for all four). */
  const STRIP_MIX_LIT = 0.12;
  const baselineChipLit = baselineOn && mixGrid >= STRIP_MIX_LIT;
  const campaignChipLit = campaignOn && mixCampaign >= STRIP_MIX_LIT;
  const publicChipLit = publicHolidaysOn && mixPublic >= STRIP_MIX_LIT;
  const schoolChipLit = schoolHolidaysOn && mixSchool >= STRIP_MIX_LIT;

  const layerHint = !toolbarSeen
    ? 'Stack layers on the strip: BAU baseline, then campaign load, then national and school calendars.'
    : !layerDemoDone && !reducedMotion
      ? 'Watch once: BAU on the runway, then campaign on top, then national holidays, then school breaks — then toggle freely.'
      : 'Layers stack — BAU first, campaign adds on top, holidays blend into the heatmap. Amber follows each toggle once its mix lands on the strip.';

  const layerToolbarVariants = useMemo(() => {
    const instant = !!reducedMotion;
    const chip: Variants = instant
      ? {
          hidden: { opacity: 1, y: 0, scale: 1 },
          visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0 } },
        }
      : {
          hidden: { opacity: 0, y: 10, scale: 0.96 },
          visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
          },
        };
    const chipRow: Variants = instant
      ? { hidden: {}, visible: { transition: { staggerChildren: 0, delayChildren: 0 } } }
      : {
          hidden: {},
          visible: {
            transition: { staggerChildren: 0.13, delayChildren: 0.04 },
          },
        };
    const hint: Variants = instant
      ? {
          hidden: { opacity: 1, y: 0 },
          visible: { opacity: 1, y: 0, transition: { duration: 0 } },
        }
      : {
          hidden: { opacity: 0, y: 8 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { delay: 0.58, duration: 0.38, ease: [0.22, 1, 0.36, 1] },
          },
        };
    const container: Variants = instant
      ? {
          hidden: {},
          visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
        }
      : {
          hidden: {},
          visible: {
            transition: { staggerChildren: 0.12, delayChildren: 0.06 },
          },
        };
    return { container, chipRow, chip, hint };
  }, [reducedMotion]);

  const layerChipBtn = (pressed: boolean) =>
    cn(
      'inline-flex shrink-0 origin-center items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-landing text-[11px] font-semibold transition-colors',
      pressed
        ? 'border-[#FFC72C]/45 bg-[#FFC72C]/12 text-zinc-100 shadow-[0_0_22px_-10px_rgba(255,199,44,0.45)] ring-1 ring-inset ring-[#FFC72C]/20'
        : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300'
    );

  const yamlDocLines = useMemo(() => {
    const calendar: YamlDocLine[] = [];
    if (publicHolidaysOn) calendar.push(...LANDING_YAML_PUBLIC_HOLIDAYS);
    if (schoolHolidaysOn) calendar.push(...LANDING_YAML_SCHOOL_HOLIDAYS);
    if (!publicHolidaysOn && !schoolHolidaysOn) calendar.push(...LANDING_YAML_CALENDAR_PLACEHOLDER);
    return [
      ...LANDING_YAML_DOC_CORE,
      ...(campaignOn ? LANDING_YAML_CAMPAIGN_ON : LANDING_YAML_CAMPAIGN_OFF),
      ...calendar,
      ...LANDING_YAML_DOC_FOOTER,
    ];
  }, [campaignOn, publicHolidaysOn, schoolHolidaysOn]);

  const yamlScrollRef = useRef<HTMLDivElement>(null);
  const yamlLayoutSig = `${baselineOn}|${campaignOn}|${publicHolidaysOn}|${schoolHolidaysOn}`;
  const yamlScrollBootRef = useRef(true);
  const prevYamlLayoutSigRef = useRef(yamlLayoutSig);

  useLayoutEffect(() => {
    const el = yamlScrollRef.current;
    if (!el) return;
    if (yamlScrollBootRef.current) {
      yamlScrollBootRef.current = false;
      prevYamlLayoutSigRef.current = yamlLayoutSig;
      return;
    }
    if (prevYamlLayoutSigRef.current === yamlLayoutSig) return;
    prevYamlLayoutSigRef.current = yamlLayoutSig;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        el.scrollTo({
          top: el.scrollHeight,
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [yamlLayoutSig, reducedMotion]);

  const storyChronWeeks = useMemo(
    () => buildConsecutiveMondayWeekRows(TWIN_STORY_START_MONDAY, STORY_WEEKS),
    []
  );

  const riskByDateDe = useMemo(() => {
    const { riskSurface, parseError } = runPipelineFromDsl(defaultDslForMarket('DE'), DEFAULT_RISK_TUNING);
    const m = new Map<string, RiskRow>();
    if (parseError) return m;
    for (const r of riskSurface) {
      if (r.market === 'DE') m.set(r.date, r);
    }
    return m;
  }, []);

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby={`${panelId}-heading`}
    >
      <div className="mb-6 max-w-2xl">
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#FFC72C]">
          Declarative market model
        </p>
        <h2
          id={`${panelId}-heading`}
          className="font-landing text-balance text-2xl font-semibold leading-snug text-white sm:text-[1.65rem]"
        >
          Campaigns, BAU, and programmes draw on the same resources
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          The YAML encodes what you believe is true in each market: <span className="text-zinc-300">resources</span>,{' '}
          <span className="text-zinc-300">BAU rhythm</span>, <span className="text-zinc-300">campaign waves</span>,{' '}
          <span className="text-zinc-300">holidays</span>, <span className="text-zinc-300">trading shape</span>, and tech
          cadence. Toggle layers here to see how prep and live phases, national and school breaks, and baseline load{' '}
          <span className="text-zinc-300">compound on one runway</span>—the same blocks for a short campaign or a
          multi-quarter roll-out, different weights and dates. Change the file, refresh the story; the visual stays the
          contract with leadership.
        </p>
      </div>

      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-stretch lg:gap-5"
        role="group"
        aria-label="Stacked strip preview: baseline BAU, optional campaign load, national and school holiday calendars"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_20px_60px_-14px_rgba(0,0,0,0.75)]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111114] px-3 py-2">
            <div className="flex gap-1" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/90" />
            </div>
            <span className="font-mono text-[10px] text-zinc-500">
              <span className="text-zinc-600">market</span>
              <span className="text-zinc-500">.yaml</span>
              <span className="text-cyan-500/75"> — preview</span>
            </span>
          </div>
          <div
            ref={yamlScrollRef}
            className={cn(
              'w-full shrink-0 overflow-y-auto scroll-smooth bg-[#0a0a0c] p-3 sm:p-3.5',
              LANDING_TWIN_VIEWPORT_H
            )}
          >
            <div className="rounded-lg border border-white/[0.05] bg-[#08080a]/95 p-2.5 sm:p-3">
              {yamlDocLines.map((row, i) => {
                if (!row || row.every((t) => t.t === '')) {
                  return <div key={i} className="min-h-[1.35em]" />;
                }
                return <YamlLine key={i} num={i + 1} tokens={row} />;
              })}
            </div>
          </div>
          <motion.div
            ref={toolbarRef}
            className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] bg-[#0e0e12] px-3 py-2.5"
            role="toolbar"
            aria-label="Stack layers — baseline, campaign, national holidays, school holidays"
            aria-describedby={`${panelId}-layer-hint`}
            variants={layerToolbarVariants.container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2, margin: '0px 0px -10% 0px' }}
          >
            <motion.div
              variants={layerToolbarVariants.chipRow}
              className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden"
            >
              <motion.button
                type="button"
                onClick={() => setBaselineOn((v) => !v)}
                aria-pressed={baselineOn}
                title="BAU / runway baseline — enable first"
                variants={layerToolbarVariants.chip}
                initial={false}
                animate={{ scale: pressKey === 'baseline' ? 0.94 : 1 }}
                transition={LAYER_PRESS_TRANSITION}
                className={layerChipBtn(baselineChipLit)}
              >
                <Layers className="h-3.5 w-3.5 opacity-80" aria-hidden />
                Baseline
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setCampaignOn((v) => !v)}
                aria-pressed={campaignOn}
                title="Adds campaign prep and live load on top of baseline"
                variants={layerToolbarVariants.chip}
                initial={false}
                animate={{ scale: pressKey === 'campaign' ? 0.94 : 1 }}
                transition={LAYER_PRESS_TRANSITION}
                className={layerChipBtn(campaignChipLit)}
              >
                <Box className="h-3.5 w-3.5 opacity-80" aria-hidden />
                Campaign
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setPublicHolidaysOn((v) => !v)}
                aria-pressed={publicHolidaysOn}
                variants={layerToolbarVariants.chip}
                initial={false}
                animate={{ scale: pressKey === 'national' ? 0.94 : 1 }}
                transition={LAYER_PRESS_TRANSITION}
                className={layerChipBtn(publicChipLit)}
              >
                <Landmark className="h-3.5 w-3.5 opacity-80" aria-hidden />
                National holidays
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setSchoolHolidaysOn((v) => !v)}
                aria-pressed={schoolHolidaysOn}
                variants={layerToolbarVariants.chip}
                initial={false}
                animate={{ scale: pressKey === 'school' ? 0.94 : 1 }}
                transition={LAYER_PRESS_TRANSITION}
                className={layerChipBtn(schoolChipLit)}
              >
                <Trees className="h-3.5 w-3.5 opacity-80" aria-hidden />
                School holidays
              </motion.button>
            </motion.div>
            <motion.p
              id={`${panelId}-layer-hint`}
              className="font-landing text-[10px] leading-snug text-zinc-600"
              aria-live="polite"
              variants={layerToolbarVariants.hint}
            >
              {layerHint}
            </motion.p>
          </motion.div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_20px_60px_-14px_rgba(0,0,0,0.75)]">
          <div className="border-b border-white/[0.06] bg-[#111114] px-3 py-2">
            <span className="font-landing text-[10px] font-semibold tracking-[0.08em] text-zinc-500">
              Technology Capacity
            </span>
          </div>
          <div
            className={cn(
              'relative flex min-h-0 shrink-0 flex-col bg-gradient-to-b from-[#0a0a0e] to-[#060608]',
              LANDING_TWIN_VIEWPORT_H
            )}
          >
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-2 sm:px-2 sm:py-3">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.14]"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 55% at 50% 20%, rgba(34, 211, 238, 0.35), transparent 60%), radial-gradient(ellipse 50% 45% at 80% 75%, rgba(139, 92, 246, 0.25), transparent 55%)',
                }}
                aria-hidden
              />
              <div className="relative flex min-h-0 w-full max-w-[min(100%,680px)] flex-1 items-center justify-center sm:max-w-[720px]">
                <QuarterIsoMiniRunway
                  bauMix={mixGrid}
                  campaignMix={mixCampaign}
                  publicMix={mixPublic}
                  schoolMix={mixSchool}
                  chronWeeks={storyChronWeeks}
                  riskByDate={riskByDateDe}
                />
              </div>
            </div>
            <div className="shrink-0 px-1 pb-2 sm:px-0">
              <PrepLiveTimelineBar mix={mixCampaign} reducedMotion={!!reducedMotion} />
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
