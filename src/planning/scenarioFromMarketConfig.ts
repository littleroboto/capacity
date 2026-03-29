import { DEFAULT_ORG_FUNCTIONS } from '@/domain/orgTemplates';
import type { PressureEvent, PressureEventKind, Scenario, SimulationConfig } from '@/domain/types';
import { parseDate } from '@/engine/calendar';
import type { MarketConfig } from '@/engine/types';

const DEFAULT_SIMULATION: SimulationConfig = {
  timeGrainDays: 1,
  carryOverRate: 0.12,
  carryDecayPerDay: 0.92,
};

function campaignKind(_c: { name: string }): PressureEventKind {
  return 'campaign';
}

/** Build a portable `Scenario` view from a parsed YAML-backed `MarketConfig`. */
export function scenarioFromMarketConfig(config: MarketConfig, dslText?: string): Scenario {
  const marketId = config.market;
  const events: PressureEvent[] = [];

  for (const tp of config.techProgrammes ?? []) {
    if (!tp.start) continue;
    const start = parseDate(tp.start);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(0, tp.durationDays));
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    const prep = tp.prepBeforeLiveDays ?? 0;
    const startStr =
      prep > 0
        ? (() => {
            const p = new Date(start);
            p.setDate(p.getDate() - prep);
            return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
          })()
        : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    events.push({
      id: `techprog_${tp.name}`,
      kind: 'programme',
      name: tp.name.replace(/_/g, ' '),
      startDate: startStr,
      endDate: endStr,
      intensityHint: 0.5,
      source: 'yaml_tech_programme',
    });
  }

  for (const c of config.campaigns ?? []) {
    if (!c.start) continue;
    const start = parseDate(c.start);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(0, c.durationDays));
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    const prep = c.prepBeforeLiveDays ?? 0;
    const startStr =
      prep > 0
        ? (() => {
            const p = new Date(start);
            p.setDate(p.getDate() - prep);
            return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
          })()
        : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    events.push({
      id: `camp_${c.name}`,
      kind: campaignKind(c),
      name: c.name.replace(/_/g, ' '),
      startDate: startStr,
      endDate: endStr,
      intensityHint: c.impact === 'very_high' ? 1 : c.impact === 'high' ? 0.8 : 0.5,
      source: 'yaml_campaign',
    });
  }

  for (const w of config.operatingWindows ?? []) {
    events.push({
      id: `win_${w.name}_${w.start}`,
      kind: 'operational_window',
      name: w.name.replace(/_/g, ' '),
      startDate: w.start,
      endDate: w.end,
      source: 'yaml_operating_window',
    });
  }

  const bauList = config.bau == null ? [] : Array.isArray(config.bau) ? config.bau : [config.bau];
  for (const b of bauList) {
    if (!b?.name) continue;
    events.push({
      id: `bau_${b.name}`,
      kind: 'bau_rhythm',
      name: `${b.name.replace(/_/g, ' ')} (weekday rhythm in YAML)`,
      source: 'yaml_bau',
    });
  }

  const recipes: Scenario['recipes'] = [
    {
      functionId: 'lab_engineering',
      baseUnits: config.capacity.labs ?? 5,
      complexityMult: 1,
      efficiencyMult: 1,
    },
    {
      functionId: 'delivery_teams',
      baseUnits: config.capacity.teams ?? 4,
      complexityMult: 1,
      efficiencyMult: 1,
    },
    {
      functionId: 'platform_backend',
      baseUnits: config.capacity.backend ?? 1000,
      complexityMult: 1,
      efficiencyMult: 1,
    },
  ];

  return {
    id: marketId,
    name: config.title ?? marketId,
    version: '1',
    profile: {
      marketId,
      label: config.title ?? marketId,
      notes: config.description,
    },
    functions: DEFAULT_ORG_FUNCTIONS,
    recipes,
    events,
    simulation: DEFAULT_SIMULATION,
    dslText,
  };
}
