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
