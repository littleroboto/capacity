/**
 * Validation service: fragment-level, cross-fragment, and artifact validation.
 *
 * Validation levels:
 * 1. Fragment-level: required fields, allowed values, range checks
 * 2. Cross-fragment: missing references, incompatible combos, duplicates
 * 3. Artifact-level: assembled YAML structure, internal consistency
 *
 * All validation failures are persisted to validation_results.
 */
import { supabaseServiceClient } from '../_lib/supabaseClient';
import type {
  CampaignConfig,
  TechProgrammeConfig,
  ResourceConfig,
  TradingConfig,
  NationalLeaveBandConfig,
  AssembledMarketFragments,
  ValidationSeverity,
} from '../_lib/domainTypes';

export interface ValidationIssue {
  severity: ValidationSeverity;
  ruleCode: string;
  message: string;
  fieldPath?: string;
  details?: Record<string, unknown>;
}

export interface ValidationReport {
  isValid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
}

// ============================================================================
// Fragment-Level Validation
// ============================================================================

export function validateCampaign(campaign: Partial<CampaignConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!campaign.name?.trim()) {
    issues.push({ severity: 'error', ruleCode: 'CAMP_NAME_REQUIRED', message: 'Campaign name is required', fieldPath: 'name' });
  }
  if (!campaign.startDate) {
    issues.push({ severity: 'error', ruleCode: 'CAMP_START_REQUIRED', message: 'Campaign start date is required', fieldPath: 'startDate' });
  }
  if (!campaign.durationDays || campaign.durationDays < 1) {
    issues.push({ severity: 'error', ruleCode: 'CAMP_DURATION_INVALID', message: 'Campaign duration must be at least 1 day', fieldPath: 'durationDays' });
  }
  if (campaign.durationDays && campaign.durationDays > 365) {
    issues.push({ severity: 'warning', ruleCode: 'CAMP_DURATION_LONG', message: 'Campaign duration exceeds 365 days', fieldPath: 'durationDays' });
  }
  if (campaign.promoWeight != null && (campaign.promoWeight < 0 || campaign.promoWeight > 2.5)) {
    issues.push({ severity: 'error', ruleCode: 'CAMP_WEIGHT_RANGE', message: 'Promo weight must be 0–2.5', fieldPath: 'promoWeight' });
  }
  if (campaign.testingPrepDuration != null && campaign.testingPrepDuration < 0) {
    issues.push({ severity: 'error', ruleCode: 'CAMP_PREP_NEGATIVE', message: 'Testing prep duration cannot be negative', fieldPath: 'testingPrepDuration' });
  }

  return issues;
}

export function validateTechProgramme(programme: Partial<TechProgrammeConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!programme.name?.trim()) {
    issues.push({ severity: 'error', ruleCode: 'PROG_NAME_REQUIRED', message: 'Programme name is required', fieldPath: 'name' });
  }
  if (!programme.startDate) {
    issues.push({ severity: 'error', ruleCode: 'PROG_START_REQUIRED', message: 'Programme start date is required', fieldPath: 'startDate' });
  }
  if (!programme.durationDays || programme.durationDays < 1) {
    issues.push({ severity: 'error', ruleCode: 'PROG_DURATION_INVALID', message: 'Programme duration must be at least 1 day', fieldPath: 'durationDays' });
  }

  return issues;
}

export function validateResources(config: Partial<ResourceConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.labsCapacity != null && config.labsCapacity < 0) {
    issues.push({ severity: 'error', ruleCode: 'RES_LABS_NEGATIVE', message: 'Labs capacity cannot be negative', fieldPath: 'labsCapacity' });
  }
  if (config.staffCapacity != null && config.staffCapacity < 0) {
    issues.push({ severity: 'error', ruleCode: 'RES_STAFF_NEGATIVE', message: 'Staff capacity cannot be negative', fieldPath: 'staffCapacity' });
  }
  if (config.testingCapacity != null && config.testingCapacity < 0) {
    issues.push({ severity: 'error', ruleCode: 'RES_TEST_NEGATIVE', message: 'Testing capacity cannot be negative', fieldPath: 'testingCapacity' });
  }

  if (config.staffMonthlyPattern) {
    for (const [month, val] of Object.entries(config.staffMonthlyPattern)) {
      if (val < 0) {
        issues.push({ severity: 'error', ruleCode: 'RES_MONTHLY_NEGATIVE', message: `Staff monthly pattern for ${month} cannot be negative`, fieldPath: `staffMonthlyPattern.${month}` });
      }
    }
  }

  return issues;
}

