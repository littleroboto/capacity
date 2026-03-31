import type { PressureSurfaceId } from '@/domain/pressureSurfaces';
import { emptySurfaceSlice, emptySurfaceTotals, type SurfaceLoadSlice } from '@/domain/pressureSurfaces';
import { TRADING_MONTH_KEYS } from '@/lib/tradingMonthlyDsl';
import { campaignLoadBearingPrepLiveForDate } from './campaignPrepLive';
import { parseDate, type CalendarRow } from './calendar';
import type { CampaignConfig, MarketConfig, PhaseLoad } from './types';

const DEFAULT_LIVE_SUPPORT_SCALE = 0.45;

/**
 * Applied to labs/teams/backend on campaign **live** (sustain) only — keeps stores/marketing ops realistic
 * while tech heat drops after go-live (e.g. Monopoly December). Ops/commercial untouched.
 * Per-campaign {@link CampaignConfig.liveTechLoadScale} overrides; use `1` to disable dampening.
 */
const DEFAULT_CAMPAIGN_LIVE_TECH_LOAD_SCALE = 0.55;

function scaleCampaignLiveTechBuckets(load: PhaseLoad, explicitScale?: number): PhaseLoad {
  const factor =
    explicitScale != null && Number.isFinite(explicitScale) && explicitScale >= 0
      ? Math.min(2.5, explicitScale)
      : DEFAULT_CAMPAIGN_LIVE_TECH_LOAD_SCALE;
  const out: PhaseLoad = { ...load };
  if (out.labs != null && Number.isFinite(out.labs)) out.labs *= factor;
  if (out.teams != null && Number.isFinite(out.teams)) out.teams *= factor;
  if (out.backend != null && Number.isFinite(out.backend)) out.backend *= factor;
  return out;
}

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

function phaseLoadTechMass(pl: PhaseLoad): boolean {
  return (pl.labs ?? 0) + (pl.teams ?? 0) + (pl.backend ?? 0) > 0;
}

/** Tech programmes never apply ops/commercial; strip if present in YAML. */
function techOnlyPhaseLoad(pl: PhaseLoad): PhaseLoad {
  const out: PhaseLoad = {};
  if (pl.labs != null) out.labs = pl.labs;
  if (pl.teams != null) out.teams = pl.teams;
  if (pl.backend != null) out.backend = pl.backend;
  return out;
}

/**
 * Campaign **live** (sustain) load attributed to `date`, matching {@link expandPhases} live branches, or **null**
 * if this campaign adds no load-bearing live row that day. Used for `replacesBauTech` during the live window.
 */
function campaignLivePhaseLoadForDate(camp: CampaignConfig, date: string): PhaseLoad | null {
  if (!camp.start || camp.presenceOnly) return null;
  const seg = campaignLoadBearingPrepLiveForDate(camp, date);
  if (!seg.inLiveLoaded) return null;

  const prepDays = camp.prepBeforeLiveDays;
  if (prepDays != null && prepDays > 0) {
    return scaleCampaignLiveTechBuckets(resolveLivePhaseLoad(camp), camp.liveTechLoadScale);
  }

  if (!camp.durationDays) return null;
  if (seg.inPrepLoaded) return null;
  const phaseLoad: PhaseLoad = camp.live_support_load ?? {};
  const sustainLoad =
    !liveSupportHasValues(camp.live_support_load)
      ? phaseLoad
      : scaleCampaignLiveTechBuckets(phaseLoad, camp.liveTechLoadScale);
  return sustainLoad;
}

/**
 * Campaign **prep** (readiness) load attributed to `date`, or **null** if this campaign adds no prep row that day.
 * Used for `replacesBauTech` (same delivery pipe as recurring tech / BAU lab work).
 */
