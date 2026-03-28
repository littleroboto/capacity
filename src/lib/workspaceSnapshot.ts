import { mergeStateToFullMultiDoc } from '@/lib/multiDocMarketYaml';
import { appendScenario, type ScenarioState } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';

function newScenarioId(): string {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Capture current editor + multi-doc map + runway order + tuning + heatmap UI + theme for history / export. */
export function buildWorkspaceSnapshot(name: string, id: string): ScenarioState {
  const s = useAtcStore.getState();
  const fullDsl = mergeStateToFullMultiDoc(s);
  return {
    id,
    name,
    savedAt: new Date().toISOString(),
    fullDsl,
    dsl: fullDsl,
    picker: s.country,
    layer: s.viewMode,
    riskTuning: { ...s.riskTuning },
    runwayMarketOrder: [...s.runwayMarketOrder],
    dslByMarket: { ...s.dslByMarket },
    riskHeatmapGamma: s.riskHeatmapGamma,
    riskHeatmapCurve: s.riskHeatmapCurve,
    discoMode: s.discoMode,
    theme: s.theme,
    heatmapRenderStyle: s.heatmapRenderStyle,
    heatmapMonoColor: s.heatmapMonoColor,
  };
}

/** Prompt for a label, append to local history, return id or null if cancelled. */
export function saveNamedWorkspaceInteractive(): string | null {
  const name = window.prompt('Name this workspace snapshot');
  if (!name?.trim()) return null;
  const id = newScenarioId();
  const row = buildWorkspaceSnapshot(name.trim(), id);
  appendScenario(row);
  return id;
}

/** Save without prompt (caller supplies name); for programmatic use. */
export function saveNamedWorkspace(name: string): string {
  const id = newScenarioId();
  appendScenario(buildWorkspaceSnapshot(name.trim(), id));
  return id;
}
