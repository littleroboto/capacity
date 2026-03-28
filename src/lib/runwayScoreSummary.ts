import type { RiskRow } from '@/engine/riskModel';
import { STORE_PRESSURE_MAX } from '@/engine/riskModelTuning';
import { isGregorianChristmasDay } from '@/engine/weighting';
import type { ViewModeId } from '@/lib/constants';

function pctStorePressure(x: number): number {
  return Math.round(Math.min(STORE_PRESSURE_MAX, Math.max(0, x)) * 100);
}

export type RunwayDriverBlock = { heading: string; bullets: string[] };

/** Grouped “what’s causing it” for campaigns, holidays, and load/resourcing. */
export function buildDriverSummaryBlocks(
  viewMode: ViewModeId,
  row: RiskRow,
  activeCampaigns: string[],
  operatingWindows: string[],
  bauToday: string[],
  storeTradingLine: string | null,
  techExplanation: string,
  pressureSurfaceLines: string[]
): RunwayDriverBlock[] {
  const blocks: RunwayDriverBlock[] = [];

  const campBullets: string[] = [];
  if (activeCampaigns.length) {
    campBullets.push(...activeCampaigns.slice(0, 6));
  }
  if (row.campaign_in_live) {
    campBullets.push('Campaign is live — store and pipeline demand are turned up in the model.');
  }
  if (row.campaign_in_prep && !row.campaign_in_live) {
    campBullets.push('Campaign prep is running — marketing load counts toward trading pressure until go-live.');
  }
  if (!campBullets.length) {
    campBullets.push('No campaigns cover this day in the market file.');
  }
  blocks.push({ heading: 'Campaigns', bullets: campBullets });

  const holBullets: string[] = [];
  if (row.public_holiday_flag) holBullets.push('Public holiday — store and staffing rules follow the holiday settings.');
  if (row.school_holiday_flag) holBullets.push('School break — can raise load or tighten capacity in the model.');
  if (row.holiday_flag && !isGregorianChristmasDay(row.date)) {
    holBullets.push('Holiday factor is on — trading pressure can get extra weight on top of stores and campaigns.');
  }
  if (!holBullets.length) {
    holBullets.push('No public or school holiday flags for this day.');
  }
  blocks.push({ heading: 'Holidays', bullets: holBullets });

  if (viewMode !== 'in_store') {
    const resBullets = [techExplanation];
    const topSurfaces = pressureSurfaceLines.slice(0, 3).map((l) => l.replace(/\s*\(max of lab\/team\/backend blend\)\s*$/, ''));
    if (topSurfaces.length) resBullets.push(...topSurfaces.map((s) => `Where the work sits: ${s}`));
    if (operatingWindows.length) {
      resBullets.push('Special windows today can bump lab, team, backend, or store levels.');
      resBullets.push(...operatingWindows.slice(0, 3));
    }
    if (bauToday.length) resBullets.push(...bauToday.map((b) => `Routine work: ${b}`));
    blocks.push({ heading: 'Delivery & capacity', bullets: resBullets });
  } else {
    const storeBullets: string[] = [];
    if (storeTradingLine) storeBullets.push(storeTradingLine);
    storeBullets.push(`Store activity level in the model: about ${pctStorePressure(row.store_pressure)}%.`);
    if (operatingWindows.length) {
      storeBullets.push('These windows adjust load or how tight capacity feels:');
      storeBullets.push(...operatingWindows.slice(0, 4));
    }
    if (bauToday.length) {
      storeBullets.push('Usual weekly BAU peaks or support:');
      storeBullets.push(...bauToday.slice(0, 4));
    }
    blocks.push({ heading: 'Stores & routine work', bullets: storeBullets });
  }

  return blocks;
}
