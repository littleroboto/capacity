import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { CalendarRange, Minus, Plus, RotateCcw, Settings2, StretchHorizontal } from 'lucide-react';
import type { DeploymentRiskBlackout, MarketConfig } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import {
  RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_PX,
  RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_TOP_OFFSET_PX,
  runwayTechSparklineStackHeightForChartSvgPx,
} from '@/lib/calendarQuarterLayout';
import { cn } from '@/lib/utils';
import type { GanttLensOverlaySourcePack } from '@/lib/runwayGanttLensOverlaySeries';
import { collectProgrammeGanttChronicleLanes } from '@/lib/runwayProgrammeGanttModel';
import { applyLedgerExclusionsToMarketConfig } from '@/lib/marketConfigLedgerExclusions';
import type { MarketActivityLedger } from '@/lib/marketActivityLedger';
import {
  loadProgrammeGanttOpen,
  loadProgrammeGanttPrefs,
  notifyProgrammeGanttPrefsChanged,
  PROGRAMME_GANTT_PREFS_CHANGED_EVENT,
  RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS,
  saveProgrammeGanttOpen,
  saveProgrammeGanttPrefs,
  type ProgrammeGanttDisplayPrefs,
} from '@/lib/runwayProgrammeGanttPrefs';
import { requestOpenWorkbenchSettingsDialog } from '@/lib/sharedDslSync';
import { ProgrammePlanDisplaySettingsForm } from '@/components/ProgrammePlanDisplaySettingsForm';
import { Button } from '@/components/ui/button';
import { useAtcStore } from '@/store/useAtcStore';
import {
  RunwayTechCapacityDemandSparkline,
  type RunwayTechCapacityDemandSparklineProps,
} from '@/components/RunwayTechCapacityDemandSparkline';
import { RunwayProgrammeGanttStrip, runwayProgrammeGanttStripHeightPx } from '@/components/RunwayProgrammeGanttStrip';
import { nextProgrammeGanttDisclosureTier, type ProgrammeGanttDisclosureTier } from '@/lib/runwayProgrammeGanttDisclosure';
import {
  programmePlanVisibleYmdRangeFromViewport,
  type ProgrammePlanVisibleYmdRange,
} from '@/lib/runwayProgrammePlanViewportRange';

const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MOTION_EASE_IN = [0.32, 0, 0.67, 1] as const;
/** Space below the zoom toolbar before the chart (`pt-3`); keep in sync with `minHeight` offset. */
const PROGRAMME_GANTT_VIEWPORT_CHART_SAFE_TOP_PX = 12;

/** Open: spring on vertical motion + eased opacity; close: smooth ease-in shrink. */
const programmePlanPanelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
    transition: {
      opacity: { duration: 0.22, ease: MOTION_EASE_IN },
      y: { duration: 0.26, ease: MOTION_EASE_IN },
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      opacity: { duration: 0.5, ease: MOTION_EASE_OUT },
      y: { type: 'spring', stiffness: 380, damping: 28, mass: 0.82 },
    },
  },
};

const programmePlanPanelVariantsReduced: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.06 } },
  visible: { opacity: 1, transition: { duration: 0.1 } },
};

/** Props for {@link RunwayTechCapacityDemandSparkline} except layout inputs owned by the programme block. */
export type ProgrammeGanttTechDemandSparklineConfig = Omit<
  RunwayTechCapacityDemandSparklineProps,
  'contributionMeta' | 'cellPx' | 'gap' | 'riskByDate' | 'width' | 'ganttLensOverlays'
> & {
  /** Optional trading/risk heatmap opts for programme-chart overlays (merged with display prefs in this block). */
  ganttLensOverlaySource?: GanttLensOverlaySourcePack;
};

export type { GanttLensOverlaySourcePack };

