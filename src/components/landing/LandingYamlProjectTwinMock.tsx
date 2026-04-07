import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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
  contribPanelFill,
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

/** BAU Technology rhythm: sprint waves, weekday shape, weekends — never a flat plane when campaign is off. */
function bauActivityStress(wi: number, di: number): number {
  const seasonal = 0.08 * Math.sin((wi / STORY_WEEKS) * Math.PI * 2);
  const fortnight = 0.055 * Math.sin((wi / STORY_WEEKS) * Math.PI * 4 + 0.7);
  const midWeek = di >= 2 && di <= 4 ? 0.09 : di <= 1 ? 0.035 : 0;
  const weekend = di >= 5 ? 0.12 : 0;
  const grain = (cellHash01(wi, di) - 0.5) * 0.1;
  const teamPulse = 0.065 * Math.sin(wi * 0.85 + di * 1.15);
  return clamp01(0.27 + seasonal + fortnight + midWeek + weekend + grain + teamPulse);
}

function campaignStressAddition(wi: number, di: number, campaignMix: number): number {
  if (campaignMix <= 0) return 0;
  const dow = di < 5 ? 1 : 0.58;
  const ph = weekCampaignPhase(wi);
  if (ph === 'prep') {
    const ramp = 0.88 + 0.12 * ((wi - (GO_LIVE_WI - PREP_WEEKS)) / Math.max(1, PREP_WEEKS - 1));
    return 0.74 * campaignMix * dow * ramp;
  }
  if (ph === 'live') {
    const fade = 1 - 0.22 * ((wi - GO_LIVE_WI) / Math.max(1, LIVE_WEEKS - 1));
    return 0.5 * campaignMix * dow * fade;
  }
  return 0.07 * campaignMix;
}

/** National = closed day (pull utilisation down); school breaks add trading-shaped load (same DE flags). */
function calendarStressAdjustment(
  row: RiskRow | undefined,
  publicMix: number,
  schoolMix: number
): number {
  if (!row) return 0;
  let delta = 0;
  if (publicMix > 0 && row.public_holiday_flag) delta -= 0.38 * publicMix;
  if (schoolMix > 0 && row.school_holiday_flag) delta += 0.24 * schoolMix;
  return delta;
}

/** Muted red isometric column — reads as “closed / national holiday”, not heatmap hot. */
const PUBLIC_HOLIDAY_ISO_BASE = '#c41e1e';

function technologyStressForCell(
  chronWi: number,
  di: number,
  row: RiskRow | undefined,
  campaignMix: number,
  publicMix: number,
  schoolMix: number
): number {
  const bau = bauActivityStress(chronWi, di);
  const camp = campaignStressAddition(chronWi, di, campaignMix);
  const cal = calendarStressAdjustment(row, publicMix, schoolMix);
  return clamp01(bau + camp + cal);
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
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-landing text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Two quarters · weeks
        </span>
        <span className="font-mono text-[9px] text-zinc-600">26 × 7 cells</span>
      </div>
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
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-landing text-[9px] text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-violet-500/80 shadow-[0_0_10px_rgba(139,92,246,0.45)]" />
          Prep = readiness / test workload (YAML <code className="font-mono text-[8px] text-zinc-500">campaign_support</code>)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-cyan-500/75 shadow-[0_0_10px_rgba(34,211,238,0.35)]" />
          Live = operational support (YAML <code className="font-mono text-[8px] text-zinc-500">live_campaign_support</code>)
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-500">
          <span className="h-3 w-0.5 rounded-sm bg-[#FFC72C]/90 shadow-[0_0_8px_rgba(255,199,44,0.35)]" />
          Gold edge = go-live
        </span>
      </div>
    </motion.div>
  );
}

function QuarterIsoMiniRunway({
  campaignMix,
  publicMix,
  schoolMix,
  chronWeeks: chronWeeksProp,
  riskByDate,
}: {
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
        aria-label="Half-year Technology strip: BAU rhythm; national holidays as short red columns when enabled; school breaks add load; campaign prep and live when enabled"
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
          const stress = technologyStressForCell(chronWi, di, row, campaignMix, publicMix, schoolMix);
          const publicHolActive = publicMix > 0.06 && row?.public_holiday_flag;
          const { topC, leftC, rightC, height01 } = syntheticStressToIsoColumnStyle(stress);
          const calH = calHeightFromMetric(height01, rowTowerPx, false);
          const columnTy = deckAndColumnY(L, calH, runwayBandH);
          const topCf = publicHolActive ? contribPanelFill(PUBLIC_HOLIDAY_ISO_BASE, 'top') : topC;
          const leftCf = publicHolActive ? contribPanelFill(PUBLIC_HOLIDAY_ISO_BASE, 'left') : leftC;
          const rightCf = publicHolActive ? contribPanelFill(PUBLIC_HOLIDAY_ISO_BASE, 'right') : rightC;

          return (
            <g key={`m-${li}-${di}`} transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}>
              <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                <IsoColumnAtOrigin L={L} calH={calH} topC={topCf} leftC={leftCf} rightC={rightCf} />
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
  }, [campaignMix, publicMix, schoolMix, chronWeeksProp, riskByDate]);
}