function campaignPrepPhaseLoadForDate(camp: CampaignConfig, date: string): PhaseLoad | null {
  if (!camp.start || camp.presenceOnly) return null;
  const t = parseDate(date);
  const campStart = parseDate(camp.start);
  const prepDays = camp.prepBeforeLiveDays;

  if (prepDays != null && prepDays > 0) {
    const seg = campaignLoadBearingPrepLiveForDate(camp, date);
    if (!seg.inPrepLoaded) return null;
    if (camp.staggerFunctionalLoads) {
      const dbl = wholeCalendarDaysBefore(t, campStart);
      const piece = staggeredPrepSlice(camp, prepDays, dbl);
      if (!phaseLoadHasMass(piece)) return null;
      return piece;
    }
    return camp.load;
  }

  if (!camp.durationDays) return null;
  const segInterval = campaignLoadBearingPrepLiveForDate(camp, date);
  if (!segInterval.inCampaignWindow || !segInterval.inPrepLoaded) return null;
  return camp.load;
}

function anyReplacingCampaignPrepTechMass(config: MarketConfig, date: string): boolean {
  for (const camp of config.campaigns || []) {
    if (!camp.replacesBauTech) continue;
    const pl = campaignPrepPhaseLoadForDate(camp, date);
    if (pl && phaseLoadTechMass(pl)) return true;
  }
  for (const tp of config.techProgrammes || []) {
    if (!tp.replacesBauTech) continue;
    const pl = campaignPrepPhaseLoadForDate(tp as CampaignConfig, date);
    if (pl && phaseLoadTechMass(techOnlyPhaseLoad(pl))) return true;
  }
  return false;
}

