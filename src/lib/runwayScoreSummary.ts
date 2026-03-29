import type { RiskRow } from '@/engine/riskModel';
import { STORE_PRESSURE_MAX } from '@/engine/riskModelTuning';
import { isGregorianChristmasDay } from '@/engine/weighting';
import type { ViewModeId } from '@/lib/constants';

function pctStorePressure(x: number): number {
  return Math.round(Math.min(STORE_PRESSURE_MAX, Math.max(0, x)) * 100);
}

export type RunwayDriverBlock = { heading: string; bullets: string[] };

/** Grouped “what’s causing it” — copy branches by runway lens (Technology vs Business). */
export function buildDriverSummaryBlocks(
  viewMode: ViewModeId,
  row: RiskRow,
  activeCampaigns: string[],
  activeTechProgrammes: string[],
  operatingWindows: string[],
  bauToday: string[],
  storeTradingLine: string | null,
  techExplanation: string,
  pressureSurfaceLines: string[]
): RunwayDriverBlock[] {
  const blocks: RunwayDriverBlock[] = [];
  const techLens = viewMode !== 'in_store';

  const campBullets: string[] = [];
  if (activeCampaigns.length) {
    campBullets.push(...activeCampaigns.slice(0, 6));
  }
  if (row.campaign_in_live) {
    campBullets.push(
      techLens
        ? 'Live campaign: engineering sustain load is on (labs/teams/backend). Combined risk elsewhere still reflects store uplift.'
        : 'Live campaign: busier restaurants here when YAML applies a live store boost; pipeline effects are in the store curve.'
    );
  }
  if (row.campaign_in_prep && !row.campaign_in_live) {
    campBullets.push(
      techLens
        ? 'Prep phase: readiness and change work loads delivery capacity before go-live.'
        : 'Prep phase: this lens stays on restaurant busyness—marketing prep is not mixed in unless your YAML uses a prep store multiplier on the store curve.'
    );
  }
  if (!campBullets.length) {
    campBullets.push('No campaigns cover this day in the market file.');
  }
  blocks.push({ heading: 'Campaigns', bullets: campBullets });

  const holBullets: string[] = [];
  if (row.public_holiday_flag) {
    holBullets.push(
      techLens
        ? 'Public holiday — staffing and effective lab/team capacity follow holiday rules in the engine.'
        : 'Public holiday — closures and trading pattern follow holiday settings (often lower footfall).'
    );
  }
  if (row.school_holiday_flag) {
    holBullets.push(
      techLens
        ? 'School break — load multipliers and capacity pinch may apply per market YAML.'
        : 'School break — often busier family trading or different staffing in the model.'
    );
  }
  if (row.holiday_flag && !isGregorianChristmasDay(row.date)) {
    holBullets.push(
      techLens
        ? 'Holiday factor is on — can add weight in combined risk; check capacity multipliers.'
        : 'Holiday period — may already shape the store curve (e.g. closures); not a separate heatmap dial in this lens.'
    );
  }
  if (!holBullets.length) {
    holBullets.push('No public or school holiday flags for this day.');
  }
  blocks.push({ heading: 'Holidays', bullets: holBullets });

  if (techLens) {
    const resBullets = [techExplanation];
    if (activeTechProgrammes.length) {
      resBullets.push(
        'Tech programmes (patching, POS, infra) add engineering load but do not increase store or campaign uplift in the model.'
      );
      resBullets.push(...activeTechProgrammes.slice(0, 4));
    }
    const topSurfaces = pressureSurfaceLines
      .slice(0, 3)
      .map((l) => l.replace(/\s*\(max of lab\/team\/backend blend\)\s*$/, ''));
    if (topSurfaces.length) resBullets.push(...topSurfaces.map((s) => `Where the work sits: ${s}`));
    if (operatingWindows.length) {
      resBullets.push('Special windows today can bump lab, team, backend, or store levels.');
      resBullets.push(...operatingWindows.slice(0, 3));
    }
    if (bauToday.length) resBullets.push(...bauToday.map((b) => `Routine work: ${b}`));
    if (storeTradingLine) {
      resBullets.push(`Store / restaurant rhythm (context for planning, not the Technology heatmap): ${storeTradingLine}`);
    }
    blocks.push({ heading: 'Delivery & capacity', bullets: resBullets });
  } else {
    const storeBullets: string[] = [];
    if (storeTradingLine) storeBullets.push(storeTradingLine);
    const base = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_trading_base ?? row.store_pressure ?? 0));
    const boosted = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_pressure ?? 0));
    const basePct = pctStorePressure(base);
    const boostPct = pctStorePressure(boosted);
    if (Math.abs(boosted - base) > 0.04) {
      storeBullets.push(
        `Base store rhythm ~${basePct}% in the model → after campaigns and shaping ~${boostPct}% (trading pressure).`
      );
    } else {
      storeBullets.push(`Store activity in the model: about ${boostPct}%.`);
    }
    if (operatingWindows.length) {
      storeBullets.push('These windows adjust load or how tight capacity feels:');
      storeBullets.push(...operatingWindows.slice(0, 4));
    }
    if (bauToday.length) {
      storeBullets.push('Usual weekly BAU peaks or support:');
      storeBullets.push(...bauToday.slice(0, 4));
    }
    blocks.push({ heading: 'Stores & trading rhythm', bullets: storeBullets });
  }

  return blocks;
}
