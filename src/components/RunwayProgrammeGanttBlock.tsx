import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarRange, Settings2 } from 'lucide-react';
import type { DeploymentRiskBlackout, MarketConfig } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { cn } from '@/lib/utils';
import { collectProgrammeGanttBars } from '@/lib/runwayProgrammeGanttModel';
import {
  loadProgrammeGanttOpen,
  loadProgrammeGanttPrefs,
  RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS,
  saveProgrammeGanttOpen,
  saveProgrammeGanttPrefs,
  type ProgrammeGanttDisplayPrefs,
} from '@/lib/runwayProgrammeGanttPrefs';
import { RunwayProgrammeGanttStrip } from '@/components/RunwayProgrammeGanttStrip';

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
  railSpacerWidthPx: number;
  className?: string;
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
  railSpacerWidthPx,
  className,
}: Props) {
  const [open, setOpen] = useState(loadProgrammeGanttOpen);
  const [prefs, setPrefs] = useState<ProgrammeGanttDisplayPrefs>(loadProgrammeGanttPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveProgrammeGanttOpen(open);
  }, [open]);

  useEffect(() => {
    saveProgrammeGanttPrefs(prefs);
  }, [prefs]);

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

  const bars = collectProgrammeGanttBars(marketConfig);

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
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Programme timeline
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
                  className="absolute right-0 z-50 mt-1 w-[min(100vw-2rem,18rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
                  role="dialog"
                  aria-label="Programme timeline settings"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Display</span>
                    <button
                      type="button"
                      className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={resetPrefs}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="max-h-[min(70vh,22rem)] space-y-3 overflow-y-auto pr-0.5 text-[11px]">
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Bar height (px)</span>
                      <input
                        type="number"
                        min={6}
                        max={28}
                        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                        value={prefs.barHeightPx}
                        onChange={(e) => setPref('barHeightPx', Number(e.target.value) || prefs.barHeightPx)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Lane gap (px)</span>
                      <input
                        type="number"
                        min={2}
                        max={16}
                        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                        value={prefs.laneGapPx}
                        onChange={(e) => setPref('laneGapPx', Number(e.target.value) || prefs.laneGapPx)}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={prefs.showBlackouts}
                        onChange={(e) => setPref('showBlackouts', e.target.checked)}
                      />
                      <span>Show deployment blackouts</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={prefs.showSchoolHolidays}
                        onChange={(e) => setPref('showSchoolHolidays', e.target.checked)}
                      />
                      <span>Show school holidays</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Campaign fill</span>
                        <input
                          type="color"
                          className="h-8 w-full cursor-pointer rounded border border-input bg-background p-0.5"
                          value={rgbaToHexLoose(prefs.campaignFill)}
                          onChange={(e) => setPref('campaignFill', hexToRgba(e.target.value, 0.22))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Tech fill</span>
                        <input
                          type="color"
                          className="h-8 w-full cursor-pointer rounded border border-input bg-background p-0.5"
                          value={rgbaToHexLoose(prefs.techFill)}
                          onChange={(e) => setPref('techFill', hexToRgba(e.target.value, 0.2))}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Bar opacity</span>
                      <input
                        type="range"
                        min={0.25}
                        max={1}
                        step={0.05}
                        value={prefs.barOpacity}
                        onChange={(e) => setPref('barOpacity', Number(e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Blackout hatch strength</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={prefs.blackoutHatchOpacity}
                        onChange={(e) => setPref('blackoutHatchOpacity', Number(e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-foreground">School hatch strength</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={prefs.schoolHatchOpacity}
                        onChange={(e) => setPref('schoolHatchOpacity', Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="flex min-w-0 flex-row items-start gap-1.5">
          <div className="shrink-0" style={{ width: railSpacerWidthPx }} aria-hidden />
          <div className="min-w-0 overflow-x-auto" style={{ width: stripWidth, maxWidth: stripWidth }}>
            <RunwayProgrammeGanttStrip
              marketKey={`${country}-programme`}
              placedCells={placedCells}
              contributionMeta={contributionMeta}
              cellPx={cellPx}
              gap={gap}
              width={stripWidth}
              riskByDate={riskByDate}
              bars={bars}
              blackouts={blackouts}
              prefs={prefs}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Best-effort hex for color input when value is `rgba(...)`. */
function rgbaToHexLoose(rgba: string): string {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return '#f43f5e';
  const r = Number(m[1]).toString(16).padStart(2, '0');
  const g = Number(m[2]).toString(16).padStart(2, '0');
  const b = Number(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(244, 63, 94, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