type LayerMixes = { c: number; p: number; s: number };

const MIX_INITIAL: LayerMixes = { c: 0, p: 0, s: 0 };

export function LandingYamlProjectTwinMock() {
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  const [campaignOn, setCampaignOn] = useState(false);
  const [publicHolidaysOn, setPublicHolidaysOn] = useState(false);
  const [schoolHolidaysOn, setSchoolHolidaysOn] = useState(false);

  const [layerMixes, setLayerMixes] = useState<LayerMixes>(MIX_INITIAL);
  const mixRef = useRef<LayerMixes>(MIX_INITIAL);
  const [campaignEverOn, setCampaignEverOn] = useState(false);

  useEffect(() => {
    if (campaignOn) setCampaignEverOn(true);
  }, [campaignOn]);

  useEffect(() => {
    const target: LayerMixes = {
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
    const durationMs = 380;
    const ease = (t: number) => 1 - (1 - t) ** 3;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const e = ease(t);
      const next: LayerMixes = {
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
  }, [campaignOn, publicHolidaysOn, schoolHolidaysOn, reducedMotion]);

  const { c: mixCampaign, p: mixPublic, s: mixSchool } = layerMixes;

  const layerHint = !campaignEverOn
    ? 'Start with Baseline, then turn on With campaign to load prep and live on the strip.'
    : !publicHolidaysOn && !schoolHolidaysOn
      ? 'Next: add National holidays (closed days, red) and/or School holidays (extra load) from the DE calendar.'
      : 'Mix layers freely — each toggle cross-fades; Baseline / With campaign still switches the YAML preview.';

  const yamlBaseline: readonly (readonly YamlToken[])[] = [
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
    [{ t: '      ', c: undefined }, { t: 'labs_required', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.5', c: 'text-amber-200/90' }],
    [{ t: '      ', c: undefined }, { t: 'tech_staff', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '0.5', c: 'text-amber-200/90' }],
  ];

  const yamlOff: readonly (readonly YamlToken[])[] = [
    [{ t: '# ', c: 'text-zinc-600' }, { t: 'No campaign — no prep or live segment', c: 'text-zinc-600' }],
    [{ t: '# ', c: 'text-zinc-600' }, { t: 'Technology lens stays at BAU + calendar rhythm only.', c: 'text-zinc-600' }],
    [{ t: 'campaigns', c: 'text-zinc-600' }, { t: ': ', c: 'text-zinc-600' }, { t: '[]', c: 'text-zinc-500' }],
    [{ t: '', c: undefined }],
    [{ t: '# ', c: 'text-zinc-600' }, { t: 'With a campaign, testing_prep_duration +', c: 'text-zinc-600' }],
    [{ t: '# ', c: 'text-zinc-600' }, { t: 'campaign_support / live_campaign_support apply.', c: 'text-zinc-600' }],
    [{ t: '', c: undefined }],
    [{ t: 'resources', c: 'text-violet-300/95' }, { t: ':', c: 'text-zinc-500' }],
    [{ t: '  ', c: undefined }, { t: 'labs', c: 'text-violet-300/95' }, { t: ': ', c: 'text-zinc-500' }, { t: '{ ', c: 'text-zinc-500' }, { t: 'capacity', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '6', c: 'text-amber-200/90' }, { t: ' }', c: 'text-zinc-500' }],
    [{ t: '  ', c: undefined }, { t: 'staff', c: 'text-violet-300/95' }, { t: ': ', c: 'text-zinc-500' }, { t: '{ ', c: 'text-zinc-500' }, { t: 'capacity', c: 'text-emerald-300/90' }, { t: ': ', c: 'text-zinc-500' }, { t: '4', c: 'text-amber-200/90' }, { t: ' }', c: 'text-zinc-500' }],
    [{ t: '', c: undefined }],
    [{ t: '# ', c: 'text-zinc-600' }, { t: '…', c: 'text-zinc-600' }],
    [{ t: '', c: undefined }],
    [{ t: '', c: undefined }],
    [{ t: '', c: undefined }],
    [{ t: '', c: undefined }],
    [{ t: '', c: undefined }],
  ];

  const activeLines = campaignOn ? yamlBaseline : yamlOff;
  const lineCount = Math.max(yamlBaseline.length, yamlOff.length);

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
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400/85">
          Model inputs
        </p>
        <h2
          id={`${panelId}-heading`}
          className="font-landing text-balance text-2xl font-semibold leading-snug text-white sm:text-[1.65rem]"
        >
          Prep, go-live, and live — all drawing on capacity
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          <span className="text-zinc-300">testing_prep_duration</span> defines how long{' '}
          <span className="text-zinc-300">campaign_support</span> applies — labs, tech, and test integration (readiness
          pressure). After go-live, <span className="text-zinc-300">live_campaign_support</span> is operational /
          hypercare-style load, usually lighter on the Technology lane.{' '}
          <span className="text-zinc-300">National holidays</span> show as short red columns (closed day);{' '}
          <span className="text-zinc-300">school breaks</span> add load. The preview opens on Baseline only — enable
          campaign first, then calendar layers when you are ready.
        </p>
      </div>

      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-stretch lg:gap-5"
        role="group"
        aria-label="Compare baseline capacity with a campaign that adds prep then live Technology load"
      >
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_20px_60px_-14px_rgba(0,0,0,0.75)]">
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
          <div className="min-h-0 flex-1 overflow-auto bg-[#0a0a0c] p-3 sm:p-3.5">
            <div className="rounded-lg border border-white/[0.05] bg-[#08080a]/95 p-2.5 sm:p-3">
              {Array.from({ length: lineCount }, (_, i) => {
                const row = activeLines[i];
                if (!row || row.every((t) => t.t === '')) {
                  return <div key={i} className="min-h-[1.35em]" />;
                }
                return <YamlLine key={i} num={i + 1} tokens={row} />;
              })}
            </div>
          </div>
          <div
            className="flex flex-col gap-2 border-t border-white/[0.06] bg-[#0e0e12] px-3 py-2.5"
            role="toolbar"
            aria-label="Preview layers for YAML and 3D strip"
            aria-describedby={`${panelId}-layer-hint`}
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCampaignOn(false)}
                aria-pressed={!campaignOn}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-landing text-[11px] font-semibold transition-colors',
                  !campaignOn
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
                )}
              >
                <Layers className="h-3.5 w-3.5 opacity-80" aria-hidden />
                Baseline
              </button>
              <button
                type="button"
                onClick={() => setCampaignOn(true)}
                aria-pressed={campaignOn}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-landing text-[11px] font-semibold transition-colors',
                  campaignOn
                    ? 'border-violet-500/45 bg-violet-500/15 text-violet-100'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
                )}
              >
                <Box className="h-3.5 w-3.5 opacity-80" aria-hidden />
                With campaign
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPublicHolidaysOn((v) => !v)}
                aria-pressed={publicHolidaysOn}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-landing text-[11px] font-semibold transition-colors',
                  publicHolidaysOn
                    ? 'border-red-500/50 bg-red-500/14 text-red-100 shadow-[0_0_16px_-4px_rgba(239,68,68,0.35)]'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
                )}
              >
                <Landmark className="h-3.5 w-3.5 opacity-80" aria-hidden />
                National holidays
              </button>
              <button
                type="button"
                onClick={() => setSchoolHolidaysOn((v) => !v)}
                aria-pressed={schoolHolidaysOn}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-landing text-[11px] font-semibold transition-colors',
                  schoolHolidaysOn
                    ? 'border-sky-500/45 bg-sky-500/12 text-sky-100'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
                )}
              >
                <Trees className="h-3.5 w-3.5 opacity-80" aria-hidden />
                School holidays
              </button>
            </div>
            <p
              id={`${panelId}-layer-hint`}
              className="font-landing text-[10px] leading-snug text-zinc-600"
            >
              {layerHint}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_20px_60px_-14px_rgba(0,0,0,0.75)]">
          <div className="border-b border-white/[0.06] bg-[#111114] px-3 py-2">
            <span className="font-landing text-[10px] font-semibold tracking-[0.08em] text-zinc-500">
              Technology Capacity
            </span>
          </div>
          <div className="relative flex min-h-[220px] flex-1 flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0e] to-[#060608] px-1 py-3 sm:px-2 sm:py-4">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                background:
                  'radial-gradient(ellipse 70% 55% at 50% 20%, rgba(34, 211, 238, 0.35), transparent 60%), radial-gradient(ellipse 50% 45% at 80% 75%, rgba(139, 92, 246, 0.25), transparent 55%)',
              }}
              aria-hidden
            />
            <div className="relative w-full max-w-[min(100%,680px)] shrink-0 sm:max-w-[720px]">
              <QuarterIsoMiniRunway
                campaignMix={mixCampaign}
                publicMix={mixPublic}
                schoolMix={mixSchool}
                chronWeeks={storyChronWeeks}
                riskByDate={riskByDateDe}
              />
            </div>
            <PrepLiveTimelineBar mix={mixCampaign} reducedMotion={!!reducedMotion} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
