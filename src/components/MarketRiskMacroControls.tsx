import {
  DEFAULT_MARKET_RISK_MACROS,
  type MarketRiskMacros,
} from '@/engine/riskModelTuning';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const MACRO_MIN = 0;
const MACRO_MAX = 2.5;
const MACRO_STEP = 0.05;

const ROWS: { key: keyof MarketRiskMacros; label: string; blurb: string }[] = [
  {
    key: 'programme',
    label: 'Programme pressure',
    blurb: 'How much campaigns count in Deployment Risk (linear + peak-week terms). YAML still sets dates and loads.',
  },
  {
    key: 'yearEndRunway',
    label: 'Year-end runway',
    blurb: 'Mistakes late in the year are harder to absorb — scales the weekly ladder toward 31 Dec only.',
  },
  {
    key: 'holidaysBench',
    label: 'Holidays & bench',
    blurb: 'Calendar closures plus thin response capacity (tech strain term).',
  },
  {
    key: 'tradingSnap',
    label: 'Trading snap',
    blurb: 'Busy weeks make incidents hurt more — week shape and store × peak-day interaction.',
  },
];

function snapMacro(n: number): number {
  const s = Math.round(n / MACRO_STEP) * MACRO_STEP;
  return Math.min(MACRO_MAX, Math.max(MACRO_MIN, Math.round(s * 100) / 100));
}

const GRID =
  'grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_4.25rem] sm:items-end sm:gap-x-3';
const RANGE = 'h-2.5 w-full min-w-0 cursor-pointer accent-primary';
const VALUE_BOX =
  'flex h-9 w-[4.25rem] shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/90 px-2 text-sm font-bold tabular-nums text-foreground shadow-sm dark:bg-background/40';

export type MarketRiskMacroControlsProps = {
  className?: string;
};

/** Four coarse knobs for Deployment Risk deployment shape; pairs with expert per-component scales. */
export function MarketRiskMacroControls({ className }: MarketRiskMacroControlsProps) {
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const m = riskTuning.marketRiskMacros;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-gradient-to-b from-muted/30 to-transparent p-3 shadow-sm ring-1 ring-border/30 dark:from-muted/15 dark:ring-border/25',
        className
      )}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold tracking-tight text-foreground">Deployment risk shape</h3>
          <p className="mt-0.5 max-w-[42ch] text-[10px] leading-relaxed text-muted-foreground">
            Four multipliers on top of defaults. Use{' '}
            <span className="font-medium text-foreground/85">1×</span> for neutral; open Expert below to tune
            individual engine terms.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-medium text-foreground/90 shadow-sm transition hover:bg-muted/50 dark:bg-background/30"
          onClick={() =>
            setRiskTuning({ marketRiskMacros: { ...DEFAULT_MARKET_RISK_MACROS } })
          }
        >
          Reset shape
        </button>
      </div>
      <div className="space-y-3">
        {ROWS.map(({ key, label, blurb }) => {
          const v = snapMacro(m[key]);
          return (
            <div key={key} className={GRID}>
              <div className="min-w-0">
                <div className="text-[11px] font-medium leading-tight text-foreground">{label}</div>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{blurb}</p>
              </div>
              <div className="flex min-h-9 items-center">
                <input
                  type="range"
                  min={MACRO_MIN}
                  max={MACRO_MAX}
                  step={MACRO_STEP}
                  value={v}
                  aria-label={`${label} strength`}
                  onChange={(e) =>
                    setRiskTuning({
                      marketRiskMacros: {
                        ...riskTuning.marketRiskMacros,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  className={RANGE}
                />
              </div>
              <div className={VALUE_BOX} title="Multiplier on this group">
                {v.toFixed(2)}×
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
