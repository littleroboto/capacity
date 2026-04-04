import { runPipelineFromDsl } from '@/engine/pipeline';
import { riskTuningForPipelineView } from '@/engine/riskModelTuning';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { normalizeAssistantYaml } from '@/lib/dslAssistant/normalizeAssistantYaml';
import { appendParseErrorHints } from '@/lib/dslAssistant/parseErrorHints';

/** Merge single-market editor buffer into the full multi-doc string used by the pipeline. */
export function buildFullDslFromEditorBuffer(proposedEditorText: string): string {
  const normalized = normalizeAssistantYaml(proposedEditorText);
  const { country, dslByMarket, runwayMarketOrder, configs } = useAtcStore.getState();
  if (isRunwayMultiMarketStrip(country)) {
    const focus = gammaFocusMarket(country, configs, runwayMarketOrder);
    const dm = { ...dslByMarket, [focus]: normalized };
    return mergeMarketsToMultiDocYaml(dm, runwayMarketOrder);
  }
  const dm = { ...dslByMarket, [country]: normalized };
  return mergeMarketsToMultiDocYaml(dm, runwayMarketOrder);
}

export function validateProposedEditorBuffer(
  proposedEditorText: string
): { ok: true } | { ok: false; error: string } {
  const full = buildFullDslFromEditorBuffer(proposedEditorText);
  if (!full.trim()) {
    return { ok: false, error: 'Empty YAML.' };
  }
  if (!looksLikeYamlDsl(full)) {
    return { ok: false, error: 'Content does not look like market YAML (possible HTML or bundle pasted).' };
  }
  const { riskTuning, country } = useAtcStore.getState();
  const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
  if (r.parseError) {
    let err = r.parseError;
    if (!isRunwayMultiMarketStrip(country)) {
      const solo = normalizeAssistantYaml(proposedEditorText);
      const rSolo = runPipelineFromDsl(solo, riskTuning);
      if (!rSolo.parseError && rSolo.configs.length > 0) {
        err = `${err}\n\nNote: This market's YAML parses on its own; another market in the merged runway may be invalid. Open "All markets" and check other documents, or re-load markets from disk.`;
      }
    }
    return { ok: false, error: appendParseErrorHints(err) };
  }
  return { ok: true };
}

export function commitProposedEditorBuffer(proposedEditorText: string): void {
  const normalized = normalizeAssistantYaml(proposedEditorText);
  useAtcStore.getState().setDslText(normalized);
  useAtcStore.getState().applyDsl();
}
