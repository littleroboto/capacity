import type { ViewModeId } from '@/lib/constants';
import { heatmapColorContinuous, STRESS_BELOW_CUTOFF_FILL } from '@/lib/riskHeatmapColors';

/** Match `HeatCell` non-motion box rounding. */
const LEGEND_CELL_ROUNDED = 'rounded-[3px]';

function LegendSquare({
  color,
  title,
  cellSizePx,
}: {
  color: string;
  title?: string;
  cellSizePx: number;
}) {
  return (
    <div
      className={`shrink-0 cursor-default ${LEGEND_CELL_ROUNDED}`}
      style={{ width: cellSizePx, height: cellSizePx, backgroundColor: color }}
      title={title}
    />
  );
}

function LegendRow({
  color,
  label,
  cellSizePx,
  cellGapPx,
}: {
  color: string;
  label: string;
  cellSizePx: number;
  cellGapPx: number;
}) {
  return (
    <div className="flex shrink-0 items-center" style={{ gap: cellGapPx }}>
      <LegendSquare color={color} title={label} cellSizePx={cellSizePx} />
      <span className="max-w-[12rem] text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

export type HeatmapLegendProps = {
  viewMode: ViewModeId;
  stressCutoff?: number;
  /** Same as heatmap `CELL_PX`. */
  cellSizePx: number;
  /** Same as `RUNWAY_CELL_GAP_PX` between heat cells. */
  cellGapPx: number;
  className?: string;
};

export function HeatmapLegend({
  viewMode,
  stressCutoff = 0,
  cellSizePx,
  cellGapPx,
  className,
}: HeatmapLegendProps) {
  const stackStyle = { gap: cellGapPx } as const;

  /** Top = high (red); bottom = low (green). Same stepped preview as the continuous cell ramp for both lenses. */
  const legendSteps = 22;
  const gradientTopToBottom = Array.from({ length: legendSteps }, (_, i) =>
    heatmapColorContinuous(1 - i / (legendSteps - 1))
  );

  return (
    <div className={className} data-view-mode={viewMode}>
      <div className="flex flex-col" style={stackStyle}>
        {stressCutoff > 0 ? (
          <LegendRow
            color={STRESS_BELOW_CUTOFF_FILL}
            label={`Below cutoff (< ${Math.round(stressCutoff * 100)}%)`}
            cellSizePx={cellSizePx}
            cellGapPx={cellGapPx}
          />
        ) : null}

        <div
          className="flex shrink-0 flex-col items-start"
          style={stackStyle}
          role="img"
          aria-label="Colour scale from high to low"
        >
          <span className="w-full text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            High
          </span>
          <div className="flex flex-col" style={{ width: cellSizePx, ...stackStyle }}>
            {gradientTopToBottom.map((c, i) => (
              <LegendSquare key={i} color={c} cellSizePx={cellSizePx} />
            ))}
          </div>
          <span className="w-full text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Low
          </span>
        </div>
      </div>
    </div>
  );
}
