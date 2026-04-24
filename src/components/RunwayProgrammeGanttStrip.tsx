import { useId, useMemo } from 'react';
import { parseDate } from '@/engine/calendar';
import type { DeploymentRiskBlackout } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W } from '@/lib/calendarQuarterLayout';
import {
  deploymentBlackoutYamlEnvelopeForSpan,
  formatDeploymentBlackoutIsoRange,
  ymdInAnyDeploymentRiskBlackout,
} from '@/lib/deploymentRiskBlackoutCalendar';
import { enumerateIsoDatesInclusive } from '@/lib/runwayDateFilter';
import { formatDateYmd } from '@/lib/weekRunway';
import {
  contributionStripYmdToCellLayout,
  xSpanForInclusiveYmdRangeClipped,
} from '@/lib/runwayProgrammeGanttLayout';
import type { ProgrammeGanttBar } from '@/lib/runwayProgrammeGanttModel';
import type { ProgrammeGanttDisplayPrefs } from '@/lib/runwayProgrammeGanttPrefs';

const LABEL_GAP_PX = 5;
const LABEL_FONT_SIZE_PX = 11;

function programmeBarTrailingLabel(
  name: string,
  startYmd: string,
  endYmdInclusive: string,
  includeDateRange: boolean,
): string {
  if (!includeDateRange) return name;
  const range =
    startYmd === endYmdInclusive ? startYmd : `${startYmd}–${endYmdInclusive}`;
  return `${name} · ${range}`;
}

/** Reserved above programme bars when deployment blackouts are shown (ribbon + vertical guides). */
export const PROGRAMME_GANTT_BLACKOUT_CHROME_H_PX = 22;

/** Ribbon-centred deployment-freeze glyph (blackout band only — avoids school palm in the bar body). */
const RIBBON_BLACKOUT_ICON_PX = 16;
const RIBBON_BLACKOUT_ICON_HALF = RIBBON_BLACKOUT_ICON_PX / 2;

/** Corner glyph for school columns (drawn after labels so it stays legible). */
const SCHOOL_STRIP_ICON_PX = 13;

const SNOWFLAKE_PATH_DS = [
  'm10 20-1.25-2.5L6 18',
  'M10 4 8.75 6.5 6 6',
  'm14 20 1.25-2.5L18 18',
  'm14 4 1.25 2.5L18 6',
  'm17 21-3-6h-4',
  'm17 3-3 6 1.5 3',
  'M2 12h6.5L10 9',
  'm20 10-1.5 2 1.5 2',
  'M22 12h-6.5L14 15',
  'm4 10 1.5 2L4 14',
  'm7 21 3-6-1.5-3',
  'm7 3 3 6h4',
] as const;

const PALMTREE_PATH_DS = [
  'M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4',
  'M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3',
  'M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35',
  'M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14',
] as const;

function nextYmd(ymd: string): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + 1);
  return formatDateYmd(d);
}

function mergeContiguousYmdToSpans(
  sortedYmSet: Set<string>,
  layout: ReadonlyMap<string, { x: number; cellPx: number }>,
): Array<{ key: string; x0: number; x1: number; ymdStart: string; ymdEnd: string }> {
  const sorted = [...sortedYmSet].sort();
  const groups: string[][] = [];
  for (const ymd of sorted) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (!g || !last || nextYmd(last) !== ymd) groups.push([ymd]);
    else g.push(ymd);
  }
  return groups
    .map((g, i) => {
      const c0 = layout.get(g[0]!);
      const c1 = layout.get(g[g.length - 1]!);
      if (!c0 || !c1) return null;
      return {
        key: `span-${i}-${g[0]}`,
        x0: c0.x,
        x1: c1.x + c1.cellPx,
        ymdStart: g[0]!,
        ymdEnd: g[g.length - 1]!,
      };
    })
    .filter(Boolean) as Array<{ key: string; x0: number; x1: number; ymdStart: string; ymdEnd: string }>;
}

function programmeBlackoutSpanLabel(
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined,
  ymdStart: string,
  ymdEnd: string,
): string {
  if (!blackouts?.length) return 'Blackout';
  for (const b of blackouts) {
    if (!(ymdStart <= b.end && ymdEnd >= b.start)) continue;
    const t = (b.public_reason ?? '').trim();
    if (t) return t.length > 42 ? `${t.slice(0, 40)}…` : t;
    return 'Blackout';
  }
  return 'Blackout';
}

export type RunwayProgrammeGanttStripProps = {
  marketKey: string;
  placedCells: readonly PlacedRunwayCell[];
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  width: number;
  riskByDate: ReadonlyMap<string, RiskRow>;
  bars: readonly ProgrammeGanttBar[];
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined;
  prefs: ProgrammeGanttDisplayPrefs;
};

