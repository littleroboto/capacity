const STORAGE_KEY = 'cpm.runway.programmeGanttPrefs.v1';
const OPEN_KEY = 'cpm.runway.programmeGanttOpen.v1';

export type ProgrammeGanttDisplayPrefs = {
  barHeightPx: number;
  laneGapPx: number;
  stripTopPadPx: number;
  stripBottomPadPx: number;
  campaignFill: string;
  campaignStroke: string;
  techFill: string;
  techStroke: string;
  blackoutFill: string;
  blackoutHatchOpacity: number;
  schoolFill: string;
  schoolHatchOpacity: number;
  barOpacity: number;
  showBlackouts: boolean;
  showSchoolHolidays: boolean;
};

export const RUNWAY_PROGRAMME_GANTT_DEFAULT_PREFS: ProgrammeGanttDisplayPrefs = {
  barHeightPx: 12,
  laneGapPx: 5,
  stripTopPadPx: 4,
  stripBottomPadPx: 6,
  campaignFill: 'rgba(244, 63, 94, 0.22)',
  campaignStroke: 'rgba(190, 24, 93, 0.85)',
  techFill: 'rgba(59, 130, 246, 0.2)',
  techStroke: 'rgba(29, 78, 216, 0.88)',
  blackoutFill: 'rgba(24, 24, 27, 0.12)',
  blackoutHatchOpacity: 0.55,
  schoolFill: 'rgba(139, 92, 246, 0.1)',
  schoolHatchOpacity: 0.5,
  barOpacity: 0.92,
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
  return {
    barHeightPx: clamp(Number(p.barHeightPx) || d.barHeightPx, 6, 28),
    laneGapPx: clamp(Number(p.laneGapPx) || d.laneGapPx, 2, 16),
    stripTopPadPx: clamp(Number(p.stripTopPadPx) || d.stripTopPadPx, 0, 24),
    stripBottomPadPx: clamp(Number(p.stripBottomPadPx) || d.stripBottomPadPx, 0, 24),
    campaignFill: typeof p.campaignFill === 'string' ? p.campaignFill : d.campaignFill,
    campaignStroke: typeof p.campaignStroke === 'string' ? p.campaignStroke : d.campaignStroke,
    techFill: typeof p.techFill === 'string' ? p.techFill : d.techFill,
    techStroke: typeof p.techStroke === 'string' ? p.techStroke : d.techStroke,
    blackoutFill: typeof p.blackoutFill === 'string' ? p.blackoutFill : d.blackoutFill,
    blackoutHatchOpacity: clamp(Number(p.blackoutHatchOpacity) ?? d.blackoutHatchOpacity, 0.1, 1),
    schoolFill: typeof p.schoolFill === 'string' ? p.schoolFill : d.schoolFill,
    schoolHatchOpacity: clamp(Number(p.schoolHatchOpacity) ?? d.schoolHatchOpacity, 0.1, 1),
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
