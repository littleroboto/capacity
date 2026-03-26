import type { ViewModeId } from '@/lib/constants';
import {
  heatmapColorDiscrete,
  heatmapColorForViewMode,
  HEATMAP_TEMPERATURE_BAND_LABELS,
  HEATMAP_TEMPERATURE_STEP_COUNT,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';

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

export type HeatmapLegendProps = {
  viewMode: ViewModeId;
  /** Same as heatmap `CELL_PX`. */
  cellSizePx: number;
  /** Same as `RUNWAY_CELL_GAP_PX` between heat cells. */
  cellGapPx: number;
  className?: string;
  /** With `heatmapOpts`, ramp matches runway cells (γ / curve, same as grid). */
  heatmapOpts?: HeatmapColorOpts;
};

export function HeatmapLegend({
  viewMode,
  cellSizePx,
  cellGapPx,
  className,
  heatmapOpts,
}: HeatmapLegendProps) {
  const stackStyle = { gap: cellGapPx } as const;

  /** One swatch per temperature band (hot at top); sample band centre so colour matches grid cells. */
  const legendSteps = HEATMAP_TEMPERATURE_STEP_COUNT;
  const monoLegend = heatmapOpts?.renderStyle === 'mono';

  const gradientTopToBottom = Array.from({ length: legendSteps }, (_, i) => {
    const bandFromLow = legendSteps - 1 - i;
    const metric01 = (bandFromLow + 0.5) / legendSteps;
    const color = heatmapOpts
      ? heatmapColorForViewMode(viewMode, metric01, heatmapOpts)
      : heatmapColorDiscrete(metric01);
    return {
      color,
      title: HEATMAP_TEMPERATURE_BAND_LABELS[bandFromLow]!,
    };
  });

  return (
    <div className={className} data-view-mode={viewMode}>
      <div className="flex flex-col" style={stackStyle}>
        <div
          className="flex shrink-0 flex-col items-start"
          style={stackStyle}
          role="img"
          aria-label={monoLegend ? 'Opacity scale from high to low (single colour)' : 'Colour scale from high to low'}
        >
          <span className="w-full text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            High
          </span>
          <div className="flex flex-col" style={{ width: cellSizePx, ...stackStyle }}>
            {gradientTopToBottom.map((row, i) => (
              <LegendSquare key={i} color={row.color} title={row.title} cellSizePx={cellSizePx} />
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
