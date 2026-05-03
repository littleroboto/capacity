import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { CalendarRange, Settings2 } from 'lucide-react';
import type { DeploymentRiskBlackout, MarketConfig } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { cn } from '@/lib/utils';
import { collectProgrammeGanttChronicleLanes } from '@/lib/runwayProgrammeGanttModel';
import { applyLedgerExclusionsToMarketConfig } from '@/lib/marketConfigLedgerExclusions';
import type { MarketActivityLedger } from '@/lib/marketActivityLedger';
import {
  loadProgrammeGanttOpen,
  loadProgrammeGanttPrefs,
  RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS,
  saveProgrammeGanttOpen,
  saveProgrammeGanttPrefs,
  type ProgrammeGanttDisplayPrefs,
} from '@/lib/runwayProgrammeGanttPrefs';
import { RunwayProgrammeGanttStrip } from '@/components/RunwayProgrammeGanttStrip';

const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MOTION_EASE_IN = [0.32, 0, 0.67, 1] as const;

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
  const ephemeralRevealStartedRef = useRef(false);

  useEffect(() => {
    if (ephemeral) return;
    saveProgrammeGanttOpen(open);
  }, [ephemeral, open]);

  useEffect(() => {
    if (ephemeral) return;
    saveProgrammeGanttPrefs(prefs);
  }, [ephemeral, prefs]);

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
                  <div className="max-h-[min(70vh,22rem)] space-y-3 overflow-y-auto pr-0.5 text-[11px]">
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Bar height (px)</span>
                      <input
                        type="number"
                        min={6}
                        max={28}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        value={prefs.barHeightPx}
                        onChange={(e) => setPref('barHeightPx', Number(e.target.value) || prefs.barHeightPx)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Lane gap (px)</span>
                      <input
                        type="number"
                        min={2}
                        max={16}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        value={prefs.laneGapPx}
                        onChange={(e) => setPref('laneGapPx', Number(e.target.value) || prefs.laneGapPx)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={prefs.showBlackouts}
                        onChange={(e) => setPref('showBlackouts', e.target.checked)}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                      <span>Show deployment blackouts</span>
                    </label>
                    <label className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={prefs.showSchoolHolidays}
                        onChange={(e) => setPref('showSchoolHolidays', e.target.checked)}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                      <span>Show school holidays</span>
                    </label>
                    <label className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={prefs.showBarTrailingCaption}
                        onChange={(e) => setPref('showBarTrailingCaption', e.target.checked)}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                      <span>Show date range after bar name (ISO)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-zinc-600 dark:text-zinc-400">Campaign colour</span>
                        <input
                          type="color"
                          className="h-8 w-full cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-900"
                          value={solidOrHexForPicker(prefs.campaignFill, RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS.campaignFill)}
                          onChange={(e) => setPref('campaignFill', e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-zinc-600 dark:text-zinc-400">Tech colour</span>
                        <input
                          type="color"
                          className="h-8 w-full cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-900"
                          value={solidOrHexForPicker(prefs.techFill, RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS.techFill)}
                          onChange={(e) => setPref('techFill', e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Bar opacity</span>
                      <input
                        type="range"
                        min={0.25}
                        max={1}
                        step={0.05}
                        value={prefs.barOpacity}
                        onChange={(e) => setPref('barOpacity', Number(e.target.value))}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Bar hatch spacing (px, 45°)</span>
                      <input
                        type="number"
                        min={2}
                        max={14}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        value={prefs.barHatchSpacingPx}
                        onChange={(e) =>
                          setPref('barHatchSpacingPx', Number(e.target.value) || prefs.barHatchSpacingPx)
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Bar hatch strength</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={prefs.barHatchOpacity}
                        onChange={(e) => setPref('barHatchOpacity', Number(e.target.value))}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">School holiday column hatch</span>
                      <input
                        type="range"
                        min={0.08}
                        max={1}
                        step={0.05}
                        value={prefs.overlayHatchOpacity}
                        onChange={(e) => setPref('overlayHatchOpacity', Number(e.target.value))}
                        className="accent-zinc-900 dark:accent-zinc-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Column wash (under hatch)</span>
                      <input
                        type="text"
                        spellCheck={false}
                        className="h-8 rounded-md border border-zinc-300 bg-white px-2 font-mono text-[10px] text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        value={prefs.overlayColumnFill}
                        onChange={(e) => setPref('overlayColumnFill', e.target.value)}
                        placeholder="e.g. rgba(228,228,231,0.45)"
                      />
                    </label>
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
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-1 py-0.5 [scrollbar-gutter:stable]">
                <div
                  className="min-w-0 shrink-0 overflow-hidden rounded-[3px]"
                  style={{ width: stripWidth, minWidth: stripWidth }}
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
                  />
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
    </div>
  );
}

/** Normalise stored fill to `#rrggbb` for `<input type="color">`. */
function solidOrHexForPicker(value: string, fallbackHex: string): string {
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) return value.slice(0, 7);
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return fallbackHex;
  const r = Number(m[1]).toString(16).padStart(2, '0');
  const g = Number(m[2]).toString(16).padStart(2, '0');
  const b = Number(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}
