import { PRESSURE_SURFACE_IDS, type PressureSurfaceId } from '@/domain/pressureSurfaces';
import type { SurfaceLoadSlice } from '@/domain/pressureSurfaces';
import { RISK_BANDS } from '@/lib/constants';
import type { CapacityRow } from './capacityModel';
import { DEFAULT_RISK_TUNING, normalizedRiskWeights, type RiskModelTuning } from './riskModelTuning';

export type RiskRow = CapacityRow & {
  tech_pressure: number;
  /**
   * Utilisation-style pressure from readiness-tagged loads only (change/BAU work).
   * Does not sum with `tech_sustain_pressure` to equal `tech_pressure` — totals use combined loads.
   */
  tech_readiness_pressure: number;
  /** Scheduled live / hypercare / on-call style loads (campaign `live_support_load` segment). */
  tech_sustain_pressure: number;
  store_pressure: number;
  campaign_risk: number;
  campaign_presence: number;
  risk_score: number;
  risk_band: string;
  /** True if public or school holiday (capacity scaling & optional combined-risk holiday term). */
  holiday_flag: boolean;
  public_holiday_flag: boolean;
  school_holiday_flag: boolean;
  campaign_active?: boolean;
  /** Utilisation-style tech pressure (0–1) decomposed by planning surface for explainability. */
  pressure_surfaces?: Record<PressureSurfaceId, number>;
  /** 1 − combined risk score (same blend as risk_score weights). */
  headroom?: number;
};

function componentTechPressure(input: {
  labL: number;
  teamL: number;
  backL: number;
  labsCap: number;
  teamsCap: number;
  backCap: number;
}): number {
  const labU = input.labsCap > 0 ? input.labL / input.labsCap : 0;
  const teamU = input.teamsCap > 0 ? input.teamL / input.teamsCap : 0;
  const backP = input.backCap > 0 ? Math.min(1, input.backL / input.backCap) : 0;
  return Math.min(1, Math.max(labU, teamU, backP * 0.5));
}

function techPressureFromSurfaceSlice(
  slice: SurfaceLoadSlice,
  labsCap: number,
  teamsCap: number,
  backCap: number
): number {
  const labL = slice.lab_readiness + slice.lab_sustain;
  const teamL = slice.team_readiness + slice.team_sustain;
  const backL = slice.backend_readiness + slice.backend_sustain;
  return componentTechPressure({
    labL,
    teamL,
    backL,
    labsCap,
    teamsCap,
    backCap,
  });
}

type PreRiskRow = CapacityRow & {
  store_pressure: number;
  campaign_active: boolean;
  campaign_risk: number;
  campaign_presence: number;
  holiday_flag: boolean;
  public_holiday_flag: boolean;
  school_holiday_flag: boolean;
};

export function computeRisk(rows: PreRiskRow[], tuning: RiskModelTuning = DEFAULT_RISK_TUNING): RiskRow[] {
  const w = normalizedRiskWeights(tuning);
  return rows.map((r) => {
    const lab = r.lab_utilisation ?? 0;
    const team = r.team_utilisation ?? 0;
    const backend = r.backend_pressure ?? 0;
    const tech_pressure = Math.min(1, Math.max(lab, team, backend * 0.5));
    const labsCap = r.labs_effective_cap ?? 0;
    const teamsCap = r.teams_effective_cap ?? 0;
    const backCap = r.backend_effective_cap ?? 0;
    const tech_readiness_pressure = componentTechPressure({
      labL: r.lab_load_readiness ?? 0,
      teamL: r.team_load_readiness ?? 0,
      backL: r.backend_load_readiness ?? 0,
      labsCap,
      teamsCap,
      backCap,
    });
    const tech_sustain_pressure = componentTechPressure({
      labL: r.lab_load_sustain ?? 0,
      teamL: r.team_load_sustain ?? 0,
      backL: r.backend_load_sustain ?? 0,
      labsCap,
      teamsCap,
      backCap,
    });
    const store_pressure = Math.min(1, r.store_pressure ?? 0);
    const campaign_risk = Math.min(1, r.campaign_risk ?? 0);
    const campaign_presence = r.campaign_presence ?? (r.campaign_active ? 1 : 0);
    const public_holiday_flag = Boolean(r.public_holiday_flag);
    const school_holiday_flag = Boolean(r.school_holiday_flag);
    const holiday_flag = Boolean(r.holiday_flag);
    const holiday_n = holiday_flag ? 1 : 0;

    const risk_score =
      w.tech * tech_pressure +
      w.store * store_pressure +
      w.campaign * campaign_risk +
      w.holiday * holiday_n;

    const pressure_surfaces = {} as Record<PressureSurfaceId, number>;
    for (const sid of PRESSURE_SURFACE_IDS) {
      const sl = r.surfaceTotals?.[sid];
      pressure_surfaces[sid] = sl
        ? Math.round(techPressureFromSurfaceSlice(sl, labsCap, teamsCap, backCap) * 100) / 100
        : 0;
    }
    const headroom = Math.round((1 - risk_score) * 100) / 100;

    let risk_band: string = RISK_BANDS.high.label;
    if (risk_score <= RISK_BANDS.low.max) risk_band = RISK_BANDS.low.label;
    else if (risk_score <= RISK_BANDS.medium.max) risk_band = RISK_BANDS.medium.label;

    return {
      ...r,
      tech_pressure: Math.round(tech_pressure * 100) / 100,
      tech_readiness_pressure: Math.round(tech_readiness_pressure * 100) / 100,
      tech_sustain_pressure: Math.round(tech_sustain_pressure * 100) / 100,
      store_pressure: Math.round(store_pressure * 100) / 100,
      campaign_risk: Math.round(campaign_risk * 100) / 100,
      campaign_presence,
      risk_score: Math.round(risk_score * 100) / 100,
      risk_band,
      holiday_flag,
      public_holiday_flag,
      school_holiday_flag,
      pressure_surfaces,
      headroom,
    };
  });
}
