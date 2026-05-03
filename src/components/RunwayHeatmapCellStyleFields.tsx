import { Label } from '@/components/ui/label';
import {
  RUNWAY_HEATMAP_CELL_PX_MAX,
  RUNWAY_HEATMAP_CELL_PX_MIN,
  RUNWAY_HEATMAP_CELL_PX_STEP,
  RUNWAY_HEATMAP_CELL_GAP_MAX,
  RUNWAY_HEATMAP_CELL_GAP_MIN,
  RUNWAY_HEATMAP_CELL_RADIUS_MAX,
  RUNWAY_HEATMAP_LAYOUT_DEFAULTS,
  snapRunwayHeatmapCellPx,
} from '@/lib/runwayHeatmapLayoutPrefs';
import { useAtcStore } from '@/store/useAtcStore';

/** Runway heatmap cell geometry + tech sparkline smoothing (workbench Settings). */
export function RunwayHeatmapCellStyleFields() {
  const cellPx = useAtcStore((s) => s.runwayHeatmapCellPx);
  const setCellPx = useAtcStore((s) => s.setRunwayHeatmapCellPx);
  const gapPx = useAtcStore((s) => s.runwayHeatmapCellGapPx);
  const setGapPx = useAtcStore((s) => s.setRunwayHeatmapCellGapPx);
  const radiusPx = useAtcStore((s) => s.runwayHeatmapCellRadiusPx);
  const setRadiusPx = useAtcStore((s) => s.setRunwayHeatmapCellRadiusPx);
  const runwayTechSparklineUtilSmoothWindow = useAtcStore((s) => s.runwayTechSparklineUtilSmoothWindow);
  const setRunwayTechSparklineUtilSmoothWindow = useAtcStore((s) => s.setRunwayTechSparklineUtilSmoothWindow);

  const resetGeometry = () => {
    setCellPx(RUNWAY_HEATMAP_LAYOUT_DEFAULTS.cellPx);
    setGapPx(RUNWAY_HEATMAP_LAYOUT_DEFAULTS.gapPx);
    setRadiusPx(RUNWAY_HEATMAP_LAYOUT_DEFAULTS.radiusPx);
  };

  const isGeometryDefault =
    snapRunwayHeatmapCellPx(cellPx) === snapRunwayHeatmapCellPx(RUNWAY_HEATMAP_LAYOUT_DEFAULTS.cellPx) &&
    gapPx === RUNWAY_HEATMAP_LAYOUT_DEFAULTS.gapPx &&
    radiusPx === RUNWAY_HEATMAP_LAYOUT_DEFAULTS.radiusPx;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Runway cells</h3>
        <button
          type="button"
          disabled={isGeometryDefault}
          onClick={resetGeometry}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Reset cell style
        </button>
      </div>
      <div className="flex flex-col gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Size ({snapRunwayHeatmapCellPx(cellPx)}px)</span>
          <input
            type="range"
            min={RUNWAY_HEATMAP_CELL_PX_MIN}
            max={RUNWAY_HEATMAP_CELL_PX_MAX}
            step={RUNWAY_HEATMAP_CELL_PX_STEP}
            value={snapRunwayHeatmapCellPx(cellPx)}
            onChange={(e) => setCellPx(snapRunwayHeatmapCellPx(Number(e.target.value)))}
            className="w-full accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Spacing ({gapPx}px gap)</span>
          <input
            type="range"
            min={RUNWAY_HEATMAP_CELL_GAP_MIN}
            max={RUNWAY_HEATMAP_CELL_GAP_MAX}
            step={1}
            value={gapPx}
            onChange={(e) =>
              setGapPx(Math.min(RUNWAY_HEATMAP_CELL_GAP_MAX, Math.max(RUNWAY_HEATMAP_CELL_GAP_MIN, Math.round(Number(e.target.value)))))
            }
            className="w-full accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Corner radius ({radiusPx}px)</span>
          <input
            type="range"
            min={0}
            max={RUNWAY_HEATMAP_CELL_RADIUS_MAX}
            step={1}
            value={radiusPx}
            onChange={(e) =>
              setRadiusPx(
                Math.min(RUNWAY_HEATMAP_CELL_RADIUS_MAX, Math.max(0, Math.round(Number(e.target.value))))
              )
            }
            className="w-full accent-primary"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
        <Label htmlFor="wb-tech-sparkline-smooth" className="text-sm font-medium text-foreground">
          Tech sparkline smoothing
        </Label>
        <select
          id="wb-tech-sparkline-smooth"
          className="h-9 w-full max-w-md rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={runwayTechSparklineUtilSmoothWindow}
          onChange={(e) => setRunwayTechSparklineUtilSmoothWindow(Number(e.target.value))}
        >
          <option value={0}>Off — raw daily utilization</option>
          <option value={3}>3-day window (subtle)</option>
          <option value={5}>5-day window (balanced)</option>
          <option value={7}>7-day window (smoother)</option>
          <option value={9}>9-day window (strongest)</option>
        </select>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Applies to the technology capacity sparkline (workbench strip and programme plan). Optional restaurant /
          deployment traces on the programme chart use the same window. Homepage preview still uses a light default
          when this is Off.
        </p>
      </div>
    </div>
  );
}