type Props = {
  country: string;
  marketConfig: MarketConfig | undefined;
  placedCells: readonly PlacedRunwayCell[];
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  stripWidth: number;
  riskByDate: ReadonlyMap<string, RiskRow>;
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined;
  activityLedger?: MarketActivityLedger | null;
  ledgerExcludedEntryIds?: readonly string[];
  animateInKey?: string | number;
  railSpacerWidthPx: number;
  className?: string;
  /**
   * When true, skip localStorage for open state and display prefs (e.g. homepage hero)
   * so the workbench is not overwritten.
   */
  ephemeral?: boolean;
  /** With `ephemeral`, open the plan once this becomes true (e.g. section / toolbar in view). */
  revealPlanWhen?: boolean;
  /** Milliseconds after `revealPlanWhen` before opening; ignored when reduced motion (opens immediately). */
  revealPlanDelayMs?: number;
  /** Merged into defaults when `ephemeral` (e.g. homepage hero programme styling). */
  ephemeralInitialPrefs?: Partial<ProgrammeGanttDisplayPrefs>;
  /**
   * When the plan panel is open, reports the ISO date span visible in the zoomed/panned Gantt
   * so runway heatmaps can emphasise the same window.
   */
  onPlanVisibleYmdRangeChange?: (range: ProgrammePlanVisibleYmdRange | null) => void;
  /**
   * Workbench: daily tech load strip aligned under the programme Gantt (same `stripWidth` / cell grid).
   * When the plan is open it shares pan/zoom; when closed it still renders below the header at 1:1 scale.
   */
  techDemandSparkline?: ProgrammeGanttTechDemandSparklineConfig | null;
  /** Landing: same organic tick as contribution heatmaps so Gantt segments build in sync. */
  landingHeatmapOrganicSyncTick?: number;
  /** Hash key for organic reveal; match combined heatmap strips (e.g. `${country}-combined`). */
  landingOrganicSyncMarketKey?: string;
};

