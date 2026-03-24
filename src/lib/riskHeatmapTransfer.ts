/**
 * Transfer functions map combined pressure score in [0, 1] → palette index input in [0, 1]
 * before discrete colour bands (see `riskHeatmapColors.ts`).
 */

export const RISK_HEATMAP_CURVE_IDS = [
  'power',
  'linear',
  'smoothstep',
  'sigmoid',
  'log',
  'ease_in_quad',
  'ease_out_quad',
  'piecewise_knee',
] as const;

export type RiskHeatmapCurveId = (typeof RISK_HEATMAP_CURVE_IDS)[number];

export const RISK_HEATMAP_CURVE_OPTIONS: { id: RiskHeatmapCurveId; label: string; hint: string }[] = [
  { id: 'power', label: 'Power (γ)', hint: 'pressure^γ — same as legacy; use γ slider' },
  { id: 'linear', label: 'Linear', hint: 'Identity; ignores γ' },
  { id: 'smoothstep', label: 'Smoothstep', hint: '3t² − 2t³; soft ends' },
  { id: 'sigmoid', label: 'Sigmoid (S)', hint: 'Logistic around mid; steepness from γ' },
  { id: 'log', label: 'Log compress', hint: 'log(1+k·t); k from γ' },
  { id: 'ease_in_quad', label: 'Ease-in quad', hint: 't² — slow start' },
  { id: 'ease_out_quad', label: 'Ease-out quad', hint: '1−(1−t)² — slow end' },
  { id: 'piecewise_knee', label: 'Piecewise knee', hint: 'gentler low half, steeper high half' },
];

export function parseRiskHeatmapCurve(raw: unknown): RiskHeatmapCurveId {
  if (raw == null || raw === '') return 'power';
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return (RISK_HEATMAP_CURVE_IDS as readonly string[]).includes(s) ? (s as RiskHeatmapCurveId) : 'power';
}

/** γ affects mapping for these curves (slider stays visible). */
export function riskHeatmapCurveUsesGamma(curve: RiskHeatmapCurveId): boolean {
  return curve === 'power' || curve === 'sigmoid' || curve === 'log';
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function normalizedSigmoid(c: number, k: number): number {
  const f = (t: number) => 1 / (1 + Math.exp(-k * (t - 0.5)));
  const y0 = f(0);
  const y1 = f(1);
  const span = y1 - y0;
  if (span < 1e-9) return c;
  return clamp01((f(c) - y0) / span);
}

/** Map γ in [0.35, 3] to a useful logistic steepness. */
function sigmoidK(gamma: number): number {
  const g = Math.min(3, Math.max(0.35, gamma));
  return 4 + (22 * (g - 0.35)) / (3 - 0.35);
}

/** Map γ to log curve sharpness. */
function logK(gamma: number): number {
  const g = Math.min(3, Math.max(0.35, gamma));
  return 2 + (28 * (g - 0.35)) / (3 - 0.35);
}

function logCompress(c: number, k: number): number {
  const kk = Math.max(0.01, k);
  return Math.log(1 + kk * c) / Math.log(1 + kk);
}

/** Piecewise linear with a knee at 0.5; endpoints 0 and 1. */
function piecewiseKnee(c: number): number {
  if (c <= 0.5) return 0.65 * c;
  return 0.325 + 1.35 * (c - 0.5);
}

/**
 * @param c — score already clamped to [0, 1]
 * @param gamma — same store slider as power curve; ignored for curves that do not use it
 */
export function applyRiskHeatmapTransfer(c: number, curve: RiskHeatmapCurveId, gamma: number): number {
  const t = clamp01(c);
  const g = Math.min(3, Math.max(0.35, gamma));

  switch (curve) {
    case 'linear':
      return t;
    case 'power':
      if (Math.abs(g - 1) < 1e-6) return t;
      return clamp01(Math.pow(t, g));
    case 'smoothstep':
      return t * t * (3 - 2 * t);
    case 'sigmoid':
      return normalizedSigmoid(t, sigmoidK(g));
    case 'log':
      return clamp01(logCompress(t, logK(g)));
    case 'ease_in_quad':
      return t * t;
    case 'ease_out_quad':
      return 1 - (1 - t) * (1 - t);
    case 'piecewise_knee':
      return clamp01(piecewiseKnee(t));
    default:
      return t;
  }
}
