const STORAGE_KEY = 'cpm.runway.programmeGanttPrefs.v1';
const OPEN_KEY = 'cpm.runway.programmeGanttOpen.v1';

export type ProgrammeGanttDisplayPrefs = {
  barHeightPx: number;
  laneGapPx: number;
  stripTopPadPx: number;
  stripBottomPadPx: number;
  /** Solid bar colour (no stroke). */
  campaignFill: string;
  techFill: string;
  /** Very subtle column wash under 45° hatch. */
  overlayColumnFill: string;
  /** Opacity of 45° light-grey hatch lines (shared blackout / school). */
  overlayHatchOpacity: number;
  barOpacity: number;
  showBlackouts: boolean;
  showSchoolHolidays: boolean;
};

export const RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS: ProgrammeGanttDisplayPrefs = {
  barHeightPx: 12,
  laneGapPx: 5,
  stripTopPadPx: 4,
  stripBottomPadPx: 6,
  campaignFill: '#e11d48',
  techFill: '#2563eb',
  overlayColumnFill: 'rgba(228, 228, 231, 0.45)',
  overlayHatchOpacity: 0.35,
  barOpacity: 1,
  showBlackouts: true,
  showSchoolHolidays: true,
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
    showBlackouts: typeof p.showBlackouts === 'boolean' ? p.showBlackouts : d.showBlackouts,
    showSchoolHolidays: typeof p.showSchoolHolidays === 'boolean' ? p.showSchoolHolidays : d.showSchoolHolidays,
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
