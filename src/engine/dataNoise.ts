import { RISK_BANDS } from '@/lib/constants';
import type { RiskRow } from './riskModel';

/** Half-width of risk_score jitter (0–1 scale). Deterministic per day × market. */
export const RISK_SCORE_NOISE_AMPLITUDE = 0.028;

/** Stable [0, 1) from string (FNV-1a-ish + sin mix). */
function stableUnit(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const t = Math.sin((h >>> 0) * 0.0001) * 10000;
  return t - Math.floor(t);
}

function bandForRisk(risk_score: number): string {
  if (risk_score <= RISK_BANDS.low.max) return RISK_BANDS.low.label;
  if (risk_score <= RISK_BANDS.medium.max) return RISK_BANDS.medium.label;
  return RISK_BANDS.high.label;
}

/**
 * Light operational “texture” on combined risk for visualization.
 * Same inputs → same outputs (no flicker on re-render).
 */
export function withOperationalNoise(rows: RiskRow[], amplitude = RISK_SCORE_NOISE_AMPLITUDE): RiskRow[] {
  return rows.map((r) => {
    const u = stableUnit(`${r.date}|${r.market}`);
    const delta = (u - 0.5) * 2 * amplitude;
    let risk_score = Math.min(1, Math.max(0, r.risk_score + delta));
    risk_score = Math.round(risk_score * 100) / 100;
    let tech_pressure = Math.min(1, Math.max(0, r.tech_pressure + delta));
    tech_pressure = Math.round(tech_pressure * 100) / 100;
    return {
      ...r,
      risk_score,
      tech_pressure,
      risk_band: bandForRisk(risk_score),
    };
  });
}
