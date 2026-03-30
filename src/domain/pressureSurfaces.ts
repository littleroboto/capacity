/**
 * Layered systemic pressure surfaces. Event-sourced surfaces are tagged in the phase engine;
 * `coordination` is derived from operating-window stress in the pipeline; `carryover` is backlog spill.
 */
export const PRESSURE_SURFACE_IDS = ['bau', 'change', 'campaign', 'coordination', 'carryover'] as const;
export type PressureSurfaceId = (typeof PRESSURE_SURFACE_IDS)[number];

/** Per-surface load splits (same shape as aggregated tech/business buckets). */
export type SurfaceLoadSlice = {
  lab_readiness: number;
  lab_sustain: number;
  team_readiness: number;
  team_sustain: number;
  backend_readiness: number;
  backend_sustain: number;
  ops: number;
  commercial: number;
};

export function emptySurfaceSlice(): SurfaceLoadSlice {
  return {
    lab_readiness: 0,
    lab_sustain: 0,
    team_readiness: 0,
    team_sustain: 0,
    backend_readiness: 0,
    backend_sustain: 0,
    ops: 0,
    commercial: 0,
  };
}

export function emptySurfaceTotals(): Record<PressureSurfaceId, SurfaceLoadSlice> {
  return {
    bau: emptySurfaceSlice(),
    change: emptySurfaceSlice(),
    campaign: emptySurfaceSlice(),
    coordination: emptySurfaceSlice(),
    carryover: emptySurfaceSlice(),
  };
}

/** Sum readiness + sustain labs/teams/backend/ops/commercial across slices (used for tech subset metrics). */
export function mergeSurfaceSlices(...slices: SurfaceLoadSlice[]): SurfaceLoadSlice {
  const out = emptySurfaceSlice();
  for (const s of slices) {
    out.lab_readiness += s.lab_readiness;
    out.lab_sustain += s.lab_sustain;
    out.team_readiness += s.team_readiness;
    out.team_sustain += s.team_sustain;
    out.backend_readiness += s.backend_readiness;
    out.backend_sustain += s.backend_sustain;
    out.ops += s.ops;
    out.commercial += s.commercial;
  }
  return out;
}
