import { DEFAULT_MARKET_RISK_SCALES, type MarketRiskComponentScales } from '@/engine/riskModelTuning';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const MR_SCALE_MAX = 4;
const MR_SCALE_STEP = 0.05;

const MARKET_RISK_SCALE_ROWS: {
  key: keyof MarketRiskComponentScales;
  label: string;
  hint?: string;
}[] = [
  { key: 'yearEndWeekRamp', label: 'Year-end weekly ramp', hint: '12 steps to 31 Dec (base weight in engine)' },
  { key: 'primaryMonthCurve', label: 'Primary deployment month curve', hint: 'deployment_risk_month_curve + defaults' },
  { key: 'contextMonthCurve', label: 'Context month curve', hint: 'deployment_risk_context_month_curve' },
  { key: 'holidays', label: 'Public + school holidays' },
  { key: 'storeConsequence', label: 'Store consequence' },
  { key: 'withinWeekLoad', label: 'Within-week load shape' },
  { key: 'storePeakInteraction', label: 'Busy week × store hot' },
  { key: 'campaignLinear', label: 'Campaign (linear term)', hint: 'Independent of Campaign Boost slider' },
  { key: 'campaignPeakInteraction', label: 'Campaign × busy week' },
  { key: 'events', label: 'Deployment events' },
  { key: 'blackouts', label: 'Blackouts' },
  { key: 'resourcingStrain', label: 'Tech / resourcing strain' },
];

function snapMarketRiskScale(n: number): number {
  const s = Math.round(n / MR_SCALE_STEP) * MR_SCALE_STEP;
  return Math.min(MR_SCALE_MAX, Math.max(0, Math.round(s * 100) / 100));
}

const TUNING_CONTROL_GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] sm:items-end sm:gap-x-3';
const TUNING_VALUE_BOX =
  'flex h-9 w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 dark:bg-background/50';
const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

export type MarketRiskScalesControlsProps = {
  /** Extra classes on the outer wrapper (e.g. border/spacing). */
  className?: string;
  /** When true, use a shorter max height for the scroll region (embedded side panel). */
  compact?: boolean;
};

/**
 * Per-component multipliers for the Market risk deployment sum (0–4×).
 * Shown in Business Patterns when the Market risk lens is active.
 */
export function MarketRiskScalesControls({ className, compact }: MarketRiskScalesControlsProps) {
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Fine-grained multipliers (0–4×).{' '}
          <strong className="font-medium text-foreground/90">Market risk shape</strong> above scales groups; these split
          terms inside each group. Settings <span className="font-medium text-foreground/85">Campaign Boost</span> is
          separate (global store/campaign pipeline).
        </p>
        <button
          type="button"
          className="mt-2 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => setRiskTuning({ marketRiskScales: { ...DEFAULT_MARKET_RISK_SCALES } })}
        >
          Reset expert scales to 1×
        </button>
      </div>
      <div
        className={cn(
          'space-y-2.5 overflow-y-auto pr-1',
          compact ? 'max-h-[min(18rem,42vh)]' : 'max-h-[min(22rem,50vh)]'
        )}
      >
        {MARKET_RISK_SCALE_ROWS.map(({ key, label, hint }) => {
          const v = snapMarketRiskScale(riskTuning.marketRiskScales[key]);
          return (
            <div key={key} className={TUNING_CONTROL_GRID}>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-medium leading-tight text-foreground">{label}</span>
                {hint ? (
                  <span className="text-[9px] leading-snug text-muted-foreground">{hint}</span>
                ) : null}
              </div>
              <div className="flex h-9 items-center">
                <input
                  type="range"
                  min={0}
                  max={MR_SCALE_MAX}
                  step={MR_SCALE_STEP}
                  value={v}
                  aria-label={`${label} scale`}
                  onChange={(e) =>
                    setRiskTuning({
                      marketRiskScales: {
                        ...riskTuning.marketRiskScales,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  className={TUNING_RANGE}
                />
              </div>
              <div className={TUNING_VALUE_BOX}>
                <span className="text-sm font-bold tabular-nums text-foreground">{v.toFixed(2)}×</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
