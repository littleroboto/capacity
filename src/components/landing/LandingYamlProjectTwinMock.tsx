import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { RunwayContributionStripSvg } from '@/components/RunwayContributionStripSvg';
import { RunwayTechCapacityDemandSparkline } from '@/components/RunwayTechCapacityDemandSparkline';
import { runPipelineFromDsl } from '@/engine/pipeline';
import type { MarketConfig } from '@/engine/types';
import { DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import type { RiskRow } from '@/engine/riskModel';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import {
  buildContributionStripRunwayLayout,
  CALENDAR_QUARTER_GRID_COL_GAP_PX,
  type PlacedRunwayCell,
  type RunwayCalendarCellValue,
} from '@/lib/calendarQuarterLayout';
import { clampHeatmapPressureOffset, heatmapTuningLensForViewMode } from '@/lib/heatmapTuningPerLens';
import { heatmapColorOptsWithMarketYaml } from '@/lib/heatmapColorOptsMarketYaml';
import type { HeatmapColorOpts, HeatmapSpectrumMode } from '@/lib/riskHeatmapColors';
import {
  buildConsecutiveMondayWeekRows,
} from '@/components/landing/landingIsoSkylineShared';
import { formatDateYmd } from '@/lib/weekRunway';
import {
  clampRunwayHeatmapGapPx,
  clampRunwayHeatmapRadiusPx,
  snapRunwayHeatmapCellPx,
} from '@/lib/runwayHeatmapLayoutPrefs';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import {
  Box,
  CalendarOff,
  FlaskConical,
  Hammer,
  Landmark,
  Layers,
  LifeBuoy,
  PartyPopper,
  Snowflake,
  Sun,
  Trees,
  TrendingUp,
} from 'lucide-react';

const LAYER_PRESS_TRANSITION = { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.85 };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

type YamlToken = { t: string; c?: string };

/**
 * `select`  — yellow editor-style selection (used when the lab + tester step is about to act on the block).
 * `comment` — line is rendered as a YAML comment (dimmed + leading `# `) — used after the boost step
 *             "comments out" the original resources block before inserting a new one.
 */
type YamlLineHighlight = 'select' | 'comment';

function YamlLine({
  num,
  tokens,
  highlight,
}: {
  num: number;
  tokens: readonly YamlToken[];
  highlight?: YamlLineHighlight;
}) {
  const isSelect = highlight === 'select';
  const isComment = highlight === 'comment';
  return (
    <div
      className={cn(
        'flex min-h-[1.35em] rounded-[3px] font-mono text-[9px] leading-[1.35] transition-colors duration-300 sm:text-[10px]',
        isSelect &&
          'bg-[#FFC72C]/40 ring-1 ring-inset ring-[#FFC72C]/55 shadow-[0_0_18px_-10px_rgba(255,199,44,0.55)]',
        isComment && 'bg-zinc-100/70 opacity-70'
      )}
    >
      <span className="w-5 shrink-0 select-none pr-2 text-right text-zinc-400 tabular-nums sm:w-6">{num}</span>
      <span className={cn('min-w-0 whitespace-pre-wrap break-all', isComment && 'text-zinc-500')}>
        {isComment ? <span className="text-zinc-500">{'# '}</span> : null}
        {tokens.map((tok, i) => (
          <span key={i} className={isComment ? 'text-zinc-500' : tok.c}>
            {tok.t}
          </span>
        ))}
      </span>
    </div>
  );
}

type YamlDocLine = readonly YamlToken[];

type RenderedYamlLine = {
  tokens: YamlDocLine;
  highlight?: YamlLineHighlight;
};

/** Top-of-doc comments — fixed regardless of which layers are enabled. */
const LANDING_YAML_DOC_HEADER: readonly YamlDocLine[] = [
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Baseline Technology load is driven by ', c: 'text-zinc-600' },
    { t: 'bau', c: 'text-cyan-700' },
    { t: ' — routine rhythm, not campaign waves.', c: 'text-zinc-600' },
  ],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Strip heat here is ', c: 'text-zinc-600' },
    { t: 'weekly_cycle', c: 'text-cyan-700' },
    { t: ' + ', c: 'text-zinc-600' },
    { t: 'market_it_weekly_load.weekday_intensity', c: 'text-cyan-700' },
    { t: '.', c: 'text-zinc-600' },
  ],
  [{ t: '', c: undefined }],
];

