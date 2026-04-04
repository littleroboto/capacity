import { parseDslMarketId } from '@/lib/dslMarketLine';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';

const DOC_SPLIT = /\r?\n---\s*\r?\n/;

export type RiskHeatmapVisualPatch = {
  gamma: number;
  curve: RiskHeatmapCurveId;
};

/** Top-level legacy keys (heatmap is app storage only). */
const LEGACY_RISK_HEATMAP_LINE =
  /^\s*risk_heatmap_(?:gamma(?:_tech|_business)?|curve)\s*:\s*.*$/;

/** Remove legacy top-level `risk_heatmap_*` lines from the document for `market`. Heatmap γ/curve are app storage only. */
export function patchDslRiskHeatmapVisual(
  dslText: string,
  market: string,
  _patch: RiskHeatmapVisualPatch
): string {
  const multi = DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => stripRiskHeatmapLinesInSegment(seg, market));
  return multi ? out.join('\n---\n') : out[0]!;
}

function stripRiskHeatmapLinesInSegment(segment: string, market: string): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;
  return segment
    .split('\n')
    .filter((line) => !LEGACY_RISK_HEATMAP_LINE.test(line))
    .join('\n');
}

/** @deprecated Use {@link patchDslRiskHeatmapVisual} (strips legacy YAML only). */
export function patchDslRiskHeatmapGamma(dslText: string, market: string, gamma: number): string {
  return patchDslRiskHeatmapVisual(dslText, market, { gamma, curve: 'power' });
}