export function validateTrading(config: Partial<TradingConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.campaignEffectScale != null && (config.campaignEffectScale < 0 || config.campaignEffectScale > 2.5)) {
    issues.push({ severity: 'error', ruleCode: 'TRADE_EFFECT_RANGE', message: 'Campaign effect scale must be 0–2.5', fieldPath: 'campaignEffectScale' });
  }
  if (config.paydayMonthPeakMultiplier != null && (config.paydayMonthPeakMultiplier < 1 || config.paydayMonthPeakMultiplier > 1.2)) {
    issues.push({ severity: 'warning', ruleCode: 'TRADE_PAYDAY_RANGE', message: 'Payday peak multiplier typically 1.0–1.2', fieldPath: 'paydayMonthPeakMultiplier' });
  }

  if (config.weeklyPattern) {
    for (const [day, val] of Object.entries(config.weeklyPattern)) {
      if (val < 0 || val > 1) {
        issues.push({ severity: 'error', ruleCode: 'TRADE_WEEKLY_RANGE', message: `Weekly pattern for ${day} must be 0–1`, fieldPath: `weeklyPattern.${day}` });
      }
    }
  }

  return issues;
}

export function validateNationalLeaveBand(band: Partial<NationalLeaveBandConfig>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!band.fromDate) {
    issues.push({ severity: 'error', ruleCode: 'LEAVE_FROM_REQUIRED', message: 'Leave band from date is required', fieldPath: 'fromDate' });
  }
  if (!band.toDate) {
    issues.push({ severity: 'error', ruleCode: 'LEAVE_TO_REQUIRED', message: 'Leave band to date is required', fieldPath: 'toDate' });
  }
  if (band.fromDate && band.toDate && band.fromDate > band.toDate) {
    issues.push({ severity: 'error', ruleCode: 'LEAVE_DATE_ORDER', message: 'Leave band from date must be before to date', fieldPath: 'fromDate' });
  }
  if (band.capacityMultiplier != null && (band.capacityMultiplier < 0 || band.capacityMultiplier > 1)) {
    issues.push({ severity: 'error', ruleCode: 'LEAVE_MULT_RANGE', message: 'Capacity multiplier must be 0–1', fieldPath: 'capacityMultiplier' });
  }

  return issues;
}

// ============================================================================
// Cross-Fragment Validation
// ============================================================================

export function validateCrossFragment(fragments: AssembledMarketFragments): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!fragments.resourceConfig) {
    issues.push({ severity: 'warning', ruleCode: 'CROSS_NO_RESOURCES', message: 'Market has no resource configuration — engine will use defaults' });
  }

  if (!fragments.bauConfig) {
    issues.push({ severity: 'warning', ruleCode: 'CROSS_NO_BAU', message: 'Market has no BAU configuration' });
  }

  if (!fragments.tradingConfig) {
    issues.push({ severity: 'warning', ruleCode: 'CROSS_NO_TRADING', message: 'Market has no trading configuration — store pressure will be flat' });
  }

  // Check for overlapping campaigns
  const campaigns = [...fragments.campaigns].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 0; i < campaigns.length - 1; i++) {
    const current = campaigns[i]!;
    const next = campaigns[i + 1]!;
    const currentEnd = addDays(current.startDate, current.durationDays);
    if (currentEnd > next.startDate) {
      issues.push({
        severity: 'info',
        ruleCode: 'CROSS_CAMPAIGN_OVERLAP',
        message: `Campaigns "${current.name}" and "${next.name}" overlap — load will stack`,
        details: { campaign1: current.name, campaign2: next.name },
      });
    }
  }

  // Check for leave bands with no holiday calendar
  if (fragments.nationalLeaveBands.length > 0 && !fragments.publicHolidayCalendar) {
    issues.push({
      severity: 'info',
      ruleCode: 'CROSS_LEAVE_NO_HOLIDAYS',
      message: 'National leave bands configured but no public holiday calendar — may be intentional',
    });
  }

  return issues;
}

// ============================================================================
// Persist Validation Results
// ============================================================================

export async function persistValidationResults(
  issues: ValidationIssue[],
  scope: 'fragment' | 'cross_fragment' | 'artifact',
  targetType: string,
  targetId: string,
  buildId?: string
): Promise<void> {
  if (issues.length === 0) return;

  const client = supabaseServiceClient();
  const rows = issues.map((issue) => ({
    scope,
    target_type: targetType,
    target_id: targetId,
    build_id: buildId,
    severity: issue.severity,
    rule_code: issue.ruleCode,
    message: issue.message,
    field_path: issue.fieldPath,
    details: issue.details,
  }));

  await client.from('validation_results').insert(rows);
}

/**
 * Run full validation for a market's assembled fragments.
 */
export function validateMarketFragments(
  fragments: AssembledMarketFragments
): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (fragments.resourceConfig) {
    issues.push(...validateResources(fragments.resourceConfig));
  }

  if (fragments.tradingConfig) {
    issues.push(...validateTrading(fragments.tradingConfig));
  }

  for (const campaign of fragments.campaigns) {
    issues.push(...validateCampaign(campaign));
  }

  for (const programme of fragments.techProgrammes) {
    issues.push(...validateTechProgramme(programme));
  }

  for (const band of fragments.nationalLeaveBands) {
    issues.push(...validateNationalLeaveBand(band));
  }

  issues.push(...validateCrossFragment(fragments));

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    isValid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
