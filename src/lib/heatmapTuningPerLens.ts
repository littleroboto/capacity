import type { ViewModeId } from '@/lib/constants';
import { parseRiskHeatmapCurve, type RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';

/** Lenses that paint a runway heatmap (excludes Code). Tuning is identical for every market column. */
export const HEATMAP_TUNING_LENS_IDS = ['combined', 'in_store', 'market_risk'] as const;
export type HeatmapTuningLensId = (typeof HEATMAP_TUNING_LENS_IDS)[number];

export type PerLensHeatmapTuning = {
  /** Linear shift on 0–1 heatmap input before transfer (after tech headroom→stress flip where applicable). */
  pressureOffset: number;
  curve: RiskHeatmapCurveId;
  gamma: number;
  tailPower: number;
};

export const DEFAULT_PER_LENS_HEATMAP_TUNING: PerLensHeatmapTuning = {
  pressureOffset: 0,
  curve: 'sigmoid',
  gamma: 1,
  tailPower: 1,
};

export function defaultRiskHeatmapTuningByLens(): Record<HeatmapTuningLensId, PerLensHeatmapTuning> {
  return {
    combined: { ...DEFAULT_PER_LENS_HEATMAP_TUNING },
    in_store: { ...DEFAULT_PER_LENS_HEATMAP_TUNING },
    market_risk: { ...DEFAULT_PER_LENS_HEATMAP_TUNING },
  };
}

/** Map active runway view to the heatmap tuning bucket (`code` uses Technology Teams tuning). */
export function heatmapTuningLensForViewMode(mode: ViewModeId): HeatmapTuningLensId {
  if (mode === 'in_store') return 'in_store';
  if (mode === 'market_risk') return 'market_risk';
  return 'combined';
}

function clampOffset(n: number): number {
  return Math.min(0.5, Math.max(-0.5, Math.round(n * 100) / 100));
}

/** Same bounds as per-lens UI pressure offset (±0.5 on the 0–1 heatmap input before transfer). */
export function clampHeatmapPressureOffset(n: number): number {
  return clampOffset(n);
}

function clampGamma(n: number): number {
  return Math.min(3, Math.max(0.35, Math.round(n * 100) / 100));
}

function clampTail(n: number): number {
  return Math.min(2.75, Math.max(1, Math.round(n * 100) / 100));
}

export function clampPerLensHeatmapTuning(p: Partial<PerLensHeatmapTuning>): PerLensHeatmapTuning {
  const d = DEFAULT_PER_LENS_HEATMAP_TUNING;
  return {
    pressureOffset:
      p.pressureOffset != null && Number.isFinite(p.pressureOffset)
        ? clampOffset(p.pressureOffset)
        : d.pressureOffset,
    curve: p.curve != null ? parseRiskHeatmapCurve(String(p.curve)) : d.curve,
    gamma: p.gamma != null && Number.isFinite(p.gamma) ? clampGamma(p.gamma) : d.gamma,
    tailPower: p.tailPower != null && Number.isFinite(p.tailPower) ? clampTail(p.tailPower) : d.tailPower,
  };
}

/** Parse persisted `riskHeatmapTuningByLens` object; returns null if invalid. */
export function parseRiskHeatmapTuningByLens(raw: unknown): Record<HeatmapTuningLensId, PerLensHeatmapTuning> | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out = defaultRiskHeatmapTuningByLens();
  for (const id of HEATMAP_TUNING_LENS_IDS) {
    const v = o[id];
    if (v !== null && typeof v === 'object') {
      out[id] = clampPerLensHeatmapTuning(v as Partial<PerLensHeatmapTuning>);
    }
  }
  return out;
}

/** Build per-lens map from pre-epic global store fields (export/import + manual migration). */
export function riskHeatmapTuningByLensFromLegacyGlobals(legacy: {
  riskHeatmapGamma?: number;
  riskHeatmapGammaTech?: number;
  riskHeatmapGammaBusiness?: number;
  riskHeatmapCurve?: RiskHeatmapCurveId;
  riskHeatmapTailPower?: number;
  riskHeatmapBusinessPressureOffset?: number;
}): Record<HeatmapTuningLensId, PerLensHeatmapTuning> {
  const g = legacy.riskHeatmapGamma ?? 1;
  const gTech = legacy.riskHeatmapGammaTech ?? g;
  const gBus = legacy.riskHeatmapGammaBusiness ?? g;
  const curve = legacy.riskHeatmapCurve ?? 'sigmoid';
  const tail = legacy.riskHeatmapTailPower ?? 1;
  const off = legacy.riskHeatmapBusinessPressureOffset ?? 0;
  const base = {
    pressureOffset: clampOffset(off),
    curve: parseRiskHeatmapCurve(curve),
    tailPower: clampTail(tail),
  };
  return {
    combined: clampPerLensHeatmapTuning({ ...base, gamma: gTech }),
    in_store: clampPerLensHeatmapTuning({ ...base, gamma: gBus }),
    market_risk: clampPerLensHeatmapTuning({ ...base, gamma: gTech }),
  };
}

export function labelForHeatmapTuningLens(id: HeatmapTuningLensId): string {
  switch (id) {
    case 'combined':
      return 'Technology Teams';
    case 'in_store':
      return 'Restaurant Activity';
    case 'market_risk':
      return 'Deployment Risk';
    default:
      return id;
  }
}