/** Default `resources:` block (labs 6, staff 4) — heading + two rows kept together so they can be selected/commented as a unit. */
const LANDING_YAML_RESOURCES_BAU_BLOCK: readonly YamlDocLine[] = [
  [{ t: 'resources', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'labs', c: 'text-violet-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '6', c: 'text-amber-800' },
    { t: ' }', c: 'text-zinc-500' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'staff', c: 'text-violet-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '4', c: 'text-amber-800' },
    { t: ' }', c: 'text-zinc-500' },
  ],
];

/**
 * Boosted `resources:` block (labs 7, staff 5) — appears below the original (now commented-out) block
 * during the final step of the auto-demo. Inline `# +1 …` comments call out the delta.
 */
const LANDING_YAML_RESOURCES_BOOSTED_BLOCK: readonly YamlDocLine[] = [
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Add a sandbox lab + dedicated tester — widen ', c: 'text-zinc-600' },
    { t: 'resources', c: 'text-cyan-700' },
    { t: ', overload retreats.', c: 'text-zinc-600' },
  ],
  [{ t: 'resources', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'labs', c: 'text-violet-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '7', c: 'text-amber-800' },
    { t: ' }   ', c: 'text-zinc-500' },
    { t: '# +1 sandbox lab', c: 'text-zinc-500' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'staff', c: 'text-violet-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '{ ', c: 'text-zinc-500' },
    { t: 'capacity', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '5', c: 'text-amber-800' },
    { t: ' }   ', c: 'text-zinc-500' },
    { t: '# +1 dedicated tester', c: 'text-zinc-500' },
  ],
];

/** `bau:` block + weekday-intensity table — same regardless of capacity uplift. */
const LANDING_YAML_DOC_BAU: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [{ t: 'bau', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'days_in_use', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '[mo, tu, we, th, fr, sa, su]', c: 'text-amber-800' },
  ],
  [{ t: '  ', c: undefined }, { t: 'weekly_cycle', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'labs_required', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'staff_required', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'support_days', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0', c: 'text-amber-800' },
  ],
  [{ t: '  ', c: undefined }, { t: 'market_it_weekly_load', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'weekday_intensity', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '      ', c: undefined },
    { t: 'Mon', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.87', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Tue', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.75', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Wed', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.34', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Thu', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.27', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Fri', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.45', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Sat', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.23', c: 'text-amber-800' },
  ],
  [
    { t: '      ', c: undefined },
    { t: 'Sun', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.24', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_TRADING_PEAK: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Seasonal trading peak — store rhythm climbs into back-to-school + pre-Xmas.', c: 'text-zinc-600' },
  ],
  [{ t: 'trading', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: 'seasonal', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'peak_month', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '11', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'amplitude', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.34', c: 'text-amber-800' },
  ],
  [{ t: '  ', c: undefined }, { t: 'monthly_pattern', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'Sep', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.95', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'Oct', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.05', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'Nov', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.18', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_CAMPAIGN_OFF: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'No campaign wave in YAML — ', c: 'text-zinc-600' },
    { t: 'campaigns', c: 'text-cyan-700' },
    { t: ' is empty; strip shows BAU + calendar layers only.', c: 'text-zinc-600' },
  ],
  [{ t: 'campaigns', c: 'text-violet-700' }, { t: ': ', c: 'text-zinc-500' }, { t: '[]', c: 'text-zinc-500' }],
];

const LANDING_YAML_CAMPAIGN_ON: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Campaign = integration (heavy prep) + support (lighter live).', c: 'text-zinc-600' }],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Prep ends the day before go-live (testing_prep_duration).', c: 'text-zinc-600' }],
  [{ t: 'campaigns', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- name: ', c: 'text-zinc-500' }, { t: '"Summer launch"', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: 'start_date', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-06-08', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'duration', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '35', c: 'text-amber-800' }],
  [{ t: '    ', c: undefined }, { t: 'testing_prep_duration', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '21', c: 'text-amber-800' }],
  [{ t: '    ', c: undefined }, { t: 'impact', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: 'high', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: '# Integration / prep — heavier labs + tech_staff', c: 'text-zinc-600' }],
  [{ t: '    ', c: undefined }, { t: 'campaign_support', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '2', c: 'text-amber-800' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '1.5', c: 'text-amber-800' }],
  [{ t: '      ', c: undefined }, { t: 'ops', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.25', c: 'text-amber-800' }],
  [{ t: '    ', c: undefined }, { t: '# Live / support — steadier hypercare', c: 'text-zinc-600' }],
  [{ t: '    ', c: undefined }, { t: 'live_campaign_support', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '1', c: 'text-amber-800' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.5', c: 'text-amber-800' }],
];

const LANDING_YAML_PROGRAMME_INTEGRATION: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Tech programme — multi-month integration / build phase.', c: 'text-zinc-600' }],
  [{ t: '# ', c: 'text-zinc-600' }, { t: 'Same prep+live shape as a campaign; tech-only loads (no store boost).', c: 'text-zinc-600' }],
  [{ t: 'tech_programmes', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- name: ', c: 'text-zinc-500' }, { t: '"POS rollout"', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: 'start_date', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-09-28', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'duration', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '63', c: 'text-amber-800' }],
  [{ t: '    ', c: undefined }, { t: 'testing_prep_duration', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '70', c: 'text-amber-800' }],
  [{ t: '    ', c: undefined }, { t: '# Integration / build — heaviest labs + tech_staff', c: 'text-zinc-600' }],
  [{ t: '    ', c: undefined }, { t: 'programme_support', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '3', c: 'text-amber-800' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '2.0', c: 'text-amber-800' }],
];

const LANDING_YAML_PROGRAMME_SUPPORT: readonly YamlDocLine[] = [
  [
    { t: '    ', c: undefined },
    { t: '# Live / support — steady sustain after go-live', c: 'text-zinc-600' },
  ],
  [{ t: '    ', c: undefined }, { t: 'live_programme_support', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '1', c: 'text-amber-800' }],
  [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.6', c: 'text-amber-800' }],
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
    { t: 'staffing_multiplier', c: 'text-cyan-700' },
    { t: ' scales support load on those days.', c: 'text-zinc-600' },
  ],
  [{ t: 'public_holidays', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: 'auto', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: 'false', c: 'text-amber-800' }],
  [{ t: '  ', c: undefined }, { t: 'dates', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-05-01', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-10-03', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-12-25', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-12-26', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [{ t: '    ', c: undefined }, { t: '# …', c: 'text-zinc-600' }],
  [
    { t: '  ', c: undefined },
    { t: 'staffing_multiplier', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.25', c: 'text-amber-800' },
  ],
];

/** DE-style excerpt when School holidays preview is on. */
const LANDING_YAML_SCHOOL_HOLIDAYS: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'School breaks — store traffic up, lab/team caps tight.', c: 'text-zinc-600' },
  ],
  [{ t: 'school_holidays', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: 'auto', c: 'text-emerald-800' }, { t: ': ', c: 'text-zinc-500' }, { t: 'false', c: 'text-amber-800' }],
  [{ t: '  ', c: undefined }, { t: 'dates', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-07-27', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-07-28', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [
    { t: '    ', c: undefined },
    { t: "- '", c: 'text-zinc-500' },
    { t: '2026-07-29', c: 'text-amber-800' },
    { t: "'", c: 'text-zinc-500' },
  ],
  [{ t: '    ', c: undefined }, { t: '# …', c: 'text-zinc-600' }],
  [
    { t: '  ', c: undefined },
    { t: 'staffing_multiplier', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.75', c: 'text-amber-800' },
  ],
  [{ t: '  ', c: undefined }, { t: 'load_effects', c: 'text-emerald-800' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'lab_load_mult', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.0', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_OPERATING_WINDOW: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Operating window — Oktoberfest staffing pinch + store lift.', c: 'text-zinc-600' },
  ],
  [{ t: 'operating_windows', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- name: ', c: 'text-zinc-500' }, { t: '"Oktoberfest"', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: 'start', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-09-19', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'end', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-10-04', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'lab_team_capacity_mult', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.78', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'store_pressure_mult', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.35', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_LEAVE_BAND: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'National leave band — collective summer break, lab+team caps shrink.', c: 'text-zinc-600' },
  ],
  [{ t: 'national_leave_bands', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- label: ', c: 'text-zinc-500' }, { t: '"Sommerferien"', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: 'from', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-08-10', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'to', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-08-21', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'capacityMultiplier', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.55', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_YEAR_END: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Year-end ramp — 12-week ladder into 31 Dec adds deployment fragility.', c: 'text-zinc-600' },
  ],
  [{ t: 'deployment_risk_month_curve', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'Oct', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.05', c: 'text-amber-800' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'Nov', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.10', c: 'text-amber-800' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'Dec', c: 'text-cyan-700' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.18', c: 'text-amber-800' },
  ],
];

const LANDING_YAML_DEPLOY_FREEZE: readonly YamlDocLine[] = [
  [{ t: '', c: undefined }],
  [
    { t: '# ', c: 'text-zinc-600' },
    { t: 'Deployment freeze — change-freeze window, no draw but raises risk.', c: 'text-zinc-600' },
  ],
  [{ t: 'deployment_risk_blackouts', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [{ t: '  ', c: undefined }, { t: '- id: ', c: 'text-zinc-500' }, { t: '"q4-change-freeze"', c: 'text-cyan-700' }],
  [{ t: '    ', c: undefined }, { t: 'start', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2026-11-09', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [{ t: '    ', c: undefined }, { t: 'end', c: 'text-emerald-800' }, { t: ": '", c: 'text-zinc-500' }, { t: '2027-01-04', c: 'text-amber-800' }, { t: "'", c: 'text-zinc-500' }],
  [
    { t: '    ', c: undefined },
    { t: 'severity', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '0.65', c: 'text-amber-800' },
  ],
  [
    { t: '    ', c: undefined },
    { t: 'public_reason', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '"Q4 change freeze"', c: 'text-cyan-700' },
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
  [{ t: 'holidays', c: 'text-violet-700' }, { t: ':', c: 'text-zinc-500' }],
  [
    { t: '  ', c: undefined },
    { t: 'capacity_taper_days', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1', c: 'text-amber-800' },
  ],
  [
    { t: '  ', c: undefined },
    { t: 'lab_capacity_scale', c: 'text-emerald-800' },
    { t: ': ', c: 'text-zinc-500' },
    { t: '1.0', c: 'text-amber-800' },
  ],
];

/** Fixed viewport for YAML editor + Technology strip so toggles do not resize the row. */
const LANDING_TWIN_VIEWPORT_H =
  'h-[min(36vh,260px)] sm:h-[min(40vh,300px)] lg:h-[min(42vh,320px)]';

/** ~year of chronology; right pane scrolls horizontally beyond the viewport (hero-style fade). */
const STORY_WEEKS = 52;

/** Monday start for the twin strip; DE pipeline rows resolve holiday flags on these dates. */
const TWIN_STORY_START_MONDAY = '2026-04-06';

/** Campaign — first integration spike: prep weeks, then live support segment. */
const CAMPAIGN_GO_LIVE_WI = 9;
const CAMPAIGN_PREP_WEEKS = 3;
const CAMPAIGN_LIVE_WEEKS = 5;

/** Tech programme — multi-month rollout (build then live support). */
const PROGRAMME_GO_LIVE_WI = 26; // ~2026-09-28
const PROGRAMME_INTEGRATION_WEEKS = 10; // 16 → 25
const PROGRAMME_SUPPORT_WEEKS = 9; // 26 → 34

/** Operating window — Oktoberfest band. */
const OP_WINDOW_START_WI = 23;
const OP_WINDOW_END_WI = 25;

/** National leave band — Sommerferien (week-long staff dip). */
const LEAVE_BAND_START_WI = 18;
const LEAVE_BAND_END_WI = 19;

/** Year-end ramp — last 12 weeks before week of 31 Dec 2026 (~week 38). */
const YEAR_END_TARGET_WI = 38;
const YEAR_END_LADDER_WEEKS = 12;

/** Q4 deploy freeze. */
const DEPLOY_FREEZE_START_WI = 31;
const DEPLOY_FREEZE_END_WI = 39;

/** Trading peak — back-to-school + pre-Xmas (lift store rhythm + light lab pressure). */
const TRADING_PEAK_START_WI = 22;
const TRADING_PEAK_END_WI = 38;

function cellHash01(wi: number, di: number, seed = 0): number {
  const x = Math.sin(wi * 12.9898 + di * 78.233 + seed * 41.7711 + 19.719) * 43758.5453;
  return x - Math.floor(x);
}

type CampaignPhase = 'base' | 'prep' | 'live';

function weekCampaignPhase(wi: number): CampaignPhase {
  if (wi >= CAMPAIGN_GO_LIVE_WI && wi < CAMPAIGN_GO_LIVE_WI + CAMPAIGN_LIVE_WEEKS) return 'live';
  if (wi >= CAMPAIGN_GO_LIVE_WI - CAMPAIGN_PREP_WEEKS && wi < CAMPAIGN_GO_LIVE_WI) return 'prep';
  return 'base';
}

/**
 * Weekly BAU shape on top of slow drift: `di` is Mon=0 … Sun=6 (consecutive Monday week rows).
 * Quiet weekend, peak Monday, easing through Wednesday, then Thu–Fri pick up again.
 */
const BAU_DOW_BUMP: readonly number[] = [
  0.2, 0.15, 0.045, 0.08, 0.17, -0.055, -0.08,
];

function bauActivityStress(wi: number, di: number): number {
  const seasonal = 0.08 * Math.sin((wi / STORY_WEEKS) * Math.PI * 2);
  const fortnight = 0.056 * Math.sin((wi / STORY_WEEKS) * Math.PI * 4 + 0.7);
  const dowBump = BAU_DOW_BUMP[di] ?? 0;
  const grain = (cellHash01(wi, di, 0) - 0.5) * 0.09;
  const teamPulse = 0.056 * Math.sin(wi * 0.85 + di * 1.15);
  return clamp01(0.26 + seasonal + fortnight + dowBump + grain + teamPulse);
}

function campaignStressAddition(wi: number, di: number): number {
  const dow = di < 5 ? 1 : 0.58;
  const ph = weekCampaignPhase(wi);
  if (ph === 'prep') {
    const ramp = 0.88 + 0.12 * ((wi - (CAMPAIGN_GO_LIVE_WI - CAMPAIGN_PREP_WEEKS)) / Math.max(1, CAMPAIGN_PREP_WEEKS - 1));
    return 0.62 * dow * ramp;
  }
  if (ph === 'live') {
    const fade = 1 - 0.22 * ((wi - CAMPAIGN_GO_LIVE_WI) / Math.max(1, CAMPAIGN_LIVE_WEEKS - 1));
    return 0.42 * dow * fade;
  }
  return 0.055;
}

function programmeIntegrationStressAddition(wi: number, di: number): number {
  const start = PROGRAMME_GO_LIVE_WI - PROGRAMME_INTEGRATION_WEEKS;
  if (wi < start || wi >= PROGRAMME_GO_LIVE_WI) return 0;
  const dow = di < 5 ? 1 : 0.42;
  const t = (wi - start) / Math.max(1, PROGRAMME_INTEGRATION_WEEKS - 1);
  // Ramp up early, plateau, slight crescendo into go-live.
  const shape = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.05)));
  return 0.5 * dow * shape;
}

function programmeSupportStressAddition(wi: number, di: number): number {
  if (wi < PROGRAMME_GO_LIVE_WI || wi >= PROGRAMME_GO_LIVE_WI + PROGRAMME_SUPPORT_WEEKS) return 0;
  const dow = di < 5 ? 1 : 0.5;
  const t = (wi - PROGRAMME_GO_LIVE_WI) / Math.max(1, PROGRAMME_SUPPORT_WEEKS - 1);
  // Heavy at go-live, settle into a sustain band.
  const fade = 1 - 0.55 * t;
  return 0.26 * dow * fade;
}

function operatingWindowStressAddition(wi: number, di: number): number {
  if (wi < OP_WINDOW_START_WI || wi > OP_WINDOW_END_WI) return 0;
  // Stronger weekday lift; weekends still bump from store traffic.
  const dow = di < 5 ? 1 : 0.85;
  return 0.34 * dow;
}

function nationalLeaveStressAddition(wi: number, di: number): number {
  if (wi < LEAVE_BAND_START_WI || wi > LEAVE_BAND_END_WI) return 0;
  // Capacity squeeze → utilization rises; weekdays show it most.
  const dow = di < 5 ? 1 : 0.4;
  return 0.32 * dow;
}

function yearEndStressAddition(wi: number, di: number): number {
  const distance = YEAR_END_TARGET_WI - wi;
  if (distance < 0 || distance >= YEAR_END_LADDER_WEEKS) return 0;
  const ladder = (YEAR_END_LADDER_WEEKS - distance) / YEAR_END_LADDER_WEEKS;
  const dow = di < 5 ? 1 : 0.6;
  return 0.28 * ladder * dow;
}

function tradingPeakStressAddition(wi: number, di: number): number {
  if (wi < TRADING_PEAK_START_WI || wi > TRADING_PEAK_END_WI) return 0;
  const t = (wi - TRADING_PEAK_START_WI) / Math.max(1, TRADING_PEAK_END_WI - TRADING_PEAK_START_WI);
  // Gentle climb peaking near pre-Xmas.
  const shape = 0.55 + 0.45 * Math.sin(Math.PI * t);
  // Trading peak loads stores more than tech; still adds visible heat.
  const dow = di < 5 ? 1 : 0.95;
  return 0.18 * shape * dow;
}

function deployFreezeStressAddition(_wi: number, _di: number): number {
  // Deploy freeze adds *risk*, not load — visualised via white diagonal hatches over the
  // freeze window (see {@link FreezeHatchOverlay}). The chip toggle fades hatches in, no
  // additional cell heat from this layer alone.
  return 0;
}

/** True when an ISO chron week index falls inside the demo deployment freeze window. */
function isDeployFreezeWeekIndex(wi: number): boolean {
  return wi >= DEPLOY_FREEZE_START_WI && wi <= DEPLOY_FREEZE_END_WI;
}

/**
 * Landing twin only: extra 0–1 stress when holiday toggles are on (same `public_holiday_flag` /
 * `school_holiday_flag` as the real pipeline). Coefficients are exaggerated so the strip clearly shows
 * resource pressure over 100% of caps for the demo animation.
 */
const TWIN_HOLIDAY_STRESS_PUBLIC_COEFF = 0.72;
const TWIN_HOLIDAY_STRESS_SCHOOL_COEFF = 0.34;

function publicHolidayStressContribution(row: RiskRow | undefined): number {
  return row && row.public_holiday_flag ? TWIN_HOLIDAY_STRESS_PUBLIC_COEFF : 0;
}

function schoolHolidayStressContribution(row: RiskRow | undefined): number {
  return row && row.school_holiday_flag ? TWIN_HOLIDAY_STRESS_SCHOOL_COEFF : 0;
}

const LANDING_TWIN_MARKET = 'UK';

type LayerKey =
  | 'baseline'
  | 'tradingPeak'
  | 'campaign'
  | 'progIntegration'
  | 'progSupport'
  | 'opWindow'
  | 'national'
  | 'school'
  | 'leaveBand'
  | 'yearEnd'
  | 'deployFreeze'
  | 'capacityBoost';

const ALL_LAYER_KEYS: readonly LayerKey[] = [
  'baseline',
  'tradingPeak',
  'campaign',
  'progIntegration',
  'progSupport',
  'opWindow',
  'national',
  'school',
  'leaveBand',
  'yearEnd',
  'deployFreeze',
  'capacityBoost',
];

type LayerRecord<T> = Record<LayerKey, T>;

const LAYER_HASH_SEED: LayerRecord<number> = {
  baseline: 11,
  tradingPeak: 17,
  campaign: 23,
  progIntegration: 29,
  progSupport: 31,
  opWindow: 37,
  national: 41,
  school: 43,
  leaveBand: 47,
  yearEnd: 53,
  deployFreeze: 59,
  capacityBoost: 67,
};

/**
 * Relief strength when {@link LayerKey.capacityBoost} is fully on. Cells that were riding
 * `TWIN_OVERLOAD_MAX_RATIO` (~1.55) drop to ~`1.55 / (1 + 0.7) ≈ 0.91`, pulling reds
 * back into amber/yellow band — visible "uplift" rather than a wholesale cool-down.
 */
const TWIN_CAPACITY_BOOST_RELIEF = 0.7;

function emptyLayerBools(value = false): LayerRecord<boolean> {
  return ALL_LAYER_KEYS.reduce<LayerRecord<boolean>>(
    (acc, k) => ({ ...acc, [k]: value }),
    {} as LayerRecord<boolean>
  );
}

function emptyLayerPhases(value = 0): LayerRecord<number> {
  return ALL_LAYER_KEYS.reduce<LayerRecord<number>>(
    (acc, k) => ({ ...acc, [k]: value }),
    {} as LayerRecord<number>
  );
}

/**
 * Per-cell mix for a layer given its global 0..1 phase. Each cell gets a stable random delay (hash
 * seeded by the layer) so cells fade from grey → coloured in a quick staggered random order rather
 * than the whole strip flipping at once.
 */
function perCellLayerMix(phase: number, wi: number, di: number, seed: number): number {
  if (phase <= 0) return 0;
  if (phase >= 1) return 1;
  const cellDelay = cellHash01(wi, di, seed) * 0.7; // each cell starts in [0, 0.7]
  const window = 0.3; // each cell takes ~30% of the global window to fully reveal
  return clamp01((phase - cellDelay) / window);
}

function technologyStressForCell(
  chronWi: number,
  di: number,
  row: RiskRow | undefined,
  phases: LayerRecord<number>
): number {
  const baselineMix = perCellLayerMix(phases.baseline, chronWi, di, LAYER_HASH_SEED.baseline);
  const baseline = bauActivityStress(chronWi, di) * baselineMix;

  const tradingMix = perCellLayerMix(phases.tradingPeak, chronWi, di, LAYER_HASH_SEED.tradingPeak);
  const trading = tradingPeakStressAddition(chronWi, di) * tradingMix;

  const campaignMix = perCellLayerMix(phases.campaign, chronWi, di, LAYER_HASH_SEED.campaign);
  const campaign = campaignStressAddition(chronWi, di) * campaignMix;

  const progIntMix = perCellLayerMix(
    phases.progIntegration,
    chronWi,
    di,
    LAYER_HASH_SEED.progIntegration
  );
  const progInt = programmeIntegrationStressAddition(chronWi, di) * progIntMix;

  const progSupMix = perCellLayerMix(phases.progSupport, chronWi, di, LAYER_HASH_SEED.progSupport);
  const progSup = programmeSupportStressAddition(chronWi, di) * progSupMix;

  const opWinMix = perCellLayerMix(phases.opWindow, chronWi, di, LAYER_HASH_SEED.opWindow);
  const opWin = operatingWindowStressAddition(chronWi, di) * opWinMix;

  const publicMix = perCellLayerMix(phases.national, chronWi, di, LAYER_HASH_SEED.national);
  const pub = publicHolidayStressContribution(row) * publicMix;

  const schoolMix = perCellLayerMix(phases.school, chronWi, di, LAYER_HASH_SEED.school);
  const school = schoolHolidayStressContribution(row) * schoolMix;

  const leaveMix = perCellLayerMix(phases.leaveBand, chronWi, di, LAYER_HASH_SEED.leaveBand);
  const leave = nationalLeaveStressAddition(chronWi, di) * leaveMix;

  const yearEndMix = perCellLayerMix(phases.yearEnd, chronWi, di, LAYER_HASH_SEED.yearEnd);
  const yearEnd = yearEndStressAddition(chronWi, di) * yearEndMix;

  const freezeMix = perCellLayerMix(phases.deployFreeze, chronWi, di, LAYER_HASH_SEED.deployFreeze);
  const freeze = deployFreezeStressAddition(chronWi, di) * freezeMix;

  const summed =
    baseline +
    trading +
    campaign +
    progInt +
    progSup +
    opWin +
    pub +
    school +
    leave +
    yearEnd +
    freeze;

  // Capacity uplift (extra lab + tester) widens effective capacity so per-cell utilisation
  // shrinks proportionally. Per-cell hash delays produce the same staggered "wash" as the
  // additive layers, but in reverse — overload retreats cell-by-cell instead of stacking.
  const boostMix = perCellLayerMix(
    phases.capacityBoost,
    chronWi,
    di,
    LAYER_HASH_SEED.capacityBoost
  );
  const reliefMultiplier = 1 / (1 + TWIN_CAPACITY_BOOST_RELIEF * boostMix);
  const total = summed * reliefMultiplier;

  // Bounded above 100% of caps so the tech-capacity sparkline can ride into the shaded
  // red over-cap zone; cell colour separately clamps to the heatmap range below.
  return Math.max(0, Math.min(TWIN_OVERLOAD_MAX_RATIO, total));
}

/** Max utilisation the demo allows lab+team load to reach (ratio of effective capacity). */
const TWIN_OVERLOAD_MAX_RATIO = 1.55;

function chronWeekIndexByYmd(chronWeeks: RunwayCalendarCellValue[][]): Map<string, { chronWi: number; di: number }> {
  const m = new Map<string, { chronWi: number; di: number }>();
  for (let wi = 0; wi < chronWeeks.length; wi++) {
    const row = chronWeeks[wi]!;
    for (let di = 0; di < row.length; di++) {
      const v = row[di];
      if (typeof v === 'string') m.set(v, { chronWi: wi, di });
    }
  }
  return m;
}

/**
 * The strip renderer renders cells with a missing row entry as the bare month-stripe band
 * colour (a light grey) — that's how we keep "unpainted" cells showing as a neutral grey
 * canvas before any layer starts contributing. So this builder produces TWO maps:
 *
 *  • `stripRiskByDate`     — only cells whose cumulative stress > 0 (i.e. at least one
 *                            layer has reached this cell). Anything else is omitted, so the
 *                            heatmap falls back to the grey band per-cell.
 *  • `sparklineRiskByDate` — every cell is present so the sparkline can still read
 *                            `labs_effective_cap` / `teams_effective_cap` and trace zero
 *                            load for unpainted days without dropouts.
 */
const TWIN_PAINTED_STRESS_EPSILON = 1e-4;

function buildTwinDisplayRiskByDate(
  base: Map<string, RiskRow>,
  chronWeeks: RunwayCalendarCellValue[][],
  phases: LayerRecord<number>
): {
  stripRiskByDate: Map<string, RiskRow>;
  sparklineRiskByDate: Map<string, RiskRow>;
} {
  const ymdChron = chronWeekIndexByYmd(chronWeeks);
  const stripOut = new Map<string, RiskRow>();
  const sparkOut = new Map<string, RiskRow>();
  for (const [ymd, row] of base) {
    const chron = ymdChron.get(ymd);
    // Raw stress can exceed 1.0 (lab+team_load > effective capacity) so the sparkline
    // climbs above the 100% line and the deficit ribbon shades the red over-cap zone.
    const rawStress = chron
      ? technologyStressForCell(chron.chronWi, chron.di, row, phases) * 1.07
      : 0;
    const cellStress = clamp01(rawStress);
    const labsC = row.labs_effective_cap ?? 0;
    const teamsC = row.teams_effective_cap ?? 0;
    const capSum = labsC + teamsC;
    // Drive lab/team_load with the unclamped stress so the sparkline utilisation can
    // exceed 1.0 — this is what pushes the trace into the shaded red overload band.
    const labL = capSum > 1e-9 ? rawStress * labsC : 0;
    const teamL = capSum > 1e-9 ? rawStress * teamsC : 0;
    const updated: RiskRow = {
      ...row,
      lab_load: labL,
      team_load: teamL,
      // Cell colour stays inside the heatmap [0..1] range; sparkline reads loads directly.
      tech_demand_ratio: cellStress,
      tech_pressure: cellStress,
    };
    sparkOut.set(ymd, updated);
    if (rawStress > TWIN_PAINTED_STRESS_EPSILON) {
      stripOut.set(ymd, updated);
    }
  }
  return { stripRiskByDate: stripOut, sparklineRiskByDate: sparkOut };
}

function sortedDatesFromChronWeeks(chronWeeks: RunwayCalendarCellValue[][]): string[] {
  const out: string[] = [];
  for (const week of chronWeeks) {
    for (const v of week) {
      if (typeof v === 'string') out.push(v);
    }
  }
  out.sort();
  return out;
}

/**
 * White diagonal hatches over the deployment-freeze cells in the contribution strip. Used in the
 * landing twin to visualise the change-freeze window without adding load to the heatmap colour.
 */
function FreezeHatchOverlay({
  placedCells,
  cellPx,
  width,
  height,
  chronIndexByYmd,
  phase,
  cellRadiusPx,
}: {
  placedCells: PlacedRunwayCell[];
  cellPx: number;
  width: number;
  height: number;
  chronIndexByYmd: Map<string, { chronWi: number; di: number }>;
  phase: number;
  cellRadiusPx: number;
}) {
  const idRaw = useId();
  const hatchId = useMemo(() => `freeze-hatch-${idRaw.replace(/[^a-zA-Z0-9]/g, '')}`, [idRaw]);

  const items = useMemo(() => {
    if (phase <= 0) return [] as Array<{ key: number; x: number; y: number; opacity: number }>;
    const out: Array<{ key: number; x: number; y: number; opacity: number }> = [];
    for (const c of placedCells) {
      const ymd = typeof c.dateStr === 'string' ? c.dateStr : null;
      if (!ymd) continue;
      const ci = chronIndexByYmd.get(ymd);
      if (!ci || !isDeployFreezeWeekIndex(ci.chronWi)) continue;
      const m = perCellLayerMix(phase, ci.chronWi, ci.di, LAYER_HASH_SEED.deployFreeze);
      if (m <= 0) continue;
      out.push({ key: c.flatIndex, x: c.x, y: c.y, opacity: m });
    }
    return out;
  }, [placedCells, chronIndexByYmd, phase]);

  if (!items.length) return null;

  const rr = Math.min(cellRadiusPx, cellPx / 2);

  return (
    <svg
      className="pointer-events-none absolute inset-0 block"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width={5}
          height={5}
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={5}
            stroke="white"
            strokeWidth={1.6}
            strokeOpacity={0.92}
          />
        </pattern>
      </defs>
      {items.map((it) => (
        <rect
          key={`freeze-hatch-${it.key}`}
          x={it.x}
          y={it.y}
          width={cellPx}
          height={cellPx}
          rx={rr}
          ry={rr}
          fill={`url(#${hatchId})`}
          opacity={it.opacity}
        />
      ))}
    </svg>
  );
}

/** Same contribution strip + tech capacity sparkline + legend stack as {@link RunwayGrid} single-market strip. */
function TwinWorkbenchRunwayReplica({
  chronWeeks,
  riskByDateBase,
  marketConfig,
  phases,
  enabledLayerKey,
  reducedMotion,
}: {
  chronWeeks: RunwayCalendarCellValue[][];
  riskByDateBase: Map<string, RiskRow>;
  marketConfig: MarketConfig | undefined;
  phases: LayerRecord<number>;
  /** Stable string key derived from enable-state, used to debounce strip emergence. */
  enabledLayerKey: string;
  reducedMotion: boolean;
}) {
  const cellPx = useAtcStore((s) => snapRunwayHeatmapCellPx(s.runwayHeatmapCellPx));
  const gap = useAtcStore((s) => clampRunwayHeatmapGapPx(s.runwayHeatmapCellGapPx));
  const cellRadiusPx = useAtcStore((s) => clampRunwayHeatmapRadiusPx(s.runwayHeatmapCellRadiusPx));
  const riskHeatmapTuningByLens = useAtcStore((s) => s.riskHeatmapTuningByLens);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const heatmapSpectrumContinuous = useAtcStore((s) => s.heatmapSpectrumContinuous);

  const noopOpenDayDetails = useCallback(() => {}, []);

  const sortedDatesYmd = useMemo(() => sortedDatesFromChronWeeks(chronWeeks), [chronWeeks]);

  const layout = useMemo(
    () => buildContributionStripRunwayLayout(sortedDatesYmd, cellPx, gap),
    [sortedDatesYmd, cellPx, gap]
  );

  const { stripRiskByDate, sparklineRiskByDate } = useMemo(
    () => buildTwinDisplayRiskByDate(riskByDateBase, chronWeeks, phases),
    [riskByDateBase, chronWeeks, phases]
  );

  const heatmapOptsBase = useMemo((): HeatmapColorOpts => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous ? 'continuous' : 'discrete';
    const t = riskHeatmapTuningByLens[heatmapTuningLensForViewMode('combined')];
    return {
      riskHeatmapCurve: t.curve,
      riskHeatmapGamma: t.gamma,
      riskHeatmapTailPower: t.tailPower,
      businessHeatmapPressureOffset: t.pressureOffset,
      renderStyle: heatmapRenderStyle,
      monoColor: heatmapMonoColor,
      heatmapSpectrumMode,
    };
  }, [riskHeatmapTuningByLens, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous]);

  const heatmapOptsMarket = useMemo(
    () => heatmapColorOptsWithMarketYaml('combined', heatmapOptsBase, marketConfig, 0, 0),
    [heatmapOptsBase, marketConfig]
  );

  /** Slightly hotter spectrum for the YAML twin preview (more red at a given stress vs workbench defaults). */
  const heatmapOptsTwinPreview = useMemo((): HeatmapColorOpts => {
    const g0 = heatmapOptsMarket.riskHeatmapGamma ?? 1;
    const t0 = heatmapOptsMarket.riskHeatmapTailPower ?? 1;
    return {
      ...heatmapOptsMarket,
      businessHeatmapPressureOffset: clampHeatmapPressureOffset(
        (heatmapOptsMarket.businessHeatmapPressureOffset ?? 0) + 0.12
      ),
      riskHeatmapGamma: Math.max(0.35, Math.min(3, g0 * 0.86)),
      riskHeatmapTailPower: Math.min(2.75, Math.max(1, t0 * 1.22)),
    };
  }, [heatmapOptsMarket]);

  const todayYmd = useMemo(() => formatDateYmd(new Date()), []);

  if (!layout?.contributionMeta || !layout.placedCells.length) {
    return (
      <div
        className="flex min-h-[120px] w-full items-center justify-center font-landing text-xs text-muted-foreground"
        role="status"
      >
        Strip unavailable
      </div>
    );
  }

  const stripW = layout.contentWidth;
  const stripH = layout.contentHeight;
  const placedCells = layout.placedCells;
  const meta = layout.contributionMeta;

  const chronIndexByYmd = useMemo(() => chronWeekIndexByYmd(chronWeeks), [chronWeeks]);

  return (
    <div
      className="landing-workbench-light-scope flex w-max min-w-0 max-w-full flex-row items-stretch justify-start text-foreground"
      style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: reducedMotion ? 0 : 0.12 }}
        >
          <RunwayTechCapacityDemandSparkline
            contributionMeta={meta}
            cellPx={cellPx}
            gap={gap}
            riskByDate={sparklineRiskByDate}
            width={stripW}
            className="min-w-0"
            modelTraceSuppressed={false}
            landingMarketingSweepReveal={false}
            landingMarketingTightCapacityFill
          />
        </motion.div>
        <div className="relative">
          <RunwayContributionStripSvg
            marketKey={`${LANDING_TWIN_MARKET}-yaml-preview`}
            placedCells={placedCells}
            contributionMeta={meta}
            cellPx={cellPx}
            gap={gap}
            cellRadiusPx={cellRadiusPx}
            width={stripW}
            height={stripH}
            riskByDate={stripRiskByDate}
            heatmapOpts={heatmapOptsTwinPreview}
            riskTuning={DEFAULT_RISK_TUNING}
            viewMode="combined"
            todayYmd={todayYmd}
            dimPastDays={false}
            selectedDayYmd={null}
            openDayDetailsFromCell={noopOpenDayDetails}
            emergeResetKey={enabledLayerKey}
            showAxisLabels
            ledgerAttribution={null}
            ledgerImplicitBaselineFootprint
            deploymentRiskBlackouts={null}
            landingStaggerCellPulse={false}
          />
          <FreezeHatchOverlay
            placedCells={placedCells}
            cellPx={cellPx}
            width={stripW}
            height={stripH}
            chronIndexByYmd={chronIndexByYmd}
            phase={phases.deployFreeze}
            cellRadiusPx={cellRadiusPx}
          />
        </div>
      </div>
      <div className="relative z-[4] ml-[25px] flex shrink-0 self-end">
        <HeatmapLegend
          className="w-fit max-w-full min-w-0 text-left"
          viewMode="combined"
          heatmapOpts={heatmapOptsTwinPreview}
          cellSizePx={cellPx}
          cellGapPx={gap}
        />
      </div>
    </div>
  );
}

/** Time from chip-press to first cell paint (lets YAML smooth-scroll settle first). */
const SCROLL_TO_PAINT_DELAY_MS = 520;
/** Cell-by-cell paint duration once a layer phase starts. */
const PAINT_DURATION_MS = 880;
/** Faster fade-out when user toggles a layer off. */
const PAINT_OFF_MS = 360;
/** Auto-demo step gap (must comfortably exceed scroll delay + minimal paint). */
const AUTO_DEMO_STEP_MS = 1180;

/**
 * Lab + tester (capacityBoost) is the closing beat — it gets a longer, more legible
 * sub-animation: select the original `resources:` block, comment it out, then insert
 * a fresh boosted block underneath. Stage transitions happen at these offsets after
 * the chip is pressed.
 */
const CAPACITY_BOOST_SELECT_DELAY_MS = 600; // wait for scroll-to-top to settle
const CAPACITY_BOOST_COMMENT_DELAY_MS = 1300; // selection has been visible long enough
const CAPACITY_BOOST_INSERT_DELAY_MS = 1900; // comment-out has registered, drop in the new block
/** Total capacityBoost YAML animation duration — used to extend the auto-demo "done" hold. */
const CAPACITY_BOOST_TOTAL_MS = 2700;

type CapacityBoostStage = 'idle' | 'select' | 'comment' | 'insert';

type ChipDef = {
  key: LayerKey;
  label: string;
  Icon: typeof Layers;
  title: string;
};

const CHIPS: readonly ChipDef[] = [
  { key: 'baseline', label: 'Baseline', Icon: Layers, title: 'BAU + tech weekly rhythm — enable first' },
  { key: 'tradingPeak', label: 'Trading peak', Icon: TrendingUp, title: 'Seasonal store rhythm climbs into pre-Xmas' },
  { key: 'campaign', label: 'Campaign', Icon: Box, title: 'Marketing campaign — heavy prep + lighter live support' },
  { key: 'progIntegration', label: 'Programme build', Icon: Hammer, title: 'Tech programme integration — multi-month heavy lift' },
  { key: 'progSupport', label: 'Programme support', Icon: LifeBuoy, title: 'Programme live — steady sustain after go-live' },
  { key: 'opWindow', label: 'Operating window', Icon: PartyPopper, title: 'Operating window — Oktoberfest staffing pinch + store lift' },
  { key: 'national', label: 'National holidays', Icon: Landmark, title: 'Public holidays restrict tech resources' },
  { key: 'school', label: 'School holidays', Icon: Trees, title: 'School breaks — store traffic up, lab/team caps tight' },
  { key: 'leaveBand', label: 'Leave band', Icon: Sun, title: 'Collective summer leave squeezes lab + team caps' },
  { key: 'yearEnd', label: 'Year-end', Icon: Snowflake, title: 'Q4 year-end ramp — 12-week ladder into 31 Dec' },
  { key: 'deployFreeze', label: 'Deploy freeze', Icon: CalendarOff, title: 'Change freeze raises deploy risk on those cells' },
  { key: 'capacityBoost', label: 'Lab + tester', Icon: FlaskConical, title: 'Add a sandbox lab and a dedicated tester — relief washes the reds back into range' },
];

/** Layers whose YAML lives BELOW the campaign block but ABOVE holiday/footer; stacked in toolbar order. */
const PROGRAMME_LAYERS: readonly LayerKey[] = ['progIntegration', 'progSupport'];
const CALENDAR_LAYERS: readonly LayerKey[] = ['national', 'school', 'leaveBand'];
const OPERATIONAL_LAYERS: readonly LayerKey[] = ['opWindow'];
const RISK_LAYERS: readonly LayerKey[] = ['yearEnd', 'deployFreeze'];

export function LandingYamlProjectTwinMock() {
  const reducedMotion = useReducedMotion();
  const panelId = useId();

  /** Discrete on/off per layer (drives YAML composition + auto-demo flash). */
  const [layerOn, setLayerOn] = useState<LayerRecord<boolean>>(() => emptyLayerBools(false));
  /** Per-layer 0..1 phase that drives the per-cell paint sweep (eases after a scroll delay). */
  const [layerPhases, setLayerPhases] = useState<LayerRecord<number>>(() => emptyLayerPhases(0));
  const phaseRef = useRef<LayerRecord<number>>(emptyLayerPhases(0));
  /** When the layer was most recently flipped on/off (drives scroll-then-paint scheduling per layer). */
  const layerToggledAtRef = useRef<LayerRecord<number>>(emptyLayerPhases(0));
  /**
   * Most recently flipped layer. Drives YAML scroll target: most layers append new YAML
   * blocks at the bottom (so we scroll the editor to the bottom), but `capacityBoost`
   * mutates the existing `resources:` block at the top (so we scroll back to the top
   * to reveal the labs/staff capacity update in place).
   */
  const lastToggledLayerRef = useRef<LayerKey | null>(null);

  const [layerDemoDone, setLayerDemoDone] = useState(false);
  const [toolbarSeen, setToolbarSeen] = useState(false);
  const [pressKey, setPressKey] = useState<LayerKey | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  /**
   * Multi-phase animation state for the final `capacityBoost` chip. Drives the YAML
   * editor through select → comment → insert so the user can clearly see the original
   * `resources:` block being commented out before a new boosted block is inserted.
   */
  const [boostStage, setBoostStage] = useState<CapacityBoostStage>('idle');

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

  const flipLayer = useCallback((key: LayerKey, next: boolean) => {
    setLayerOn((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
    layerToggledAtRef.current = {
      ...layerToggledAtRef.current,
      [key]: performance.now(),
    };
    lastToggledLayerRef.current = key;
  }, []);

  const flashChip = useCallback(
    (key: LayerKey) => {
      setPressKey(key);
      window.setTimeout(() => {
        setPressKey((cur) => (cur === key ? null : cur));
      }, 240);
    },
    [setPressKey]
  );

  /** Auto-demo: walk through every chip in toolbar order once the section is in view. */
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
      for (const c of CHIPS) flipLayer(c.key, true);
      setLayerDemoDone(true);
      return () => {
        cancelled = true;
        for (const t of timers) window.clearTimeout(t);
      };
    }

    const initialDelay = 720;
    CHIPS.forEach((chip, i) => {
      schedule(initialDelay + AUTO_DEMO_STEP_MS * i, () => {
        flashChip(chip.key);
        flipLayer(chip.key, true);
      });
    });
    // Hold "watch once" hint until the lab + tester sub-animation has fully played out:
    // last chip fires at index (CHIPS.length - 1); add the boost total + paint sweep + buffer.
    const lastChipFireMs = initialDelay + AUTO_DEMO_STEP_MS * (CHIPS.length - 1);
    schedule(lastChipFireMs + CAPACITY_BOOST_TOTAL_MS + PAINT_DURATION_MS + 320, () => {
      if (!cancelled) setLayerDemoDone(true);
    });

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [toolbarSeen, reducedMotion, flipLayer, flashChip]);

  /** Drive per-layer paint phases. Each layer waits SCROLL_TO_PAINT_DELAY_MS before sweeping. */
  useEffect(() => {
    if (reducedMotion) {
      const target = ALL_LAYER_KEYS.reduce<LayerRecord<number>>(
        (acc, k) => ({ ...acc, [k]: layerOn[k] ? 1 : 0 }),
        {} as LayerRecord<number>
      );
      phaseRef.current = target;
      setLayerPhases(target);
      return;
    }

    let raf = 0;
    let lastTs = performance.now();
    const step = (now: number) => {
      const dt = now - lastTs;
      lastTs = now;
      const next: LayerRecord<number> = { ...phaseRef.current };
      let changed = false;
      for (const key of ALL_LAYER_KEYS) {
        const on = layerOn[key];
        const toggledAt = layerToggledAtRef.current[key] ?? 0;
        const cur = next[key];
        let target: number;
        let durationMs: number;
        if (on) {
          target = 1;
          durationMs = PAINT_DURATION_MS;
          // Hold at current value during the scroll-to-paint delay, then ramp up.
          if (now - toggledAt < SCROLL_TO_PAINT_DELAY_MS) {
            // Still in the YAML scroll window — do not advance toward 1.
            continue;
          }
        } else {
          target = 0;
          durationMs = PAINT_OFF_MS;
        }
        if (cur === target) continue;
        const delta = (target - cur) * Math.min(1, dt / durationMs);
        const candidate = cur + delta;
        const closer = target > cur ? Math.min(target, candidate) : Math.max(target, candidate);
        if (Math.abs(closer - cur) < 1e-4 && closer !== target) continue;
        next[key] = Math.abs(target - closer) < 1e-3 ? target : closer;
        changed = true;
      }
      if (changed) {
        phaseRef.current = next;
        setLayerPhases(next);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [layerOn, reducedMotion]);

  /**
   * Advance the capacityBoost sub-stages whenever the chip flips on; reset to idle the
   * moment the user (or the auto-demo) flips it off so a re-toggle replays the sequence.
   */
  useEffect(() => {
    if (!layerOn.capacityBoost) {
      setBoostStage('idle');
      return;
    }
    if (reducedMotion) {
      setBoostStage('insert');
      return;
    }
    setBoostStage('idle');
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => setBoostStage('select'), CAPACITY_BOOST_SELECT_DELAY_MS)
    );
    timers.push(
      window.setTimeout(() => setBoostStage('comment'), CAPACITY_BOOST_COMMENT_DELAY_MS)
    );
    timers.push(
      window.setTimeout(() => setBoostStage('insert'), CAPACITY_BOOST_INSERT_DELAY_MS)
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [layerOn.capacityBoost, reducedMotion]);

  /** Chip lights when its phase has visibly landed on the strip. */
  const STRIP_PHASE_LIT = 0.18;
  const chipLit = (key: LayerKey) => layerOn[key] && layerPhases[key] >= STRIP_PHASE_LIT;

  const layerHint = !toolbarSeen
    ? 'Stack layers on the strip: BAU baseline, then campaign, programme, calendars, and risk overlays — finish with a lab + tester uplift.'
    : !layerDemoDone && !reducedMotion
      ? 'Watch once: each layer scrolls its YAML into view, paints cell-by-cell — then a lab + tester uplift pulls the overload back into range.'
      : 'Toggle freely — cells fade from grey to colour as each layer enables; the lab + tester chip relieves the reds.';

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
            transition: { staggerChildren: 0.06, delayChildren: 0.04 },
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
        ? 'border-[#FFC72C]/55 bg-[#FFC72C]/18 text-zinc-900 shadow-[0_0_20px_-10px_rgba(255,199,44,0.4)] ring-1 ring-inset ring-[#FFC72C]/25'
        : 'border-zinc-200/90 bg-white text-zinc-600 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800'
    );

  const yamlDocLines = useMemo<RenderedYamlLine[]>(() => {
    const parts: RenderedYamlLine[] = [];

    for (const tokens of LANDING_YAML_DOC_HEADER) parts.push({ tokens });

    // Original `resources:` block — highlight tracks the boost sub-stage:
    //  • idle             → no highlight
    //  • select           → yellow editor selection wraps the heading + 2 rows
    //  • comment / insert → block is dimmed and prefixed with `# ` (commented out)
    const bauHighlight: YamlLineHighlight | undefined =
      boostStage === 'select'
        ? 'select'
        : boostStage === 'comment' || boostStage === 'insert'
          ? 'comment'
          : undefined;
    for (const tokens of LANDING_YAML_RESOURCES_BAU_BLOCK) {
      parts.push({ tokens, highlight: bauHighlight });
    }

    // Once the original block is commented out, drop in the new boosted block underneath.
    if (boostStage === 'insert') {
      parts.push({ tokens: [{ t: '', c: undefined }] });
      for (const tokens of LANDING_YAML_RESOURCES_BOOSTED_BLOCK) parts.push({ tokens });
    }

    for (const tokens of LANDING_YAML_DOC_BAU) parts.push({ tokens });

    if (layerOn.tradingPeak) for (const tokens of LANDING_YAML_TRADING_PEAK) parts.push({ tokens });

    for (const tokens of layerOn.campaign ? LANDING_YAML_CAMPAIGN_ON : LANDING_YAML_CAMPAIGN_OFF) {
      parts.push({ tokens });
    }

    if (PROGRAMME_LAYERS.some((k) => layerOn[k])) {
      if (layerOn.progIntegration) for (const tokens of LANDING_YAML_PROGRAMME_INTEGRATION) parts.push({ tokens });
      if (layerOn.progSupport) for (const tokens of LANDING_YAML_PROGRAMME_SUPPORT) parts.push({ tokens });
    }

    if (OPERATIONAL_LAYERS.some((k) => layerOn[k])) {
      if (layerOn.opWindow) for (const tokens of LANDING_YAML_OPERATING_WINDOW) parts.push({ tokens });
    }

    const calendarOn = CALENDAR_LAYERS.some((k) => layerOn[k]);
    if (calendarOn) {
      if (layerOn.national) for (const tokens of LANDING_YAML_PUBLIC_HOLIDAYS) parts.push({ tokens });
      if (layerOn.school) for (const tokens of LANDING_YAML_SCHOOL_HOLIDAYS) parts.push({ tokens });
      if (layerOn.leaveBand) for (const tokens of LANDING_YAML_LEAVE_BAND) parts.push({ tokens });
    } else {
      for (const tokens of LANDING_YAML_CALENDAR_PLACEHOLDER) parts.push({ tokens });
    }

    if (RISK_LAYERS.some((k) => layerOn[k])) {
      if (layerOn.yearEnd) for (const tokens of LANDING_YAML_YEAR_END) parts.push({ tokens });
      if (layerOn.deployFreeze) for (const tokens of LANDING_YAML_DEPLOY_FREEZE) parts.push({ tokens });
    }

    for (const tokens of LANDING_YAML_DOC_FOOTER) parts.push({ tokens });
    return parts;
  }, [layerOn, boostStage]);

  const yamlScrollRef = useRef<HTMLDivElement>(null);
  const yamlLayoutSig = ALL_LAYER_KEYS.map((k) => (layerOn[k] ? '1' : '0')).join('');
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
    // `capacityBoost` mutates the resources block at the top in place; every other
    // layer appends a fresh block at the bottom. Scroll target follows where the
    // visible change happened so the user's eye lands on it.
    const scrollToTop = lastToggledLayerRef.current === 'capacityBoost';
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        el.scrollTo({
          top: scrollToTop ? 0 : el.scrollHeight,
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

  const { riskByDateTwin, twinMarketConfig } = useMemo(() => {
    const { riskSurface, parseError, configs } = runPipelineFromDsl(
      defaultDslForMarket(LANDING_TWIN_MARKET),
      DEFAULT_RISK_TUNING
    );
    const m = new Map<string, RiskRow>();
    if (parseError)
      return { riskByDateTwin: m, twinMarketConfig: undefined as MarketConfig | undefined };
    const twinMarketConfig = configs.find((c) => c.market === LANDING_TWIN_MARKET);
    for (const r of riskSurface) {
      if (r.market === LANDING_TWIN_MARKET) m.set(r.date, r);
    }
    return { riskByDateTwin: m, twinMarketConfig };
  }, []);

  /**
   * Stable across the lifetime of this section — keeps the strip wrapper mounted so toggling
   * layers does NOT remount cells and re-trigger the left-to-right entry sweep. Cells fade
   * organically as their per-cell stress phase advances each frame.
   */
  const enabledLayerKey = 'yaml-twin-replica-static';

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
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b45309]">
          Declarative market model
        </p>
        <h2
          id={`${panelId}-heading`}
          className="font-landing text-balance text-2xl font-semibold leading-snug text-zinc-900 sm:text-[1.65rem]"
        >
          Campaigns, BAU, and programmes draw on the same resources
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Every block is a model of how that activity draws on the team — baseline rhythm,
          campaign integration and support, multi-month programmes, year-end ramps. They stack on
          the same runway with the things that take capacity away — holiday calendars, leave bands,
          operating windows, and deploy freezes — layer on layer, until what&rsquo;s left is the
          predicted load on each day. Greys fill in where the model has something to say.
        </p>
      </div>

      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-stretch lg:gap-5"
        role="group"
        aria-label="Stacked strip preview: baseline BAU, campaigns, tech programmes, holiday calendars, operating windows, year-end ramps, deploy freezes, then a lab + tester uplift that pulls overload back into range"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_16px_50px_-18px_rgba(15,23,42,0.1)] ring-1 ring-zinc-950/[0.04]">
          <div className="flex items-center gap-2 border-b border-zinc-200/90 bg-zinc-100/90 px-3 py-2">
            <div className="flex gap-1" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/90" />
            </div>
            <span className="font-mono text-[10px] text-zinc-600">
              <span className="text-zinc-700">market</span>
              <span className="text-zinc-600">.yaml</span>
              <span className="text-cyan-700"> — preview</span>
            </span>
          </div>
          <div
            ref={yamlScrollRef}
            className={cn(
              'w-full shrink-0 overflow-y-auto scroll-smooth bg-zinc-50/80 p-3 sm:p-3.5',
              LANDING_TWIN_VIEWPORT_H
            )}
          >
            <div className="rounded-lg border border-zinc-200/90 bg-white p-2.5 shadow-inner shadow-zinc-950/[0.03] sm:p-3">
              {yamlDocLines.map((row, i) => {
                const tokens = row.tokens;
                if (!tokens || tokens.every((t) => t.t === '')) {
                  return <div key={i} className="min-h-[1.35em]" />;
                }
                return <YamlLine key={i} num={i + 1} tokens={tokens} highlight={row.highlight} />;
              })}
            </div>
          </div>
          <motion.div
            ref={toolbarRef}
            className="mt-auto flex flex-col gap-2 border-t border-zinc-200/90 bg-zinc-100/70 px-3 py-2.5"
            role="toolbar"
            aria-label="Stack layers — eleven capacity model factors plus a final lab + tester uplift"
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
              {CHIPS.map((chip) => {
                const Icon = chip.Icon;
                const lit = chipLit(chip.key);
                return (
                  <motion.button
                    key={chip.key}
                    type="button"
                    onClick={() => flipLayer(chip.key, !layerOn[chip.key])}
                    aria-pressed={layerOn[chip.key]}
                    title={chip.title}
                    variants={layerToolbarVariants.chip}
                    initial={false}
                    animate={{ scale: pressKey === chip.key ? 0.94 : 1 }}
                    transition={LAYER_PRESS_TRANSITION}
                    className={layerChipBtn(lit)}
                  >
                    <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    {chip.label}
                  </motion.button>
                );
              })}
            </motion.div>
            <motion.p
              id={`${panelId}-layer-hint`}
              className="font-landing text-[10px] leading-snug text-zinc-500"
              aria-live="polite"
              variants={layerToolbarVariants.hint}
            >
              {layerHint}
            </motion.p>
          </motion.div>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_16px_50px_-18px_rgba(15,23,42,0.1)] ring-1 ring-zinc-950/[0.04]">
          <div className="border-b border-zinc-200/90 bg-zinc-100/90 px-3 py-2">
            <span className="font-landing text-[10px] font-semibold tracking-[0.08em] text-zinc-600">
              Technology Capacity
            </span>
          </div>
          <div
            className={cn(
              'relative flex min-h-0 shrink-0 flex-col overflow-x-auto overflow-y-hidden bg-gradient-to-b from-zinc-50 to-white',
              LANDING_TWIN_VIEWPORT_H
            )}
          >
            <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col items-start justify-start py-2 sm:py-3">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.35]"
                style={{
                  background:
                    'radial-gradient(ellipse 70% 55% at 50% 18%, rgba(34, 211, 238, 0.12), transparent 58%), radial-gradient(ellipse 50% 45% at 82% 78%, rgba(139, 92, 246, 0.08), transparent 55%)',
                }}
                aria-hidden
              />
              <div className="relative z-[1] flex min-h-0 w-full min-w-0 flex-1 items-start justify-start">
                <TwinWorkbenchRunwayReplica
                  chronWeeks={storyChronWeeks}
                  riskByDateBase={riskByDateTwin}
                  marketConfig={twinMarketConfig}
                  phases={layerPhases}
                  enabledLayerKey={enabledLayerKey}
                  reducedMotion={!!reducedMotion}
                />
              </div>
            </div>
            {/* Right-edge fade — hints chronology continues beyond the viewport (hero-style). */}
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-16 bg-gradient-to-l from-white via-white/80 to-transparent sm:w-24"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
