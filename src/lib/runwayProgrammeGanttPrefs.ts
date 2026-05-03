const STORAGE_KEY = 'cpm.runway.programmeGanttPrefs.v1';
const OPEN_KEY = 'cpm.runway.programmeGanttOpen.v1';

export type ProgrammeGanttDisplayPrefs = {
  barHeightPx: number;
  laneGapPx: number;
  stripTopPadPx: number;
  stripBottomPadPx: number;
  /** Solid bar fill (outline is drawn in the strip: 1px grey, non-scaling). */
  campaignFill: string;
  techFill: string;
  /** Very subtle column wash under 45° hatch. */
  overlayColumnFill: string;
  /** Opacity of 45° light-grey hatch lines (shared blackout / school). */
  overlayHatchOpacity: number;
  barOpacity: number;
  /**
   * Programme bar hatch: square tile size in px (45° diagonal; line through tile centre).
   * Same geometry as the default 3×3 overlay hatch, scaled when this value changes.
   */
  barHatchSpacingPx: number;
  /** How strong the 45° hatch reads on top of the bar fill (0 = solid fill only). */
  barHatchOpacity: number;
  /** When true, trailing label includes ISO date span after the name (`Name · start–end`). */
  showBarTrailingCaption: boolean;
  showBlackouts: boolean;
  showSchoolHolidays: boolean;
  /**
   * Horizontal timeline zoom for the programme strip (1 = native cell scale).
   * Persisted so slide prep can reopen at the same magnification.
   */
  timelineZoom: number;
  /**
   * Programme tech chart: three 7-day smoothed traces (technology utilization, restaurant / trading, deployment
   * risk); each line uses its own in-window min/max stretch in the band for readable qualitative shapes.
   */
  showGanttUnifiedThreeLineSparkline: boolean;
};

export const RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS: ProgrammeGanttDisplayPrefs = {
  barHeightPx: 15,
  laneGapPx: 5,
  stripTopPadPx: 8,
  stripBottomPadPx: 6,
  /** `rgb(199, 244, 240)` — mint campaign bars. */
  campaignFill: '#c7f4f0',
  /** `rgb(255, 255, 255)` — white tech bars. */
  techFill: '#ffffff',
  /** Column wash under 45° hatch (school / blackout overlay columns). */
  overlayColumnFill: 'rgba(24, 24, 27, 0.12)',
  /** School-holiday (and shared overlay) hatch line strength — 0–1. */
  overlayHatchOpacity: 0.5,
  barOpacity: 1,
  barHatchSpacingPx: 3,
  /** Programme bar diagonal hatch strength — 0–1. */
  barHatchOpacity: 0.5,
  showBarTrailingCaption: false,
  showBlackouts: false,
  showSchoolHolidays: false,
  timelineZoom: 1,
  /** On by default so workbench strip + programme chart show tech, trading, and risk traces together. */
  showGanttUnifiedThreeLineSparkline: true,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readJson(): Partial<ProgrammeGanttDisplayPrefs> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ProgrammeGanttDisplayPrefs>;
  } catch {
    return null;
  }
}

export function loadProgrammeGanttPrefs(): ProgrammeGanttDisplayPrefs {
  const p = readJson();
  if (!p) return { ...RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS };
  const d = RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS;
  const legacyAny = p as Record<string, unknown>;
  const overlayFill =
    typeof p.overlayColumnFill === 'string'
      ? p.overlayColumnFill
      : typeof legacyAny.blackoutFill === 'string'
        ? (legacyAny.blackoutFill as string)
        : d.overlayColumnFill;
  const hatchOpRaw =
    typeof p.overlayHatchOpacity === 'number'
      ? p.overlayHatchOpacity
      : typeof legacyAny.blackoutHatchOpacity === 'number'
        ? (legacyAny.blackoutHatchOpacity as number)
        : typeof legacyAny.schoolHatchOpacity === 'number'
          ? (legacyAny.schoolHatchOpacity as number)
          : d.overlayHatchOpacity;
  const ho = Number(hatchOpRaw);

  return {
    barHeightPx: clamp(Number(p.barHeightPx) || d.barHeightPx, 6, 28),
    laneGapPx: clamp(Number(p.laneGapPx) || d.laneGapPx, 2, 16),
    stripTopPadPx: clamp(Number(p.stripTopPadPx) || d.stripTopPadPx, 0, 24),
    stripBottomPadPx: clamp(Number(p.stripBottomPadPx) || d.stripBottomPadPx, 0, 24),
    campaignFill: typeof p.campaignFill === 'string' ? p.campaignFill : d.campaignFill,
    techFill: typeof p.techFill === 'string' ? p.techFill : d.techFill,
    overlayColumnFill: overlayFill,
    overlayHatchOpacity: Number.isFinite(ho) ? clamp(ho, 0.08, 1) : d.overlayHatchOpacity,
    barOpacity: clamp(Number(p.barOpacity) ?? d.barOpacity, 0.25, 1),
    barHatchSpacingPx: clamp(Number(p.barHatchSpacingPx) || d.barHatchSpacingPx, 2, 14),
    barHatchOpacity: clamp(Number(p.barHatchOpacity) ?? d.barHatchOpacity, 0, 1),
    showBarTrailingCaption:
      typeof p.showBarTrailingCaption === 'boolean' ? p.showBarTrailingCaption : d.showBarTrailingCaption,
    showBlackouts: typeof p.showBlackouts === 'boolean' ? p.showBlackouts : d.showBlackouts,
    showSchoolHolidays: typeof p.showSchoolHolidays === 'boolean' ? p.showSchoolHolidays : d.showSchoolHolidays,
    timelineZoom: clamp(Number(p.timelineZoom) || d.timelineZoom, 0.35, 3.5),
    showGanttUnifiedThreeLineSparkline: (() => {
      if (typeof p.showGanttUnifiedThreeLineSparkline === 'boolean') {
        return p.showGanttUnifiedThreeLineSparkline;
      }
      const hadTrading =
        Object.prototype.hasOwnProperty.call(legacyAny, 'showGanttTradingSparkline') &&
        legacyAny.showGanttTradingSparkline === true;
      const hadRisk =
        Object.prototype.hasOwnProperty.call(legacyAny, 'showGanttRiskSparkline') &&
        legacyAny.showGanttRiskSparkline === true;
      if (hadTrading || hadRisk) return true;
      return d.showGanttUnifiedThreeLineSparkline;
    })(),
  };
}

export function saveProgrammeGanttPrefs(prefs: ProgrammeGanttDisplayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function loadProgrammeGanttOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function saveProgrammeGanttOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Fired after programme display prefs are written to `localStorage` so open {@link RunwayProgrammeGanttBlock} UIs can resync. */
export const PROGRAMME_GANTT_PREFS_CHANGED_EVENT = 'capacity:programme-gantt-prefs-changed';

export function notifyProgrammeGanttPrefsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROGRAMME_GANTT_PREFS_CHANGED_EVENT));
}
