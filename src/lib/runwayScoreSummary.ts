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
    campBullets.push('Campaign live window — demand is expressed mainly through amplified store / pipeline load.');
  }
  if (row.campaign_in_prep && !row.campaign_in_live) {
    campBullets.push('Campaign prep window — adds a marketing-weighted term to the Business blend (when that lens is active).');
  }
  if (!campBullets.length) {
    campBullets.push('No active named campaigns on this date (check YAML campaign windows).');
  }
  blocks.push({ heading: 'Campaigns & marketing', bullets: campBullets });

  const holBullets: string[] = [];
  if (row.public_holiday_flag) holBullets.push('Public holiday — trading and capacity assumptions use holiday rules.');
  if (row.school_holiday_flag) holBullets.push('School break — may apply stress / capacity multipliers.');
  if (row.holiday_flag && !isGregorianChristmasDay(row.date)) {
    holBullets.push('Holiday pressure dial can apply to the Business heatmap blend.');
  }
  if (!holBullets.length) {
    holBullets.push('No holiday flags on this day.');
  }
  blocks.push({ heading: 'Holidays & closures', bullets: holBullets });

  if (viewMode !== 'in_store') {
    const resBullets = [techExplanation];
    const topSurfaces = pressureSurfaceLines.slice(0, 3).map((l) => l.replace(/\s*\(max of lab\/team\/backend blend\)\s*$/, ''));
    if (topSurfaces.length) resBullets.push(...topSurfaces.map((s) => `Surface load: ${s}`));
    if (operatingWindows.length) {
      resBullets.push('Operating windows today may scale lab, team, backend, or store multipliers.');
      resBullets.push(...operatingWindows.slice(0, 3));
    }
    if (bauToday.length) resBullets.push(...bauToday.map((b) => `Scheduled BAU: ${b}`));
    blocks.push({ heading: 'Delivery & resourcing', bullets: resBullets });
  } else {
    const storeBullets: string[] = [];
    if (storeTradingLine) storeBullets.push(storeTradingLine);
    storeBullets.push(`Store pressure index after model rules: ${pctStorePressure(row.store_pressure)}%.`);
    if (operatingWindows.length) {
      storeBullets.push('Operating windows adjust load or capacity multipliers:');
      storeBullets.push(...operatingWindows.slice(0, 4));
    }
    if (bauToday.length) {
      storeBullets.push('Scheduled BAU peaks / support:');
      storeBullets.push(...bauToday.slice(0, 4));
    }
    blocks.push({ heading: 'Store rhythm & resourcing', bullets: storeBullets });
  }

  return blocks;
}
