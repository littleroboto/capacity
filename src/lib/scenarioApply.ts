import { normalizeViewModeId } from '@/lib/constants';
import { clampRiskTuning, DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import type { ScenarioState } from '@/lib/storage';
import { setStored } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';

/** Load a saved scenario: country, DSL, view mode, optional risk tuning, then run pipeline + persist `atc_dsl`. */
export function applyScenarioToStore(s: ScenarioState): void {
  setStored('picker', s.picker);
  if (s.riskTuning && typeof s.riskTuning === 'object') {
    useAtcStore.setState({
      riskTuning: clampRiskTuning({ ...DEFAULT_RISK_TUNING, ...s.riskTuning }),
    });
  }
  useAtcStore.setState({ country: s.picker, dslText: s.dsl });
  useAtcStore.getState().setViewMode(normalizeViewModeId(s.layer));
  useAtcStore.getState().applyDsl(s.dsl);
}
