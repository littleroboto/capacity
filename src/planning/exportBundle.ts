import type { Scenario } from '@/domain/types';
import { scenarioFromMarketConfig } from '@/planning/scenarioFromMarketConfig';
import type { MarketConfig } from '@/engine/types';
import type { SimulationSummary } from '@/domain/types';

export const PLANNING_EXPORT_SCHEMA = 'capacity.planningBundle.v1' as const;

export type PlanningExportBundle = {
  schema: typeof PLANNING_EXPORT_SCHEMA;
  exportedAt: string;
  scenario: Scenario;
  simulationSummary: SimulationSummary;
  /** Same YAML the workbench applied (optional). */
  dslText?: string;
};

export function buildPlanningExportBundle(input: {
  config: MarketConfig;
  summary: SimulationSummary;
  dslText?: string;
}): PlanningExportBundle {
  return {
    schema: PLANNING_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    scenario: scenarioFromMarketConfig(input.config, input.dslText),
    simulationSummary: input.summary,
    dslText: input.dslText,
  };
}

export function parsePlanningExportBundle(raw: unknown): PlanningExportBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schema !== PLANNING_EXPORT_SCHEMA) return null;
  if (typeof o.exportedAt !== 'string' || !o.scenario || typeof o.scenario !== 'object') return null;
  return raw as PlanningExportBundle;
}
