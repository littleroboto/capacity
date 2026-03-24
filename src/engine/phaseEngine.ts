import type { PressureSurfaceId } from '@/domain/pressureSurfaces';
import { emptySurfaceSlice, emptySurfaceTotals, type SurfaceLoadSlice } from '@/domain/pressureSurfaces';
import { parseDate, type CalendarRow } from './calendar';
import type { CampaignConfig, MarketConfig, PhaseLoad } from './types';

const RHYTHM_LEVELS: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, very_high: 1 };
const DEFAULT_LIVE_SUPPORT_SCALE = 0.45;

function scalePhaseLoad(load: PhaseLoad, factor: number): PhaseLoad {
  const out: PhaseLoad = {};
  if (load.labs != null && Number.isFinite(load.labs)) out.labs = load.labs * factor;
  if (load.teams != null && Number.isFinite(load.teams)) out.teams = load.teams * factor;
  if (load.backend != null && Number.isFinite(load.backend)) out.backend = load.backend * factor;
  if (load.ops != null && Number.isFinite(load.ops)) out.ops = load.ops * factor;
  if (load.commercial != null && Number.isFinite(load.commercial)) out.commercial = load.commercial * factor;
  return out;
}

function liveSupportHasValues(ls: PhaseLoad | undefined): boolean {
  if (!ls) return false;
  return Object.values(ls).some((v) => v != null && Number.isFinite(v) && v !== 0);
}

/** Live segment load when `prepBeforeLiveDays` is used: explicit `live_support_load` or scaled `load`. */
function resolveLivePhaseLoad(camp: { load: PhaseLoad; live_support_load?: PhaseLoad; liveSupportScale?: number }): PhaseLoad {
  if (liveSupportHasValues(camp.live_support_load)) {
    return camp.live_support_load!;
  }
  const f = camp.liveSupportScale ?? DEFAULT_LIVE_SUPPORT_SCALE;
  return scalePhaseLoad(camp.load, f);
}

export type LoadBucket = 'readiness' | 'sustain';

export type ExpandedRow = {
  date: string;
  market: string;
  system: string;
  phase: string;
  /** Planning surface this row accrues to before windows / carryover. */
  surface: PressureSurfaceId;
  lab_load_readiness: number;
  lab_load_sustain: number;
  team_load_readiness: number;
  team_load_sustain: number;
  backend_load_readiness: number;
  backend_load_sustain: number;
  ops_load_readiness: number;
  ops_load_sustain: number;
  commercial_load_readiness: number;
  commercial_load_sustain: number;
};

export function addSliceToSurface(row: AggregatedDay, surface: PressureSurfaceId, slice: SurfaceLoadSlice): void {
  const t = row.surfaceTotals[surface];
  t.lab_readiness += slice.lab_readiness;
  t.lab_sustain += slice.lab_sustain;
  t.team_readiness += slice.team_readiness;
  t.team_sustain += slice.team_sustain;
  t.backend_readiness += slice.backend_readiness;
  t.backend_sustain += slice.backend_sustain;
  t.ops += slice.ops;
  t.commercial += slice.commercial;
}

export function recomputeAggregatedTotals(row: AggregatedDay): void {
  const s = row.surfaceTotals;
  row.lab_load_readiness =
    s.bau.lab_readiness +
    s.change.lab_readiness +
    s.campaign.lab_readiness +
    s.coordination.lab_readiness +
    s.carryover.lab_readiness;
  row.lab_load_sustain =
    s.bau.lab_sustain +
    s.change.lab_sustain +
    s.campaign.lab_sustain +
    s.coordination.lab_sustain +
    s.carryover.lab_sustain;
  row.team_load_readiness =
    s.bau.team_readiness +
    s.change.team_readiness +
    s.campaign.team_readiness +
    s.coordination.team_readiness +
    s.carryover.team_readiness;
  row.team_load_sustain =
    s.bau.team_sustain +
    s.change.team_sustain +
    s.campaign.team_sustain +
    s.coordination.team_sustain +
    s.carryover.team_sustain;
  row.backend_load_readiness =
    s.bau.backend_readiness +
    s.change.backend_readiness +
    s.campaign.backend_readiness +
    s.coordination.backend_readiness +
    s.carryover.backend_readiness;
  row.backend_load_sustain =
    s.bau.backend_sustain +
    s.change.backend_sustain +
    s.campaign.backend_sustain +
    s.coordination.backend_sustain +
    s.carryover.backend_sustain;
  row.ops_activity = s.bau.ops + s.change.ops + s.campaign.ops + s.coordination.ops + s.carryover.ops;
  row.commercial_activity =
    s.bau.commercial + s.change.commercial + s.campaign.commercial + s.coordination.commercial + s.carryover.commercial;
  row.lab_load = row.lab_load_readiness + row.lab_load_sustain;
  row.team_load = row.team_load_readiness + row.team_load_sustain;
  row.backend_load = row.backend_load_readiness + row.backend_load_sustain;
}