export function RunwayProgrammeGanttBlock({
  country,
  marketConfig,
  placedCells,
  contributionMeta,
  cellPx,
  gap,
  stripWidth,
  riskByDate,
  blackouts,
  activityLedger,
  ledgerExcludedEntryIds = [],
  animateInKey,
  railSpacerWidthPx,
  className,
  ephemeral = false,
  revealPlanWhen = false,
  revealPlanDelayMs = 900,
  ephemeralInitialPrefs,
  onPlanVisibleYmdRangeChange,
  techDemandSparkline = null,
  landingHeatmapOrganicSyncTick,
  landingOrganicSyncMarketKey,
}: Props) {
  const reduceMotion = useReducedMotion();
  const programmePlanPanelId = useId().replace(/:/g, '');
  const [open, setOpen] = useState(() => (ephemeral ? false : loadProgrammeGanttOpen()));
  const [prefs, setPrefs] = useState<ProgrammeGanttDisplayPrefs>(() =>
    ephemeral
      ? { ...RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS, ...ephemeralInitialPrefs }
      : loadProgrammeGanttPrefs()
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);
  const programmePrefsNotifySkipRef = useRef(true);
  const ephemeralRevealStartedRef = useRef(false);
  const runwayTechSparklineUtilSmoothWindow = useAtcStore((s) => s.runwayTechSparklineUtilSmoothWindow);
  const setRunwayTechSparklineUtilSmoothWindow = useAtcStore((s) => s.setRunwayTechSparklineUtilSmoothWindow);
  const ganttViewportRef = useRef<HTMLDivElement | null>(null);
  const [ganttViewportWidth, setGanttViewportWidth] = useState(0);
  const [panX, setPanX] = useState(0);
  const [disclosureTier, setDisclosureTier] = useState<ProgrammeGanttDisclosureTier>(3);
  const panDragRef = useRef<{ startClientX: number; startPan: number; pointerId: number } | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const timelineZoomRef = useRef(prefs.timelineZoom);
  timelineZoomRef.current = prefs.timelineZoom;

  useEffect(() => {
    if (ephemeral) return;
    saveProgrammeGanttOpen(open);
  }, [ephemeral, open]);

  useEffect(() => {
    if (ephemeral) return;
    saveProgrammeGanttPrefs(prefs);
    if (programmePrefsNotifySkipRef.current) {
      programmePrefsNotifySkipRef.current = false;
      return;
    }
    notifyProgrammeGanttPrefsChanged();
  }, [ephemeral, prefs]);

  useEffect(() => {
    if (ephemeral) return;
    const onExternal = () => setPrefs(loadProgrammeGanttPrefs());
    window.addEventListener(PROGRAMME_GANTT_PREFS_CHANGED_EVENT, onExternal);
    return () => window.removeEventListener(PROGRAMME_GANTT_PREFS_CHANGED_EVENT, onExternal);
  }, [ephemeral]);

  useEffect(() => {
    if (!ephemeral || !revealPlanWhen || ephemeralRevealStartedRef.current) return;
    ephemeralRevealStartedRef.current = true;
    if (reduceMotion) {
      setOpen(true);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), revealPlanDelayMs);
    return () => window.clearTimeout(t);
  }, [ephemeral, revealPlanWhen, reduceMotion, revealPlanDelayMs]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = settingsWrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setSettingsOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  const setPref = useCallback(<K extends keyof ProgrammeGanttDisplayPrefs>(key: K, value: ProgrammeGanttDisplayPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs({ ...RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS });
  }, []);

  const ganttSourceConfig = useMemo(() => {
    if (!marketConfig) return undefined;
    if (!activityLedger || ledgerExcludedEntryIds.length === 0) return marketConfig;
    return applyLedgerExclusionsToMarketConfig(marketConfig, activityLedger, new Set(ledgerExcludedEntryIds));
  }, [marketConfig, activityLedger, ledgerExcludedEntryIds]);

  const lanes = collectProgrammeGanttChronicleLanes(ganttSourceConfig);

  const timelineZoom = prefs.timelineZoom;
  const effectiveCellPx = cellPx * timelineZoom;

  useLayoutEffect(() => {
    setDisclosureTier((prev) => nextProgrammeGanttDisclosureTier(prev, effectiveCellPx));
  }, [effectiveCellPx]);

  useEffect(() => {
    const el = ganttViewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setGanttViewportWidth(el.clientWidth);
    });
    ro.observe(el);
    setGanttViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);

  const clampPan = useCallback(
    (nextPan: number, zoom: number, vw: number) => {
      const scaledW = stripWidth * zoom;
      const minPan = Math.min(0, vw - scaledW);
      return Math.min(0, Math.max(minPan, nextPan));
    },
    [stripWidth],
  );

  useLayoutEffect(() => {
    if (!open || ganttViewportWidth <= 0) return;
    setPanX((p) => clampPan(p, timelineZoom, ganttViewportWidth));
  }, [open, ganttViewportWidth, timelineZoom, stripWidth, clampPan]);

  useLayoutEffect(() => {
    if (!onPlanVisibleYmdRangeChange) return;
    if (!open) {
      onPlanVisibleYmdRangeChange(null);
      return;
    }
    if (ganttViewportWidth <= 0) {
      onPlanVisibleYmdRangeChange(null);
      return;
    }
    onPlanVisibleYmdRangeChange(
      programmePlanVisibleYmdRangeFromViewport({
        viewportWidthPx: ganttViewportWidth,
        panXPx: panX,
        timelineZoom,
        stripWidthPx: stripWidth,
        placedCells,
        cellPx,
      }),
    );
  }, [
    onPlanVisibleYmdRangeChange,
    open,
    ganttViewportWidth,
    panX,
    timelineZoom,
    stripWidth,
    placedCells,
    cellPx,
  ]);

  useEffect(() => {
    if (!open) return;
    const el = ganttViewportRef.current;
    if (!el) return;

    const flushZoom = () => {
      zoomRafRef.current = null;
      const z = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (z == null) return;
      setPrefs((p) => ({ ...p, timelineZoom: z }));
    };

    const onWheel = (e: WheelEvent) => {
      const zoomGesture = e.ctrlKey || e.metaKey;
      if (zoomGesture) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0018);
        const cur = pendingZoomRef.current ?? timelineZoomRef.current;
        const next = Math.min(3.5, Math.max(0.35, cur * factor));
        pendingZoomRef.current = next;
        if (zoomRafRef.current == null) {
          zoomRafRef.current = window.requestAnimationFrame(flushZoom);
        }
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        setPanX((p) => clampPan(p - e.deltaY, timelineZoomRef.current, el.clientWidth));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (zoomRafRef.current != null) {
        window.cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = null;
      }
      pendingZoomRef.current = null;
    };
  }, [open, clampPan]);

  const setTimelineZoom = useCallback((z: number) => {
    const clamped = Math.min(3.5, Math.max(0.35, z));
    setPrefs((p) => ({ ...p, timelineZoom: clamped }));
  }, []);

  const zoomBy = useCallback(
    (mult: number) => {
      setTimelineZoom(timelineZoom * mult);
    },
    [setTimelineZoom, timelineZoom],
  );

  const resetZoomAndPan = useCallback(() => {
    setPrefs((p) => ({ ...p, timelineZoom: 1 }));
    setPanX(0);
  }, []);

  const fitTimelineToViewport = useCallback(() => {
    const vw = ganttViewportRef.current?.clientWidth ?? ganttViewportWidth;
    if (vw <= 0) return;
    const zRaw = vw / stripWidth;
    const z = Math.min(3.5, Math.max(0.35, Math.min(1, zRaw)));
    setPrefs((p) => ({ ...p, timelineZoom: z }));
    setPanX(0);
  }, [ganttViewportWidth, stripWidth]);

  const onGanttPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      panDragRef.current = { startClientX: e.clientX, startPan: panX, pointerId: e.pointerId };
    },
    [panX],
  );

  const onGanttPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = panDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const vw = ganttViewportRef.current?.clientWidth ?? ganttViewportWidth;
      const dx = e.clientX - drag.startClientX;
      setPanX(clampPan(drag.startPan + dx, timelineZoom, vw));
    },
    [clampPan, ganttViewportWidth, timelineZoom],
  );

  const endPanDrag = useCallback((e: React.PointerEvent) => {
    const drag = panDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    panDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const stripHeightPx = runwayProgrammeGanttStripHeightPx(prefs, lanes.length);
  const sparklineStackPx = techDemandSparkline
    ? runwayTechSparklineStackHeightForChartSvgPx(
        RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_PX,
        RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_TOP_OFFSET_PX,
      )
    : 0;
  const ganttPlusSparklineHeightPx = stripHeightPx + sparklineStackPx;

  function renderTechDemandSparkline() {
    if (techDemandSparkline == null) return null;
    const { ganttLensOverlaySource, ...sparkRest } = techDemandSparkline;
    const ganttLensOverlays =
      ganttLensOverlaySource != null
        ? {
            unifiedThreeLine: prefs.showGanttUnifiedThreeLineSparkline,
            heatmapOptsTrading: ganttLensOverlaySource.heatmapOptsTrading,
            heatmapOptsRisk: ganttLensOverlaySource.heatmapOptsRisk,
            organicLayerMarketKeyTrading: ganttLensOverlaySource.organicLayerMarketKeyTrading,
            organicLayerMarketKeyRisk: ganttLensOverlaySource.organicLayerMarketKeyRisk,
          }
        : undefined;
    return (
      <RunwayTechCapacityDemandSparkline
        contributionMeta={contributionMeta}
        cellPx={cellPx}
        gap={gap}
        riskByDate={riskByDate as Map<string, RiskRow>}
        width={stripWidth}
        chartSvgHeightPx={RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_PX}
        chartContentMarginTopPx={RUNWAY_PROGRAMME_GANTT_SPARKLINE_CHART_TOP_OFFSET_PX}
        {...sparkRest}
        ganttLensOverlays={ganttLensOverlays}
        className="min-w-0"
      />
    );
  }

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="shrink-0" style={{ width: railSpacerWidthPx }} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
              open
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border/60 bg-background/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
            aria-expanded={open}
            aria-controls={open ? programmePlanPanelId : undefined}
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            {open ? 'Hide plan' : 'Show plan'}
          </button>
          {open ? (
            <div className="relative" ref={settingsWrapRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground"
                aria-expanded={settingsOpen}
                aria-label="Timeline display settings"
                title="Display settings"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </button>
              {settingsOpen ? (
                <div
                  className="absolute right-0 z-50 mt-1 w-[min(100vw-2rem,18rem)] rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-900 shadow-xl opacity-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  role="dialog"
                  aria-label="Programme plan display settings"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Display</span>
                    <button
                      type="button"
                      className="text-[10px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                      onClick={resetPrefs}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="max-h-[min(70vh,26rem)] space-y-3 overflow-y-auto pr-0.5">
                    <ProgrammePlanDisplaySettingsForm prefs={prefs} setPref={setPref} />
                    <div className="border-t border-zinc-200/80 pt-3 dark:border-zinc-700/80">
                      <label className="flex flex-col gap-1 text-[11px] text-zinc-800 dark:text-zinc-200">
                        <span className="text-zinc-600 dark:text-zinc-400">Tech sparkline smoothing</span>
                        <select
                          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          value={runwayTechSparklineUtilSmoothWindow}
                          onChange={(e) => setRunwayTechSparklineUtilSmoothWindow(Number(e.target.value))}
                        >
                          <option value={0}>Off</option>
                          <option value={3}>3-day</option>
                          <option value={5}>5-day</option>
                          <option value={7}>7-day</option>
                          <option value={9}>9-day</option>
                        </select>
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 w-full text-xs"
                      onClick={() => {
                        setSettingsOpen(false);
                        requestOpenWorkbenchSettingsDialog();
                      }}
                    >
                      All workbench settings…
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={programmePlanPanelId}
            key="programme-gantt-strip"
            role="region"
            aria-label="Programme plan"
            className="flex min-w-0 flex-col gap-1.5"
            variants={reduceMotion ? programmePlanPanelVariantsReduced : programmePlanPanelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <div className="flex min-w-0 flex-row items-start gap-1.5">
              <div className="shrink-0" style={{ width: railSpacerWidthPx }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden rounded-md border border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                <div
                  className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-zinc-200/70 bg-white px-3 py-2 text-[10px] text-muted-foreground dark:border-zinc-700/80 dark:bg-zinc-950"
                  role="toolbar"
                  aria-label="Programme timeline zoom"
                >
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted/50"
                    aria-label="Zoom out timeline"
                    title="Zoom out"
                    onClick={() => zoomBy(1 / 1.18)}
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="min-w-[2.75rem] tabular-nums text-[11px] font-medium text-foreground">
                    {Math.round(timelineZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted/50"
                    aria-label="Zoom in timeline"
                    title="Zoom in"
                    onClick={() => zoomBy(1.18)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-foreground transition-colors hover:bg-muted/50"
                    aria-label="Fit timeline to window width"
                    title="Fit width"
                    onClick={fitTimelineToViewport}
                  >
                    <StretchHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Fit</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted/50"
                    aria-label="Reset zoom and pan"
                    title="Reset zoom and pan"
                    onClick={resetZoomAndPan}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="min-w-0 text-[10px] leading-snug text-muted-foreground">
                    Slide-friendly: drag the corner to widen the window.{' '}
                    <kbd className="rounded border border-border/60 bg-muted/40 px-0.5 font-mono text-[9px]">⌃</kbd> or{' '}
                    <kbd className="rounded border border-border/60 bg-muted/40 px-0.5 font-mono text-[9px]">⌘</kbd> +
                    scroll zooms; shift-scroll or middle-drag pans.
                  </span>
                </div>
                <div
                  ref={ganttViewportRef}
                  className="max-w-full overflow-hidden bg-white px-3 pb-4 pt-3 dark:bg-zinc-950 resize-x"
                  style={{
                    width: '100%',
                    minWidth: 'min(100%, 460px)',
                    minHeight: Math.max(
                      40,
                      Math.ceil(ganttPlusSparklineHeightPx * timelineZoom) +
                        PROGRAMME_GANTT_VIEWPORT_CHART_SAFE_TOP_PX,
                    ),
                  }}
                  onPointerDown={onGanttPointerDown}
                  onPointerMove={onGanttPointerMove}
                  onPointerUp={endPanDrag}
                  onPointerCancel={endPanDrag}
                >
                  <div
                    className="flex origin-top-left flex-col items-stretch"
                    style={{
                      width: stripWidth,
                      transform: `translate3d(${panX}px,0,0) scale(${timelineZoom})`,
                      willChange: 'transform',
                    }}
                  >
                    <RunwayProgrammeGanttStrip
                      marketKey={`${country}-programme`}
                      placedCells={placedCells}
                      contributionMeta={contributionMeta}
                      cellPx={cellPx}
                      gap={gap}
                      width={stripWidth}
                      riskByDate={riskByDate}
                      lanes={lanes}
                      blackouts={blackouts}
                      prefs={prefs}
                      animateInKey={animateInKey}
                      disclosureTier={disclosureTier}
                      landingHeatmapOrganicSyncTick={landingHeatmapOrganicSyncTick}
                      landingOrganicSyncMarketKey={landingOrganicSyncMarketKey}
                    />
                    {renderTechDemandSparkline()}
                  </div>
                </div>
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-row items-center gap-1.5">
              <div className="shrink-0" style={{ width: railSpacerWidthPx }} aria-hidden />
              <div
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-muted-foreground"
                role="group"
                aria-label="Programme bar colours"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-4 shrink-0 rounded-sm border border-zinc-300/90 shadow-sm dark:border-zinc-600/90"
                    style={{ backgroundColor: prefs.campaignFill }}
                    aria-hidden
                  />
                  Campaign
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-4 shrink-0 rounded-sm border border-zinc-300/90 shadow-sm dark:border-zinc-600/90"
                    style={{ backgroundColor: prefs.techFill }}
                    aria-hidden
                  />
                  Tech programme
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!open && techDemandSparkline != null ? (
        <div className="flex min-w-0 flex-row items-end gap-1.5">
          <div className="shrink-0" style={{ width: railSpacerWidthPx }} aria-hidden />
          <div className="min-w-0 shrink-0" style={{ width: stripWidth, minWidth: stripWidth }}>
            {renderTechDemandSparkline()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
