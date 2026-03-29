import { VIEW_MODES, type ViewModeId } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LayoutGroup, motion } from 'motion/react';

export type ViewModeRadiosProps = {
  viewMode: ViewModeId;
  setViewMode: (v: ViewModeId) => void;
  reduceMotion: boolean;
  compact: boolean;
  layoutGroupId: string;
  layoutBgId: string;
  labelledBy?: string;
  className?: string;
  /** Suffix for stable `id`s on radio inputs (e.g. `panel` vs `header`). */
  idSuffix?: string;
  /**
   * When set, only these runway lenses are shown (order follows {@link VIEW_MODES}).
   * Use on LIOM to offer Technology Teams / Restaurant Activity without Code.
   */
  allowedIds?: readonly ViewModeId[];
};

export function ViewModeRadios({
  viewMode,
  setViewMode,
  reduceMotion,
  compact,
  layoutGroupId,
  layoutBgId,
  labelledBy,
  className,
  idSuffix = 'default',
  allowedIds,
}: ViewModeRadiosProps) {
  const visibleModes =
    allowedIds?.length ?
      VIEW_MODES.filter((m) => allowedIds.includes(m.id))
    : [...VIEW_MODES];
  if (!visibleModes.length) return null;
  const groupValue = visibleModes.some((m) => m.id === viewMode) ? viewMode : visibleModes[0]!.id;

  return (
    <RadioGroup
      value={groupValue}
      onValueChange={(v) => setViewMode(v as ViewModeId)}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : 'View mode'}
      className={cn(
        'flex flex-wrap gap-x-1 gap-y-1 rounded-lg border border-border/80 bg-muted/20 md:gap-x-0 md:gap-y-1',
        compact ? 'p-0.5' : 'mt-2 p-2',
        className
      )}
    >
      <LayoutGroup id={layoutGroupId}>
        {visibleModes.map((m) => {
          const selected = viewMode === m.id;
          const pillSpring = reduceMotion
            ? { duration: 0.01 }
            : { type: 'spring' as const, stiffness: 420, damping: 34 };
          return (
            <motion.label
              key={m.id}
              title={m.title}
              className={cn(
                'relative flex cursor-pointer items-center gap-2 rounded-md px-2 transition-colors',
                compact ? 'py-0.5 text-[11px] md:px-2' : 'py-1.5 text-sm md:px-2.5',
                'hover:bg-background/80',
                reduceMotion && selected && 'bg-background shadow-sm ring-1 ring-border/90'
              )}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              {selected && !reduceMotion ? (
                <motion.div
                  layoutId={layoutBgId}
                  className="pointer-events-none absolute inset-0 z-0 rounded-md bg-background shadow-sm ring-1 ring-border/90"
                  transition={pillSpring}
                  aria-hidden
                />
              ) : null}
              <span className={cn('relative z-10 flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
                <RadioGroupItem
                  value={m.id}
                  id={`vm-${idSuffix}-${m.id}`}
                  className={cn('border-muted-foreground/40', compact && 'h-3.5 w-3.5')}
                />
                <span className="whitespace-nowrap leading-none">{m.label}</span>
              </span>
            </motion.label>
          );
        })}
      </LayoutGroup>
    </RadioGroup>
  );
}