/** Vertical space for `laneCount` stacked programme rows (0 = track padding only). */
export function runwayProgrammeGanttStripHeightPx(prefs: ProgrammeGanttDisplayPrefs, laneCount: number): number {
  const { stripTopPadPx, stripBottomPadPx, barHeightPx, laneGapPx } = prefs;
  const n = Math.max(0, laneCount);
  const bodyPx = n === 0 ? 0 : n * barHeightPx + (n - 1) * laneGapPx;
  /** Blackout ribbon is added in-render when days hit `deployment_risk_blackouts`; this is body + pads only. */
  return stripTopPadPx + bodyPx + stripBottomPadPx;
}

export function RunwayProgrammeGanttStrip({
  marketKey,
  placedCells,
  contributionMeta,
  cellPx,
  gap: _gap,
  width,
  riskByDate,
  bars,
  blackouts,
  prefs,
}: RunwayProgrammeGanttStripProps) {
  const uid = useId().replace(/:/g, '');
  const hatchId = `gantt-hatch-45-${uid}`;
  const schoolHatchId = `gantt-school-hatch-45-${uid}`;
  const barHatchId = `gantt-bar-hatch-45-${uid}`;
  const barTile = Math.max(2, Math.min(14, prefs.barHatchSpacingPx));
  const barMid = barTile / 2;

  const { clipStart, clipEnd, layout } = useMemo(() => {
    const layout = contributionStripYmdToCellLayout(placedCells, cellPx);
    const clipStart = contributionMeta.rangeStartYmd;
    const clipEnd = contributionMeta.rangeEndYmd;
    return { clipStart, clipEnd, layout };
  }, [placedCells, cellPx, contributionMeta.rangeStartYmd, contributionMeta.rangeEndYmd]);

  const { barRects, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx } = useMemo(() => {
    const { stripTopPadPx, barHeightPx, laneGapPx, stripBottomPadPx, barOpacity } = prefs;
    const stride = barHeightPx + laneGapPx;

    type Row = { b: ProgrammeGanttBar; span: { x0: number; x1: number } };
    const rows: Row[] = [];
    for (const b of bars) {
      const span = xSpanForInclusiveYmdRangeClipped(b.startYmd, b.endYmdInclusive, layout, clipStart, clipEnd);
      if (!span) continue;
      rows.push({ b, span });
    }

    rows.sort((a, b) => {
      if (a.b.startYmd !== b.b.startYmd) return a.b.startYmd.localeCompare(b.b.startYmd);
      if (a.b.kind !== b.b.kind) return a.b.kind === 'campaign' ? -1 : 1;
      return a.b.name.localeCompare(b.b.name);
    });

    const blackoutYmdSet = new Set<string>();
    const schoolYmdSet = new Set<string>();
    for (const ymd of enumerateIsoDatesInclusive(clipStart, clipEnd)) {
      if (!layout.has(ymd)) continue;
      const row = riskByDate.get(ymd);
      const inB = prefs.showBlackouts && ymdInAnyDeploymentRiskBlackout(ymd, blackouts ?? null);
      const inS = prefs.showSchoolHolidays && Boolean(row?.school_holiday_flag);
      if (inB) blackoutYmdSet.add(ymd);
      if (inS) schoolYmdSet.add(ymd);
    }

    const blackoutSpans = mergeContiguousYmdToSpans(blackoutYmdSet, layout);
    const schoolOverlaySpans = mergeContiguousYmdToSpans(schoolYmdSet, layout);
    const blackoutBandPx =
      prefs.showBlackouts && blackoutSpans.length > 0 ? PROGRAMME_GANTT_BLACKOUT_CHROME_H_PX : 0;

    const barRects = rows.map((row, i) => ({
      key: row.b.id,
      x: row.span.x0,
      y: stripTopPadPx + blackoutBandPx + i * stride,
      w: row.span.x1 - row.span.x0,
      h: barHeightPx,
      fill: row.b.kind === 'campaign' ? prefs.campaignFill : prefs.techFill,
      name: row.b.name,
      startYmd: row.b.startYmd,
      endYmdInclusive: row.b.endYmdInclusive,
      kind: row.b.kind,
      opacity: barOpacity,
    }));

    const n = barRects.length;
    const bodyPx = n === 0 ? 0 : n * barHeightPx + (n - 1) * laneGapPx;
    const svgHeight = stripTopPadPx + blackoutBandPx + bodyPx + stripBottomPadPx;

    return { barRects, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx };
  }, [bars, layout, clipStart, clipEnd, prefs, riskByDate, blackouts]);

  /** Match heatmap column width exactly; labels may extend past this (SVG overflow visible). */
  const gridWidth = width;

  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;
  const labelCenterY = (b: (typeof barRects)[0]) => b.y + b.h / 2;
  const barAreaTop = prefs.stripTopPadPx + blackoutBandPx;
  const ribbonMidY = prefs.stripTopPadPx + blackoutBandPx / 2;

  return (
    <svg
      className="shrink-0 font-sans text-zinc-700 dark:text-zinc-300"
      width={gridWidth}
      height={svgHeight}
      viewBox={`0 0 ${gridWidth} ${svgHeight}`}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`Programme timeline for ${marketKey}`}
    >
      <defs>
        {/* 45° lines, 3px repeat (tile 3×3 in user space, line through centre, pattern rotated 45°). */}
        <pattern
          id={hatchId}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45 1.5 1.5)"
        >
          <line
            x1="1.5"
            y1="-0.5"
            x2="1.5"
            y2="3.5"
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={0.45}
            strokeOpacity={Math.min(0.28, 0.08 + prefs.overlayHatchOpacity * 0.22)}
          />
        </pattern>
        {/* Stronger 45° hatch for school columns drawn on top of programme bars. */}
        <pattern
          id={schoolHatchId}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45 1.5 1.5)"
        >
          <line
            x1="1.5"
            y1="-0.5"
            x2="1.5"
            y2="3.5"
            className="stroke-zinc-500 dark:stroke-zinc-400"
            strokeWidth={0.55}
            strokeOpacity={Math.min(0.58, 0.18 + prefs.overlayHatchOpacity * 0.55)}
          />
        </pattern>
        {/* Programme bars: same 45° logic as overlay; tile size = `barHatchSpacingPx`. */}
        <pattern
          id={barHatchId}
          width={barTile}
          height={barTile}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(45 ${barMid} ${barMid})`}
        >
          <line
            x1={barMid}
            y1={-0.5}
            x2={barMid}
            y2={barTile + 0.5}
            className="stroke-zinc-500 dark:stroke-zinc-400"
            strokeWidth={0.42}
            strokeOpacity={0.55}
          />
        </pattern>
      </defs>

      <rect
        x={gutter}
        y={0.5}
        width={Math.max(0, gridWidth - gutter)}
        height={svgHeight - 1}
        rx={0}
        className="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-950 dark:stroke-zinc-800"
        strokeWidth={1}
      />

      {/* Bar fills + outlines first so school holiday hatch can read on top of programme bars. */}
      <g>
        {barRects.map((b) => (
          <g key={b.key} opacity={b.opacity}>
            <title>{`${b.kind === 'campaign' ? 'Campaign' : 'Tech programme'}: ${b.name} (${b.startYmd}${b.startYmd === b.endYmdInclusive ? '' : `–${b.endYmdInclusive}`})`}</title>
            <rect x={b.x} y={b.y} width={Math.max(0, b.w)} height={b.h} rx={0} fill={b.fill} />
            {prefs.barHatchOpacity > 0.001 ? (
              <rect
                x={b.x}
                y={b.y}
                width={Math.max(0, b.w)}
                height={b.h}
                rx={0}
                fill={`url(#${barHatchId})`}
                fillOpacity={prefs.barHatchOpacity}
              />
            ) : null}
            <rect
              x={b.x}
              y={b.y}
              width={Math.max(0, b.w)}
              height={b.h}
              rx={0}
              fill="none"
              className="stroke-zinc-600 dark:stroke-zinc-400"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </g>

      {/* School hatch above bar bodies (was underneath and invisible). */}
      <g className="pointer-events-none">
        {schoolOverlaySpans.map((s) => {
          const schoolFillOp = Math.min(0.52, 0.12 + prefs.overlayHatchOpacity * 0.32);
          const schoolStrokeOp = Math.min(0.72, 0.28 + prefs.overlayHatchOpacity * 0.42);
          return (
            <g key={s.key}>
              <title>{`School holiday context: ${s.ymdStart}${s.ymdEnd !== s.ymdStart ? ` → ${s.ymdEnd}` : ''}`}</title>
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill={`url(#${schoolHatchId})`}
                fillOpacity={schoolFillOp}
              />
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill="none"
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeWidth={1}
                strokeOpacity={schoolStrokeOp}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </g>

      <g>
        {barRects.map((b) => (
          <text
            key={`${b.key}-caption`}
            opacity={b.opacity}
            x={b.x + b.w + LABEL_GAP_PX}
            y={labelCenterY(b)}
            dominantBaseline="middle"
            textAnchor="start"
            fill="currentColor"
            fontSize={LABEL_FONT_SIZE_PX}
            fontWeight={500}
            style={{ letterSpacing: '-0.01em' }}
          >
            <title>{`${b.kind === 'campaign' ? 'Campaign' : 'Tech programme'}: ${b.name} (${b.startYmd}${b.startYmd === b.endYmdInclusive ? '' : `–${b.endYmdInclusive}`})`}</title>
            {programmeBarTrailingLabel(b.name, b.startYmd, b.endYmdInclusive, prefs.showBarTrailingCaption)}
          </text>
        ))}
      </g>

      {/* School palm: top-left of each holiday column, above bar labels — never shares the ribbon row with blackout snowflake. */}
      <g className="pointer-events-none select-none">
        {schoolOverlaySpans.map((s) => {
          if (s.x1 - s.x0 < SCHOOL_STRIP_ICON_PX + 3) return null;
          return (
            <g
              key={`${s.key}-school-ico`}
              transform={`translate(${s.x0 + 2}, ${barAreaTop + 2})`}
              className="text-zinc-700 dark:text-zinc-300"
            >
              <title>{`School holiday: ${s.ymdStart}${s.ymdEnd !== s.ymdStart ? ` → ${s.ymdEnd}` : ''}`}</title>
              <svg width={SCHOOL_STRIP_ICON_PX} height={SCHOOL_STRIP_ICON_PX} viewBox="0 0 24 24" fill="none">
                {PALMTREE_PATH_DS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </g>
          );
        })}
      </g>

      {blackoutBandPx > 0 ? (
        <g className="pointer-events-none select-none">
          {blackoutSpans.map((s) => {
            const label = programmeBlackoutSpanLabel(blackouts, s.ymdStart, s.ymdEnd);
            const yamlEnv = deploymentBlackoutYamlEnvelopeForSpan(blackouts, s.ymdStart, s.ymdEnd);
            const yamlRange = yamlEnv
              ? formatDeploymentBlackoutIsoRange(yamlEnv.start, yamlEnv.end)
              : formatDeploymentBlackoutIsoRange(s.ymdStart, s.ymdEnd);
            const stripRange = formatDeploymentBlackoutIsoRange(s.ymdStart, s.ymdEnd);
            const viewNote =
              yamlEnv && (yamlEnv.start !== s.ymdStart || yamlEnv.end !== s.ymdEnd)
                ? ` In this strip: ${stripRange}.`
                : '';
            const pipe = 5;
            const spanW = s.x1 - s.x0;
            const showRibbonSnowflake = spanW >= RIBBON_BLACKOUT_ICON_PX + 2;
            const snowflakeTx = showRibbonSnowflake
              ? Math.min(
                  Math.max((s.x0 + s.x1) / 2 - RIBBON_BLACKOUT_ICON_HALF, s.x0 + 1),
                  s.x1 - 1 - RIBBON_BLACKOUT_ICON_PX,
                )
              : 0;
            return (
              <g key={`bl-${s.key}`}>
                <title>{`Deployment blackout: ${yamlRange}.${viewNote} ${label}`}</title>
                <line
                  x1={s.x0}
                  y1={ribbonMidY - pipe}
                  x2={s.x0}
                  y2={ribbonMidY + pipe}
                  className="stroke-zinc-600 dark:stroke-zinc-400"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={s.x1}
                  y1={ribbonMidY - pipe}
                  x2={s.x1}
                  y2={ribbonMidY + pipe}
                  className="stroke-zinc-600 dark:stroke-zinc-400"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={s.x0}
                  y1={ribbonMidY}
                  x2={s.x1}
                  y2={ribbonMidY}
                  className="stroke-zinc-500 dark:stroke-zinc-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={0.9}
                />
                <line
                  x1={s.x0}
                  y1={barAreaTop}
                  x2={s.x0}
                  y2={svgHeight - 2}
                  className="stroke-zinc-500 dark:stroke-zinc-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={0.85}
                />
                <line
                  x1={s.x1}
                  y1={barAreaTop}
                  x2={s.x1}
                  y2={svgHeight - 2}
                  className="stroke-zinc-500 dark:stroke-zinc-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={0.85}
                />
                {showRibbonSnowflake ? (
                  <g
                    transform={`translate(${snowflakeTx}, ${ribbonMidY - RIBBON_BLACKOUT_ICON_HALF})`}
                    className="text-zinc-700 dark:text-zinc-300"
                    aria-hidden
                  >
                    <svg
                      width={RIBBON_BLACKOUT_ICON_PX}
                      height={RIBBON_BLACKOUT_ICON_PX}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      {SNOWFLAKE_PATH_DS.map((d, i) => (
                        <path
                          key={i}
                          d={d}
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