/** Whole calendar days from `day` until `goLive` (1 on the day before go-live). */
function wholeCalendarDaysBefore(day: Date, goLive: Date): number {
  const a = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const b = Date.UTC(goLive.getFullYear(), goLive.getMonth(), goLive.getDate());
  return Math.round((b - a) / 86_400_000);
}

function phaseLoadHasMass(pl: PhaseLoad): boolean {
  return (
    (pl.labs ?? 0) + (pl.teams ?? 0) + (pl.backend ?? 0) + (pl.ops ?? 0) + (pl.commercial ?? 0) >
    0
  );
}

/**
 * QSR-style prep: tech front-loaded with buffer before live; commercial in the pre-live month;
 * ops (supply) from a few weeks before go-live through prep only here — live ops come from `live_support_load`.
 */
function staggeredPrepSlice(camp: CampaignConfig, prepDays: number, dbl: number): PhaseLoad {
  /** Days with no tech load immediately before go-live (delivery buffer). */
  const techBuf = Math.min(Math.max(0, camp.techFinishBeforeLiveDays ?? 14), Math.max(0, prepDays - 1));
  /** Calendar span of tech build ending the day before `techBuf` countdown begins. */
  const maxTechSpan = Math.max(0, prepDays - techBuf);
  const techWork = Math.min(camp.techPrepDaysBeforeLive ?? 42, maxTechSpan);
  const inTech = dbl > techBuf && dbl <= techBuf + techWork;

  const mktPrep = Math.min(camp.marketingPrepDaysBeforeLive ?? 30, prepDays);
  const supPrep = Math.min(camp.supplyPrepDaysBeforeLive ?? 21, prepDays);
  const inMkt = dbl <= mktPrep && dbl >= 1;
  const inSupp = dbl <= supPrep && dbl >= 1;

  const piece: PhaseLoad = {};
  const L = camp.load;
  if (inTech) {
    if (L.labs != null) piece.labs = L.labs;
    if (L.teams != null) piece.teams = L.teams;
    if (L.backend != null) piece.backend = L.backend;
  }
  if (inMkt && L.commercial != null) piece.commercial = L.commercial;
  if (inSupp && L.ops != null) piece.ops = L.ops;
  return piece;
}

function sliceFromRow(r: ExpandedRow): SurfaceLoadSlice {
  const z = emptySurfaceSlice();
  z.lab_readiness = r.lab_load_readiness;
  z.lab_sustain = r.lab_load_sustain;
  z.team_readiness = r.team_load_readiness;
  z.team_sustain = r.team_load_sustain;
  z.backend_readiness = r.backend_load_readiness;
  z.backend_sustain = r.backend_load_sustain;
  z.ops = r.ops_load_readiness + r.ops_load_sustain;
  z.commercial = r.commercial_load_readiness + r.commercial_load_sustain;
  return z;
}

export function expandPhases(calendar: CalendarRow[], config: MarketConfig): ExpandedRow[] {
  const rows: ExpandedRow[] = [];
  const marketRows = calendar.filter((r) => r.market === config.market);

  const bauList = config.bau == null ? [] : Array.isArray(config.bau) ? config.bau : [config.bau];

  for (const { date, market } of marketRows) {
    const d = parseDate(date);
    const weekday = d.getDay();

    for (const bau of bauList) {
      if (!bau) continue;
      if (weekday === bau.weekday) {
        addLoad(rows, date, market, 'BAU', bau.name || 'bau', bau.load || {}, 1, 'readiness', 'bau');
      }
      if (bau.supportStart != null && weekday >= bau.supportStart && weekday <= bau.supportEnd) {
        addLoad(rows, date, market, 'BAU', 'support', bau.load || {}, 0.5, 'readiness', 'bau');
      }
    }

    const tr = config.techRhythm;
    if (tr?.weekly_pattern) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday];
      const levelKey = tr.weekly_pattern[dayName];
      if (levelKey != null) {
        const base = RHYTHM_LEVELS[String(levelKey).toLowerCase()] ?? 0.5;
        const labs = (tr.labs_scale ?? 2) * base;
        const teams = (tr.teams_scale ?? 1) * base;
        const backend = (tr.backend_scale ?? 0) * base;
        addLoad(
          rows,
          date,
          market,
          'TechRhythm',
          'weekly_pattern',
          { labs, teams, backend },
          1,
          'readiness',
          'bau'
        );
      }
    }

    for (const camp of config.campaigns || []) {
      if (!camp.start) continue;
      const campStart = parseDate(camp.start);
      const t = parseDate(date);
      const prepDays = camp.prepBeforeLiveDays;

      if (prepDays != null && prepDays > 0) {
        if (camp.presenceOnly) continue;
        const prepStart = new Date(campStart);
        prepStart.setDate(prepStart.getDate() - prepDays);
        const liveEnd = new Date(campStart);
        liveEnd.setDate(liveEnd.getDate() + camp.durationDays);
        if (t >= prepStart && t < campStart) {
          if (camp.staggerFunctionalLoads) {
            const dbl = wholeCalendarDaysBefore(t, campStart);
            const piece = staggeredPrepSlice(camp, prepDays, dbl);
            if (phaseLoadHasMass(piece)) {
              addLoad(rows, date, market, 'Campaign', `${camp.name}__prep`, piece, 1, 'readiness', 'change');
            }
          } else {
            addLoad(rows, date, market, 'Campaign', `${camp.name}__prep`, camp.load, 1, 'readiness', 'change');
          }
        } else if (camp.durationDays > 0 && t >= campStart && t < liveEnd) {
          const liveLoad = resolveLivePhaseLoad(camp);
          addLoad(rows, date, market, 'Campaign', camp.name, liveLoad, 1, 'sustain', 'campaign');
        }
        continue;
      }

      if (!camp.durationDays) continue;
      const end = new Date(campStart);
      end.setDate(end.getDate() + camp.durationDays);
      if (t >= campStart && t < end) {
        if (!camp.presenceOnly) {
          const dayIndex = Math.floor((t.getTime() - campStart.getTime()) / 86_400_000);
          const rd = camp.readinessDurationDays;
          const inReadiness = rd == null || dayIndex < rd;
          const phaseLoad: PhaseLoad = inReadiness ? camp.load : (camp.live_support_load ?? {});
          addLoad(
            rows,
            date,
            market,
            'Campaign',
            camp.name,
            phaseLoad,
            1,
            inReadiness ? 'readiness' : 'sustain',
            inReadiness ? 'change' : 'campaign'
          );
        }
      }
    }

    for (const rel of config.releases || []) {
      const deployDate = rel.deployDate ? parseDate(rel.deployDate) : inferDeployDate(calendar, config.market);
      if (!deployDate) continue;
      for (const sys of rel.systems) {
        for (const ph of rel.phases) {
          const phaseDate = new Date(deployDate);
          phaseDate.setDate(phaseDate.getDate() + ph.offsetDays);
          const phaseDateStr = formatDate(phaseDate);
          if (date === phaseDateStr) {
            addLoad(rows, date, market, sys, ph.name, rel.load, 1, 'readiness', 'change');
          }
        }
      }
    }
  }

  return rows;
}