function anyReplacingCampaignLiveTechMass(config: MarketConfig, date: string): boolean {
  for (const camp of config.campaigns || []) {
    if (!camp.replacesBauTech) continue;
    const pl = campaignLivePhaseLoadForDate(camp, date);
    if (pl && phaseLoadTechMass(pl)) return true;
  }
  for (const tp of config.techProgrammes || []) {
    if (!tp.replacesBauTech) continue;
    const pl = campaignLivePhaseLoadForDate(tp as CampaignConfig, date);
    if (pl && phaseLoadTechMass(techOnlyPhaseLoad(pl))) return true;
  }
  return false;
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
    const stripBauTechBuckets =
      anyReplacingCampaignPrepTechMass(config, date) || anyReplacingCampaignLiveTechMass(config, date);

    for (const bau of bauList) {
      if (!bau) continue;
      const rawBau = bau.load || {};
      const bauLoad: PhaseLoad = stripBauTechBuckets
        ? { ...rawBau, labs: 0, teams: 0, backend: 0 }
        : rawBau;
      if (weekday === bau.weekday) {
        if (phaseLoadHasMass(bauLoad)) {
          addLoad(rows, date, market, 'BAU', bau.name || 'bau', bauLoad, 1, 'readiness', 'bau');
        }
      }
      if (
        bau.supportStart != null &&
        bau.supportEnd != null &&
        weekday >= bau.supportStart &&
        weekday <= bau.supportEnd
      ) {
        if (phaseLoadHasMass(bauLoad)) {
          addLoad(rows, date, market, 'BAU', 'support', bauLoad, 0.5, 'readiness', 'bau');
        }
      }
    }

    const tr = config.techRhythm;
    if (tr?.weekly_pattern && !stripBauTechBuckets) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday];
      const baseRaw = tr.weekly_pattern[dayName];
      if (baseRaw != null && Number.isFinite(baseRaw)) {
        const base = Math.min(1, Math.max(0, baseRaw));
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

    if (tr?.support_weekly_pattern && !stripBauTechBuckets) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday];
      const baseRaw = tr.support_weekly_pattern[dayName];
      if (baseRaw != null && Number.isFinite(baseRaw)) {
        const base = Math.min(1, Math.max(0, baseRaw));
        const monthKey = TRADING_MONTH_KEYS[d.getMonth()]!;
        const mmRaw = tr.support_monthly_pattern?.[monthKey];
        const monthMult =
          mmRaw != null && Number.isFinite(mmRaw) ? Math.min(1, Math.max(0, mmRaw)) : 1;
        const scale = tr.support_teams_scale ?? 1;
        const teams = scale * base * monthMult;
        if (teams > 1e-9) {
          addLoad(
            rows,
            date,
            market,
            'TechRhythm',
            'support_pattern',
            { labs: 0, teams, backend: 0 },
            1,
            'readiness',
            'bau'
          );
        }
      }
    }

    for (const camp of config.campaigns || []) {
      if (!camp.start) continue;
      const campStart = parseDate(camp.start);
      const t = parseDate(date);
      const prepDays = camp.prepBeforeLiveDays;

      if (prepDays != null && prepDays > 0) {
        if (camp.presenceOnly) continue;
        const seg = campaignLoadBearingPrepLiveForDate(camp, date);
        if (seg.inPrepLoaded) {
          if (camp.staggerFunctionalLoads) {
            const dbl = wholeCalendarDaysBefore(t, campStart);
            const piece = staggeredPrepSlice(camp, prepDays, dbl);
            if (phaseLoadHasMass(piece)) {
              addLoad(rows, date, market, 'Campaign', `${camp.name}__prep`, piece, 1, 'readiness', 'change');
            }
          } else {
            addLoad(rows, date, market, 'Campaign', `${camp.name}__prep`, camp.load, 1, 'readiness', 'change');
          }
        } else if (seg.inLiveLoaded) {
          const liveLoad = scaleCampaignLiveTechBuckets(resolveLivePhaseLoad(camp), camp.liveTechLoadScale);
          addLoad(rows, date, market, 'Campaign', camp.name, liveLoad, 1, 'sustain', 'campaign');
        }
        continue;
      }

      if (!camp.durationDays) continue;
      const segInterval = campaignLoadBearingPrepLiveForDate(camp, date);
      if (!segInterval.inCampaignWindow || camp.presenceOnly) continue;
      const inReadiness = segInterval.inPrepLoaded;
      const phaseLoad: PhaseLoad = inReadiness ? camp.load : (camp.live_support_load ?? {});
      const sustainLoad =
        inReadiness || !liveSupportHasValues(camp.live_support_load)
          ? phaseLoad
          : scaleCampaignLiveTechBuckets(phaseLoad, camp.liveTechLoadScale);
      addLoad(
        rows,
        date,
        market,
        'Campaign',
        camp.name,
        inReadiness ? phaseLoad : sustainLoad,
        1,
        inReadiness ? 'readiness' : 'sustain',
        inReadiness ? 'change' : 'campaign'
      );
    }

    for (const tp of config.techProgrammes || []) {
      if (!tp.start) continue;
      const prepDaysTp = tp.prepBeforeLiveDays;

      if (prepDaysTp != null && prepDaysTp > 0) {
        const segTp = campaignLoadBearingPrepLiveForDate(tp, date);
        if (segTp.inPrepLoaded) {
          addLoad(
            rows,
            date,
            market,
            'TechProgramme',
            `${tp.name}__prep`,
            techOnlyPhaseLoad(tp.load),
            1,
            'readiness',
            'change'
          );
        } else if (segTp.inLiveLoaded) {
          const liveLoadTp = scaleCampaignLiveTechBuckets(
            resolveLivePhaseLoad(tp),
            tp.liveTechLoadScale ?? 1
          );
          addLoad(
            rows,
            date,
            market,
            'TechProgramme',
            tp.name,
            techOnlyPhaseLoad(liveLoadTp),
            1,
            'sustain',
            'change'
          );
        }
        continue;
      }

      if (!tp.durationDays) continue;
      const segIntervalTp = campaignLoadBearingPrepLiveForDate(tp, date);
      if (!segIntervalTp.inCampaignWindow) continue;
      const inReadinessTp = segIntervalTp.inPrepLoaded;
      const phaseLoadTp: PhaseLoad = inReadinessTp ? tp.load : (tp.live_support_load ?? {});
      const sustainLoadTp =
        inReadinessTp || !liveSupportHasValues(tp.live_support_load)
          ? phaseLoadTp
          : scaleCampaignLiveTechBuckets(phaseLoadTp, tp.liveTechLoadScale ?? 1);
      addLoad(
        rows,
        date,
        market,
        'TechProgramme',
        tp.name,
        techOnlyPhaseLoad(inReadinessTp ? phaseLoadTp : sustainLoadTp),
        1,
        inReadinessTp ? 'readiness' : 'sustain',
        'change'
      );
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
