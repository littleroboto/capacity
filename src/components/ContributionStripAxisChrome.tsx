import {
  CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX,
  CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX,
} from '@/lib/runwayCompareSvgLayout';
import type {
  CompareSvgMonthLabel,
  CompareSvgWeekdayLabel,
  SvgAxisTick,
  SvgQuarterLabel,
  SvgYearLabel,
} from '@/lib/runwayCompareSvgLayout';

export type ContributionStripAxisChromeProps = {
  marketKey: string;
  showAxisLabels: boolean;
  width: number;
  height: number;
  weekdayLabels: CompareSvgWeekdayLabel[];
  axisTicks: SvgAxisTick[];
  monthLabels: CompareSvgMonthLabel[];
  quarterLabels: SvgQuarterLabel[];
  quarterRailBoundaryTicks: { x: number; y: number }[];
  yearLabels: SvgYearLabel[];
};

/** Week/month/quarter/year chrome for the horizontal contribution strip (no day cells). */
export function ContributionStripAxisChrome({
  marketKey,
  showAxisLabels,
  width,
  height,
  weekdayLabels,
  axisTicks,
  monthLabels,
  quarterLabels,
  quarterRailBoundaryTicks,
  yearLabels,
}: ContributionStripAxisChromeProps) {
  return (
    <>
      <rect width={width} height={height} className="fill-transparent" aria-hidden />
      {showAxisLabels ? (
        <>
          <g className="pointer-events-none select-none fill-muted-foreground" aria-hidden>
            {weekdayLabels.map((wd, wi) => (
              <text
                key={`${marketKey}-wd-${wi}-${wd.abbr}`}
                x={wd.x}
                y={wd.y}
                textAnchor="middle"
                style={{ fontSize: 9, fontWeight: 600, letterSpacing: '-0.02em' }}
              >
                <title>{wd.title}</title>
                {wd.abbr}
              </text>
            ))}
          </g>
          <g className="pointer-events-none select-none" aria-hidden>
            {axisTicks.map((tk, ti) => (
              <line
                key={`${marketKey}-axtk-${ti}-${tk.x}`}
                x1={tk.x}
                x2={tk.x}
                y1={tk.y1}
                y2={tk.y2}
                className="stroke-muted-foreground/75"
                strokeWidth={tk.strokeWidth ?? 1.25}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <g className="pointer-events-none select-none fill-foreground" aria-hidden>
            {monthLabels.map((lb, li) => (
              <text
                key={`${marketKey}-ml-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[11px] font-semibold capitalize tracking-tighter"
                style={{ fontSize: 11 }}
              >
                {lb.text}
              </text>
            ))}
          </g>
          <g className="pointer-events-none select-none" aria-hidden>
            {quarterLabels.map((lb, li) => {
              if (lb.railLeft == null || lb.railRight == null) return null;
              const halo = CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX;
              const y = lb.y;
              const leftEnd = lb.x - halo;
              const rightStart = lb.x + halo;
              const leftStart = lb.railLeft;
              const rightEnd = lb.railRight;
              const showLeft = leftEnd - leftStart >= 3;
              const showRight = rightEnd - rightStart >= 3;
              if (!showLeft && !showRight) return null;
              return (
                <g key={`${marketKey}-qrail-${li}-${lb.text}`}>
                  {showLeft ? (
                    <line
                      x1={leftStart}
                      x2={leftEnd}
                      y1={y}
                      y2={y}
                      className="stroke-muted-foreground/50"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {showRight ? (
                    <line
                      x1={rightStart}
                      x2={rightEnd}
                      y1={y}
                      y2={y}
                      className="stroke-muted-foreground/50"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
          <g className="pointer-events-none select-none fill-foreground/90" aria-hidden>
            {quarterLabels.map((lb, li) => (
              <text
                key={`${marketKey}-ql-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-semibold tracking-tight tabular-nums"
                style={{ fontSize: 10 }}
              >
                <title>{lb.title}</title>
                {lb.text}
              </text>
            ))}
          </g>
          <g className="pointer-events-none select-none" aria-hidden>
            {quarterRailBoundaryTicks.map((tk, ti) => {
              const h = CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX;
              return (
                <line
                  key={`${marketKey}-qbnd-${ti}-${tk.x}`}
                  x1={tk.x}
                  x2={tk.x}
                  y1={tk.y - h}
                  y2={tk.y + h}
                  className="stroke-muted-foreground/60"
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
          <g className="pointer-events-none select-none fill-foreground/90" aria-hidden>
            {yearLabels.map((lb, li) => (
              <text
                key={`${marketKey}-yl-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-semibold tracking-tight tabular-nums"
                style={{ fontSize: 10 }}
              >
                {lb.text}
              </text>
            ))}
          </g>
        </>
      ) : null}
    </>
  );
}