function addLoad(
  rows: ExpandedRow[],
  date: string,
  market: string,
  system: string,
  phase: string,
  load: Record<string, number | undefined>,
  scale: number,
  bucket: LoadBucket,
  surface: PressureSurfaceId
): void {
  const lr = (load.labs || 0) * scale;
  const tr = (load.teams || 0) * scale;
  const br = (load.backend || 0) * scale;
  const or = (load.ops || 0) * scale;
  const cr = (load.commercial || 0) * scale;
  rows.push({
    date,
    market,
    system,
    phase,
    surface,
    lab_load_readiness: bucket === 'readiness' ? lr : 0,
    lab_load_sustain: bucket === 'sustain' ? lr : 0,
    team_load_readiness: bucket === 'readiness' ? tr : 0,
    team_load_sustain: bucket === 'sustain' ? tr : 0,
    backend_load_readiness: bucket === 'readiness' ? br : 0,
    backend_load_sustain: bucket === 'sustain' ? br : 0,
    ops_load_readiness: bucket === 'readiness' ? or : 0,
    ops_load_sustain: bucket === 'sustain' ? or : 0,
    commercial_load_readiness: bucket === 'readiness' ? cr : 0,
    commercial_load_sustain: bucket === 'sustain' ? cr : 0,
  });
}

function inferDeployDate(calendar: CalendarRow[], market: string): Date | null {
  const first = calendar.find((r) => r.market === market);
  if (!first) return null;
  const d = parseDate(first.date);
  d.setMonth(d.getMonth() + 2);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type AggregatedDay = {
  date: string;
  market: string;
  lab_load: number;
  team_load: number;
  backend_load: number;
  ops_activity: number;
  commercial_activity: number;
  lab_load_readiness: number;
  lab_load_sustain: number;
  team_load_readiness: number;
  team_load_sustain: number;
  backend_load_readiness: number;
  backend_load_sustain: number;
  surfaceTotals: Record<PressureSurfaceId, SurfaceLoadSlice>;
};

export function aggregateByDay(expanded: ExpandedRow[]): AggregatedDay[] {
  const byKey = new Map<string, AggregatedDay>();
  for (const r of expanded) {
    const key = `${r.date}\t${r.market}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        date: r.date,
        market: r.market,
        lab_load: 0,
        team_load: 0,
        backend_load: 0,
        ops_activity: 0,
        commercial_activity: 0,
        lab_load_readiness: 0,
        lab_load_sustain: 0,
        team_load_readiness: 0,
        team_load_sustain: 0,
        backend_load_readiness: 0,
        backend_load_sustain: 0,
        surfaceTotals: emptySurfaceTotals(),
      };
      byKey.set(key, row);
    }
    addSliceToSurface(row, r.surface, sliceFromRow(r));
    recomputeAggregatedTotals(row);
  }
  return Array.from(byKey.values());
}
