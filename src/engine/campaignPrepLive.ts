import { parseDate } from './calendar';
import type { CampaignConfig } from './types';

const MS_PER_DAY = 86_400_000;

export type CampaignPrepLiveSegment = {
  /** Date falls in campaign calendar (prep+live for lead model, or `[start, start+duration)` for interval model). */
  inCampaignWindow: boolean;
  /** Load-bearing prep segment; false when `presence_only`. */
  inPrepLoaded: boolean;
  /** Load-bearing live segment; false when `presence_only`. */
  inLiveLoaded: boolean;
};

/**
 * Classifies campaign prep vs live for **store boost** and **Business lens** metadata.
 * Matches {@link expandPhases} campaign date rules (readiness-duration split and lead model).
 */
export function campaignLoadBearingPrepLiveForDate(
  camp: CampaignConfig,
  dateStr: string
): CampaignPrepLiveSegment {
  if (!camp.start) {
    return { inCampaignWindow: false, inPrepLoaded: false, inLiveLoaded: false };
  }

  const t = parseDate(dateStr);
  const start = parseDate(camp.start);
  const presence = Boolean(camp.presenceOnly);
  const prepDays = camp.prepBeforeLiveDays;

  if (prepDays != null && prepDays > 0) {
    const prepStart = new Date(start);
    prepStart.setDate(prepStart.getDate() - prepDays);
    const liveEnd = new Date(start);
    liveEnd.setDate(liveEnd.getDate() + camp.durationDays);
    const inPrep = t >= prepStart && t < start;
    const inLive = camp.durationDays > 0 && t >= start && t < liveEnd;
    const inCampaignWindow = inPrep || inLive;
    if (presence) {
      return { inCampaignWindow, inPrepLoaded: false, inLiveLoaded: false };
    }
    return {
      inCampaignWindow,
      inPrepLoaded: inPrep,
      inLiveLoaded: inLive,
    };
  }

  if (!camp.durationDays) {
    return { inCampaignWindow: false, inPrepLoaded: false, inLiveLoaded: false };
  }

  const end = new Date(start);
  end.setDate(end.getDate() + camp.durationDays);
  if (t < start || t >= end) {
    return { inCampaignWindow: false, inPrepLoaded: false, inLiveLoaded: false };
  }

  const inCampaignWindow = true;
  if (presence) {
    return { inCampaignWindow, inPrepLoaded: false, inLiveLoaded: false };
  }

  const dayIndex = Math.floor((t.getTime() - start.getTime()) / MS_PER_DAY);
  const rd = camp.readinessDurationDays;
  const inReadiness = rd == null || dayIndex < rd;
  return {
    inCampaignWindow,
    inPrepLoaded: inReadiness,
    inLiveLoaded: !inReadiness,
  };
}
