import type { ProgrammeGanttDisplayPrefs } from '@/lib/runwayProgrammeGanttPrefs';
import { RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS } from '@/lib/runwayProgrammeGanttPrefs';
import { cn } from '@/lib/utils';

function solidOrHexForPicker(value: string, fallbackHex: string): string {
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) return value.slice(0, 7);
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return fallbackHex;
  const r = Number(m[1]).toString(16).padStart(2, '0');
  const g = Number(m[2]).toString(16).padStart(2, '0');
  const b = Number(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export type ProgrammePlanDisplaySettingsFormProps = {
  prefs: ProgrammeGanttDisplayPrefs;
  setPref: <K extends keyof ProgrammeGanttDisplayPrefs>(key: K, value: ProgrammeGanttDisplayPrefs[K]) => void;
  /** Extra classes on the scrollable field stack. */
  className?: string;
};

/** Programme timeline strip: bar geometry, overlays, and colours (shared by Gantt dropdown + workbench Settings). */
export function ProgrammePlanDisplaySettingsForm({
  prefs,
  setPref,
  className,
}: ProgrammePlanDisplaySettingsFormProps) {
  return (
    <div className={cn('space-y-3 text-[11px]', className)}>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Bar height (px)</span>
        <input
          type="number"
          min={6}
          max={28}
          className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
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
          className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
          value={prefs.laneGapPx}
          onChange={(e) => setPref('laneGapPx', Number(e.target.value) || prefs.laneGapPx)}
        />
      </label>
      <label className="flex items-center gap-2 text-foreground">
        <input
          type="checkbox"
          checked={prefs.showBlackouts}
          onChange={(e) => setPref('showBlackouts', e.target.checked)}
          className="accent-primary"
        />
        <span>Show deployment blackouts</span>
      </label>
      <label className="flex items-center gap-2 text-foreground">
        <input
          type="checkbox"
          checked={prefs.showSchoolHolidays}
          onChange={(e) => setPref('showSchoolHolidays', e.target.checked)}
          className="accent-primary"
        />
        <span>Show school holidays</span>
      </label>
      <label className="flex items-center gap-2 text-foreground">
        <input
          type="checkbox"
          checked={prefs.showBarTrailingCaption}
          onChange={(e) => setPref('showBarTrailingCaption', e.target.checked)}
          className="accent-primary"
        />
        <span>Show date range after bar name (ISO)</span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-foreground">
        <input
          type="checkbox"
          checked={prefs.showGanttUnifiedThreeLineSparkline}
          onChange={(e) => setPref('showGanttUnifiedThreeLineSparkline', e.target.checked)}
          className="accent-primary mt-0.5"
        />
        <span>
          <span className="font-medium">Tech chart: three-line view</span>
          <span className="mt-0.5 block text-muted-foreground">
            Tech demand (blue), store trading (green), and deployment risk (red) — three 7-day smoothed traces in the same
            strip (programme chart and the strip above the runway when the plan is hidden); each line uses its own
            high–low stretch so shapes stay readable (qualitative rhythm, not one shared numeric axis).
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Plan build animation (workbench)</span>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={prefs.planBuildAnimation}
          onChange={(e) =>
            setPref('planBuildAnimation', e.target.value === 'staged' ? 'staged' : 'off')
          }
        >
          <option value="off">Off — show plan immediately</option>
          <option value="staged">Staged — broad beats + build console (milestones → prep → bars → labels)</option>
        </select>
        <span className="text-muted-foreground">
          Landing / preview still follows heatmap hero timing. Respects reduced motion (shows full plan).
        </span>
      </label>
      {prefs.planBuildAnimation === 'staged' ? (
        <div className="grid gap-2 border-l-2 border-border/60 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Stagger between objects (ms)</span>
            <input
              type="number"
              min={0}
              max={400}
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              value={prefs.planBuildStaggerMs}
              onChange={(e) => setPref('planBuildStaggerMs', Number(e.target.value) || 0)}
            />
            <span className="text-muted-foreground">Not used — each stage animates in parallel.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Pause between stages (ms)</span>
            <input
              type="number"
              min={0}
              max={800}
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              value={prefs.planBuildCategoryGapMs}
              onChange={(e) => setPref('planBuildCategoryGapMs', Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Bar grow duration (ms)</span>
            <input
              type="number"
              min={120}
              max={1200}
              step={20}
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
              value={prefs.planBuildBarGrowMs}
              onChange={(e) => setPref('planBuildBarGrowMs', Number(e.target.value) || 420)}
            />
          </label>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Campaign colour</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded border border-border bg-background p-0.5"
            value={solidOrHexForPicker(prefs.campaignFill, RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS.campaignFill)}
            onChange={(e) => setPref('campaignFill', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Tech colour</span>
          <input
            type="color"
            className="h-8 w-full cursor-pointer rounded border border-border bg-background p-0.5"
            value={solidOrHexForPicker(prefs.techFill, RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS.techFill)}
            onChange={(e) => setPref('techFill', e.target.value)}
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
          className="accent-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Bar hatch spacing (px, 45°)</span>
        <input
          type="number"
          min={2}
          max={14}
          className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
          value={prefs.barHatchSpacingPx}
          onChange={(e) => setPref('barHatchSpacingPx', Number(e.target.value) || prefs.barHatchSpacingPx)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Bar hatch strength</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.barHatchOpacity}
          onChange={(e) => setPref('barHatchOpacity', Number(e.target.value))}
          className="accent-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">School holiday column hatch</span>
        <input
          type="range"
          min={0.08}
          max={1}
          step={0.05}
          value={prefs.overlayHatchOpacity}
          onChange={(e) => setPref('overlayHatchOpacity', Number(e.target.value))}
          className="accent-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Column wash (under hatch)</span>
        <input
          type="text"
          spellCheck={false}
          className="h-8 rounded-md border border-border bg-background px-2 font-mono text-[10px] text-foreground"
          value={prefs.overlayColumnFill}
          onChange={(e) => setPref('overlayColumnFill', e.target.value)}
          placeholder="e.g. rgba(228,228,231,0.45)"
        />
      </label>
    </div>
  );
}
