import { useMemo, useState } from 'react';
import { ChevronDown, RotateCcw, Rows2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_RISK_TUNING, normalizedRiskWeights, type RiskModelTuning } from '@/engine/riskModelTuning';
import {
  RISK_HEATMAP_CURVE_OPTIONS,
  applyRiskHeatmapTransfer,
  riskHeatmapCurveUsesGamma,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

/** Distinct segment colours for the blend bar (collapsed + expanded story). */
const BLEND_VIS: { key: keyof ReturnType<typeof normalizedRiskWeights>; label: string; className: string }[] = [
  { key: 'tech', label: 'Tech', className: 'bg-sky-600 dark:bg-sky-500' },
  { key: 'store', label: 'Restaurant', className: 'bg-amber-600 dark:bg-amber-500' },
  { key: 'campaign', label: 'Marketing', className: 'bg-violet-600 dark:bg-violet-500' },
  { key: 'holiday', label: 'Resources', className: 'bg-teal-600 dark:bg-teal-500' },
];

function BlendStackBar({
  weights,
  className,
}: {
  weights: ReturnType<typeof normalizedRiskWeights>;
  className?: string;
}) {
  const segs = BLEND_VIS.map((b) => ({ ...b, w: weights[b.key] }));
  const label = segs.map((s) => `${s.label} ${Math.round(s.w * 100)}%`).join(' · ');
  return (
    <div
      className={cn('w-full', className)}
      role="img"
      aria-label={`Combined risk mix: ${label}`}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border/60 bg-muted/60 shadow-inner">
        {segs.map((s) => (
          <div
            key={s.key}
            title={`${s.label} ${Math.round(s.w * 100)}%`}
            className={cn(s.className, 'min-w-0 shrink-0 transition-[flex-grow] duration-200')}
            style={{
              flexGrow: Math.max(s.w, 0.001),
              flexBasis: s.w < 0.04 ? 4 : 0,
              maxWidth: s.w < 1e-6 ? 0 : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact curve vs linear reference for dropdown rows and trigger. */
function CurveTransferSparkline({
  curve,
  gamma,
  className,
}: {
  curve: RiskHeatmapCurveId;
  gamma: number;
  className?: string;
}) {
  const W = 52;
  const H = 20;
  const pad = 2;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const g = Math.min(3, Math.max(0.35, gamma));
  const steps = 20;
  const toX = (t: number) => pad + t * innerW;
  const toY = (out: number) => pad + innerH - out * innerH;
  const ptsCurve: string[] = [];
  const ptsLin: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ptsCurve.push(`${toX(t).toFixed(1)},${toY(applyRiskHeatmapTransfer(t, curve, g)).toFixed(1)}`);
    ptsLin.push(`${toX(t).toFixed(1)},${toY(t).toFixed(1)}`);
  }
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={cn('shrink-0 text-foreground', className)}
      aria-hidden
    >
      <polyline
        fill="none"
        points={ptsLin.join(' ')}
        className="stroke-muted-foreground/45"
        strokeWidth={1}
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        fill="none"
        points={ptsCurve.join(' ')}
        className="stroke-primary"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const RISK_BLEND_PRESETS: { id: string; label: string; tuning: RiskModelTuning }[] = [
  {
    id: 'tech-led',
    label: 'Tech-led',
    tuning: {
      ...DEFAULT_RISK_TUNING,
      importanceTech: 75,
      importanceStore: 18,
      importanceCampaign: 7,
      importanceHoliday: 0,
    },
  },
  {
    id: 'store-led',
    label: 'Restaurant-led',
    tuning: {
      ...DEFAULT_RISK_TUNING,
      importanceTech: 25,
      importanceStore: 55,
      importanceCampaign: 15,
      importanceHoliday: 5,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    tuning: {
      ...DEFAULT_RISK_TUNING,
      importanceTech: 30,
      importanceStore: 30,
      importanceCampaign: 30,
      importanceHoliday: 10,
    },
  },
];

function TuningSlider({
  id,
  label,
  value,
  max,
  blendShare,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  /** Normalized share of Combined risk (0–1). */
  blendShare: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  const pctShare = `${Math.round(blendShare * 100)}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-normal text-foreground">
          {label}
        </Label>
        <div className="shrink-0 text-right leading-tight">
          <div className="tabular-nums text-xs font-medium text-foreground">{pctShare}</div>
          <div className="tabular-nums text-[10px] text-muted-foreground">weight {value}</div>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      {hint ? <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type SectionShell = 0 | 1 | 2;

export function RiskModelPanel() {
  const [expanded, setExpanded] = useState(false);
  /** 0 = full chrome, 1 = text-only strip, 2 = icon-only strip. */
  const [shell, setShell] = useState<SectionShell>(0);
  const cycleShell = () => setShell((s) => ((s + 1) % 3) as SectionShell);
  /** Collapse Tech/Restaurant/Marketing/Resources sliders to save vertical space. */
  const [blendWeightsOpen, setBlendWeightsOpen] = useState(false);
  const viewMode = useAtcStore((s) => s.viewMode);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);
  const resetRiskTuning = useAtcStore((s) => s.resetRiskTuning);
  const setRiskHeatmapGamma = useAtcStore((s) => s.setRiskHeatmapGamma);
  const setRiskHeatmapCurve = useAtcStore((s) => s.setRiskHeatmapCurve);

  const curveHint = RISK_HEATMAP_CURVE_OPTIONS.find((o) => o.id === riskHeatmapCurve)?.hint;

  const weights = useMemo(() => normalizedRiskWeights(riskTuning), [riskTuning]);

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const patch = (p: Partial<RiskModelTuning>) => setRiskTuning(p);

  const blendSummary = `Tech ${pct(weights.tech)} · Restaurant ${pct(weights.store)} · Marketing ${pct(weights.campaign)} · Resources ${pct(weights.holiday)}`;

  const shellHint = ['Full header', 'Text strip', 'Icons only'][shell]!;

  const headerRow = (opts: { iconOnly?: boolean }) => {
    if (opts.iconOnly) {
      return (
        <div className="flex items-center justify-end gap-0.5 border-b border-border/50 bg-card/40 px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title={expanded ? 'Hide risk tuning' : 'Show risk tuning'}
            aria-label={expanded ? 'Hide risk tuning' : 'Show risk tuning'}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
            onClick={cycleShell}
            title={`Section layout: ${shellHint}. Click for next.`}
            aria-label={`Cycle section layout, currently ${shellHint}`}
          >
            <Rows2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
            onClick={() => resetRiskTuning()}
            title="Reset risk model"
            aria-label="Reset risk model"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      );
    }
    if (shell === 1) {
      return (
        <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-card/40 px-2 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left outline-none ring-offset-background transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="text-xs font-semibold text-foreground">Risk model</span>
              <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {expanded ? 'Hide tuning' : 'Show tuning'}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={cycleShell}
              title={`Layout: ${shellHint}`}
              aria-label={`Cycle section layout, ${shellHint}`}
            >
              <Rows2 className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => resetRiskTuning()}>
              Reset
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-card/40 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none ring-offset-background transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden
          />
          <span className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Risk model</h3>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {expanded ? 'Hide tuning' : 'Show tuning'}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={cycleShell}
            title={`Layout: ${shellHint}. Next: compact.`}
            aria-label={`Cycle section layout, ${shellHint}`}
          >
            <Rows2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => resetRiskTuning()}>
            Reset
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20 shadow-sm">
      {shell === 2 ? headerRow({ iconOnly: true }) : headerRow({})}

      {expanded ? (
        <div className="flex min-h-0 max-h-[min(52vh,32rem)] flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-y-contain border-t border-border/60 px-3 pb-3 pt-3">
          <div className="flex flex-col gap-2">
            <BlendStackBar weights={weights} />
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="text-foreground/70">Mix</span>{' '}
              <span className="tabular-nums text-foreground/85">{blendSummary}</span>
            </p>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            On <strong className="font-medium text-foreground">public or school</strong> holidays, lab/team capacity is
            scaled by a fixed <strong className="font-medium text-foreground">50%</strong> in the engine. Use{' '}
            <strong className="font-medium text-foreground">Blend weights</strong> below to change Tech / Restaurant /
            Marketing / Resources; collapse it to focus on the combined transfer curve (γ) controls.
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quick presets</span>
            <div className="flex flex-wrap gap-1.5">
              {RISK_BLEND_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setRiskTuning(p.tuning)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/30">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setBlendWeightsOpen((o) => !o)}
              aria-expanded={blendWeightsOpen}
              id="risk-blend-weights-toggle"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  blendWeightsOpen && 'rotate-180'
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 leading-snug">
                Blend weights <span className="font-normal text-muted-foreground">(Tech · Restaurant · Marketing · Resources)</span>
              </span>
              <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                {blendWeightsOpen ? 'Hide sliders' : 'Show sliders'}
              </span>
            </button>
            {blendWeightsOpen ? (
              <div className="space-y-3 border-t border-border/60 px-2.5 pb-3 pt-2">
                <p className="text-[11px] leading-snug text-muted-foreground">
                  <strong className="font-medium text-foreground">Only ratios matter</strong> — scaling all four sliders
                  by the same amount leaves the blend unchanged. The large percentage on each row is that factor’s share
                  of <strong className="font-medium text-foreground">Combined risk</strong>; “weight” is the raw slider
                  value.
                </p>
                <div className="grid gap-3">
                  <TuningSlider
                    id="imp-tech"
                    label="Tech"
                    value={riskTuning.importanceTech}
                    max={100}
                    blendShare={weights.tech}
                    onChange={(n) => patch({ importanceTech: n })}
                  />
                  <TuningSlider
                    id="imp-store"
                    label="Restaurant"
                    value={riskTuning.importanceStore}
                    max={100}
                    blendShare={weights.store}
                    onChange={(n) => patch({ importanceStore: n })}
                  />
                  <TuningSlider
                    id="imp-campaign"
                    label="Marketing"
                    value={riskTuning.importanceCampaign}
                    max={100}
                    blendShare={weights.campaign}
                    hint="Campaign strength while a window is active. Business view uses this too; see cell hover for detail."
                    onChange={(n) => patch({ importanceCampaign: n })}
                  />
                  <TuningSlider
                    id="imp-holiday"
                    label="Resources"
                    value={riskTuning.importanceHoliday}
                    max={100}
                    blendShare={weights.holiday}
                    hint="Adds a risk bump on public or school holidays. Leave at 0 for capacity-only effect (tighter lab/team caps on those days)."
                    onChange={(n) => patch({ importanceHoliday: n })}
                  />
                </div>
              </div>
            ) : null}
          </div>

      {viewMode === 'combined' ? (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk-heatmap-curve" className="text-xs font-normal">
              Combined risk transfer curve
            </Label>
            <Select
              value={riskHeatmapCurve}
              onValueChange={(v) => setRiskHeatmapCurve(v as RiskHeatmapCurveId)}
            >
              <SelectTrigger
                id="risk-heatmap-curve"
                className="relative h-9 w-full justify-start px-3 pr-9 text-xs [&>svg:last-of-type]:pointer-events-none [&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-2.5 [&>svg:last-of-type]:top-1/2 [&>svg:last-of-type]:-translate-y-1/2 [&>svg:last-of-type]:shrink-0"
              >
                <span className="flex min-w-0 w-full flex-1 justify-center">
                  <SelectValue placeholder="Curve" />
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-[min(22rem,72vh)]">
                {RISK_HEATMAP_CURVE_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.id}
                    value={o.id}
                    className="cursor-pointer py-2 pl-8 pr-8 text-xs"
                    itemTextClassName="flex flex-1 justify-center"
                  >
                    <span className="flex items-center justify-center gap-2.5">
                      <CurveTransferSparkline curve={o.id} gamma={riskHeatmapGamma} />
                      <span className="min-w-0 shrink leading-snug">{o.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {curveHint ? (
              <p className="text-[10px] leading-snug text-muted-foreground">{curveHint}</p>
            ) : null}
          </div>
          {riskHeatmapCurveUsesGamma(riskHeatmapCurve) ? (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="risk-heatmap-gamma" className="text-xs font-normal">
                  Curve strength (γ)
                </Label>
                <input
                  id="risk-heatmap-gamma"
                  type="range"
                  min={35}
                  max={300}
                  step={5}
                  value={Math.round(riskHeatmapGamma * 100)}
                  onChange={(e) => setRiskHeatmapGamma(Number(e.target.value) / 100)}
                  className="h-2.5 w-full cursor-pointer accent-primary"
                />
                {riskHeatmapCurve === 'power' ? (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Power: γ &gt; 1 favours greens at low scores; γ &lt; 1 lifts mids toward amber/red.{' '}
                    <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> is omitted when γ = 1.
                  </p>
                ) : (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    γ steers steepness (sigmoid) or compression (log).{' '}
                    <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> is omitted when γ = 1.
                  </p>
                )}
              </div>
              <div
                role="status"
                aria-live="polite"
                aria-label={`Curve strength gamma ${riskHeatmapGamma.toFixed(2)}`}
                className="flex flex-row items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/35 px-3 py-2.5 dark:bg-muted/20 sm:min-w-[5.25rem] sm:flex-col sm:justify-center sm:gap-1 sm:self-stretch sm:px-4 sm:py-3"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-center">
                  Gamma
                </span>
                <span className="text-3xl font-extrabold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
                  {riskHeatmapGamma.toFixed(2)}
                </span>
              </div>
            </div>
          ) : null}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Updates the editor for the focused country:{' '}
            <span className="font-mono text-foreground/80">risk_heatmap_curve</span> when not Power (default), plus{' '}
            <span className="font-mono text-foreground/80">risk_heatmap_gamma</span> when γ ≠ 1.
          </p>
        </div>
      ) : null}
        </div>
      ) : null}
    </div>
  );
}
