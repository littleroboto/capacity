import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import type { ViewModeId } from '@/lib/constants';
import type { TechWorkloadScope } from '@/lib/runwayViewMetrics';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { useReducedMotion } from 'motion/react';

/** Compare strip: Technology Teams, Restaurant Activity, and Deployment Risk only (no Code in this control). */
const RUNWAY_LENS_MODE_IDS: readonly ViewModeId[] = ['combined', 'in_store', 'market_risk'];

const TECH_WORKLOAD_OPTIONS: { value: TechWorkloadScope; label: string; title: string }[] = [
  {
    value: 'all',
    label: 'Combined',
    title: 'All scheduled engineering load: BAU, programmes, campaigns, coordination, and carryover',
  },
  {
    value: 'bau',
    label: 'BAU only',
    title: 'Routine BAU and weekly tech rhythm only (bau surface in the model)',
  },
  {
    value: 'project',
    label: 'Project work',
    title: 'Campaign, tech programme, release, coordination, and carryover engineering load only',
  },
];

type WorkbenchRunwayControlsProps = {
  /** When true, hide the Code option; lens toggles still apply to every compare column. */
  compareAllMarkets?: boolean;
};

/** Heatmap lens — right workbench panel. Focus and year/quarter live in the same scroll column above this block. */
export function WorkbenchRunwayControls({ compareAllMarkets = false }: WorkbenchRunwayControlsProps) {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const techWorkloadScope = useAtcStore((s) => s.techWorkloadScope);
  const setTechWorkloadScope = useAtcStore((s) => s.setTechWorkloadScope);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex shrink-0 flex-col gap-3 px-0 py-0">
      <p className="text-[11px] leading-snug text-muted-foreground">
        {compareAllMarkets ? (
          <>
            Lens applies to <span className="font-semibold text-foreground/90">every</span> column.{' '}
            <span className="font-semibold text-foreground/90">Business Patterns</span> uses the focus market; YAML
            follows the strip focus.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground/90">Focus</span> and{' '}
            <span className="font-semibold text-foreground/90">Year / Quarter</span> above set one region or a compare
            strip (LIOM, IOM, …).
          </>
        )}
      </p>

      <div>
        <Label
          id="workbench-runway-lens-label"
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Runway lens
        </Label>
        <div className="mt-1.5 p-0" role="group" aria-labelledby="workbench-runway-lens-label">
          <ViewModeRadios
            viewMode={viewMode}
            setViewMode={setViewMode}
            reduceMotion={!!reduceMotion}
            compact
            unstyled
            layoutGroupId="view-mode-panel"
            layoutBgId="view-mode-active-bg-panel"
            labelledBy="workbench-runway-lens-label"
            idSuffix="panel"
            allowedIds={compareAllMarkets ? RUNWAY_LENS_MODE_IDS : undefined}
            className="gap-x-0.5 gap-y-0.5"
          />

          {viewMode === 'combined' ? (
            <>
              <div className="my-1.5 h-px w-full max-w-full bg-border/30" aria-hidden />
              <div className="flex flex-col gap-1">
                <span
                  id="workbench-tech-load-hint"
                  className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Technology load
                </span>
                <RadioGroup
                  value={techWorkloadScope}
                  onValueChange={(v) => setTechWorkloadScope(v as TechWorkloadScope)}
                  aria-labelledby="workbench-tech-load-hint"
                  className="grid grid-cols-2 gap-1 overflow-hidden sm:grid-cols-3"
                >
                  {TECH_WORKLOAD_OPTIONS.map((opt) => {
                    const on = techWorkloadScope === opt.value;
                    return (
                      <label
                        key={opt.value}
                        title={opt.title}
                        className={cn(
                          'relative flex min-h-[2rem] cursor-pointer select-none items-center justify-center rounded-md px-1 text-center text-[10px] font-medium leading-tight transition-colors sm:min-h-[2.125rem] sm:text-[11px]',
                          on
                            ? 'bg-muted text-foreground'
                            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        <RadioGroupItem
                          value={opt.value}
                          id={`tw-scope-panel-${opt.value}`}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
