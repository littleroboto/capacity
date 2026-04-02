import type { ViewModeId } from '@/lib/constants';
import {
  HEATMAP_TEMPERATURE_STEP_COUNT,
  heatmapLegendSwatchAtBand,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';
import { cn } from '@/lib/utils';

/** Match `HeatCell` non-motion box rounding. */
const LEGEND_CELL_ROUNDED = 'rounded-[3px]';

function LegendSquare({ color, cellSizePx }: { color: string; cellSizePx: number }) {
  return (
    <div
      className={`shrink-0 cursor-default ${LEGEND_CELL_ROUNDED}`}
      style={{ width: cellSizePx, height: cellSizePx, backgroundColor: color }}
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
  /** Swatches use the same band colours / mono-alpha steps as the runway when set. */
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
  const legendSteps = HEATMAP_TEMPERATURE_STEP_COUNT;
  const monoLegend = heatmapOpts?.renderStyle === 'mono';

  const swatchesHighToLow = Array.from({ length: legendSteps }, (_, i) => {
    const bandFromLow = legendSteps - 1 - i;
    const color = heatmapOpts
      ? heatmapLegendSwatchAtBand(bandFromLow, heatmapOpts)
      : heatmapLegendSwatchAtBand(bandFromLow);
    return { color, bandFromLow };
  });

  const techHeadroom = viewMode === 'combined';
  const topLabel = techHeadroom ? 'Tight' : 'High';
  const bottomLabel = techHeadroom ? 'Room' : 'Low';
  const ariaLabel = monoLegend
    ? techHeadroom
      ? `Heat map legend: tighter capacity at top, more headroom at bottom, ${legendSteps} opacity steps (single colour).`
      : `Heat map legend: higher pressure at top, lower at bottom, ${legendSteps} opacity steps (single colour).`
    : techHeadroom
      ? `Heat map legend: tighter capacity at top, more headroom at bottom, ${legendSteps} colour steps.`
      : `Heat map legend: higher pressure at top, lower at bottom, ${legendSteps} colour steps from cool to warm.`;

  return (
    <div
      className={cn('flex w-fit max-w-full min-w-0 flex-col items-start', className)}
      data-view-mode={viewMode}
    >
      <div
        className="flex shrink-0 flex-col items-start"
        style={stackStyle}
        role="img"
        aria-label={ariaLabel}
      >
        <span className="text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {topLabel}
        </span>
        <div className="flex flex-col" style={{ width: cellSizePx, ...stackStyle }}>
          {swatchesHighToLow.map(({ color, bandFromLow }, i) => (
            <LegendSquare key={`${bandFromLow}-${i}`} color={color} cellSizePx={cellSizePx} />
          ))}
        </div>
        <span className="text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {bottomLabel}
        </span>
      </div>
    </div>
  );
}
