import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ViewModeRadios } from '@/components/ViewModeRadios';
import type { ViewModeId } from '@/lib/constants';
import type { TechWorkloadScope } from '@/lib/runwayViewMetrics';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';
import { useReducedMotion } from 'motion/react';

/** LIOM: Technology Teams and Restaurant Activity only (no Code in this control). */
const RUNWAY_LENS_MODE_IDS: readonly ViewModeId[] = ['combined', 'in_store'];

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

/** Heatmap lens — right workbench panel. Market / LIOM **Focus** is above the runway (main column). */
export function WorkbenchRunwayControls({ compareAllMarkets = false }: WorkbenchRunwayControlsProps) {
  const viewMode = useAtcStore((s) => s.viewMode);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const techWorkloadScope = useAtcStore((s) => s.techWorkloadScope);
  const setTechWorkloadScope = useAtcStore((s) => s.setTechWorkloadScope);
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-muted/15 p-3',
        'shadow-[0_0_22px_-6px_rgba(37,99,235,0.28)] dark:shadow-[0_0_32px_-8px_rgba(96,165,250,0.22)]'
      )}
    >
      <p className="text-[10px] leading-snug text-muted-foreground">
        {compareAllMarkets ? (
          <>
            Lens applies to <span className="font-semibold text-foreground/90">all</span> markets. Use{' '}
            <span className="font-semibold text-foreground/90">Focus</span> for YAML and heatmap controls on one market.
          </>
        ) : (
          <>
            Use <span className="font-semibold text-foreground/90">Focus</span> at the top of the runway to choose LIOM or
            a single market.
          </>
        )}
      </p>

      <div className="border-t border-border/50 pt-3">
        <Label
          id="workbench-runway-lens-label"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Runway lens
        </Label>
        <div
          className="mt-2 rounded-lg border border-border/80 bg-muted/25 p-2 shadow-sm"
          role="group"
          aria-labelledby="workbench-runway-lens-label"
        >
          <ViewModeRadios
            viewMode={viewMode}
            setViewMode={setViewMode}
            reduceMotion={!!reduceMotion}
            compact={false}
            unstyled
            layoutGroupId="view-mode-panel"
            layoutBgId="view-mode-active-bg-panel"
            labelledBy="workbench-runway-lens-label"
            idSuffix="panel"
            allowedIds={compareAllMarkets ? RUNWAY_LENS_MODE_IDS : undefined}
          />

          {viewMode === 'combined' ? (
            <>
              <div className="my-2.5 h-px w-full bg-border/50" aria-hidden />
              <div className="flex flex-col gap-1.5">
                <span
                  id="workbench-tech-load-hint"
                  className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Technology load
                </span>
                <RadioGroup
                  value={techWorkloadScope}
                  onValueChange={(v) => setTechWorkloadScope(v as TechWorkloadScope)}
                  aria-labelledby="workbench-tech-load-hint"
                  className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border/40 p-px ring-1 ring-border/35 sm:grid-cols-3"
                >
                  {TECH_WORKLOAD_OPTIONS.map((opt) => {
                    const on = techWorkloadScope === opt.value;
                    return (
                      <label
                        key={opt.value}
                        title={opt.title}
                        className={cn(
                          'relative flex min-h-[2.25rem] cursor-pointer select-none items-center justify-center px-1.5 text-center text-[11px] font-medium leading-snug transition-colors',
                          on
                            ? 'bg-background text-foreground shadow-sm'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/55 hover:text-foreground'
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
