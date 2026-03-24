import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';

const DOC_SPLIT = /\r?\n---\s*\r?\n/;

export type RiskHeatmapVisualPatch = {
  gamma: number;
  curve: RiskHeatmapCurveId;
};

/** Insert / update / remove heatmap visual keys on the YAML document for `market`. Preserves comments outside those lines. */
export function patchDslRiskHeatmapVisual(
  dslText: string,
  market: string,
  { gamma, curve }: RiskHeatmapVisualPatch
): string {
  const g = Math.round(Math.min(3, Math.max(0.35, gamma)) * 100) / 100;
  const multi = DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchHeatmapInDocSegment(seg, market, g, curve));
  return multi ? out.join('\n---\n') : out[0]!;
}

function patchHeatmapInDocSegment(
  segment: string,
  market: string,
  gamma: number,
  curve: RiskHeatmapCurveId
): string {
  const m = segment.match(/^country:\s*(\S+)/m);
  if (!m || m[1] !== market) return segment;

  let s = segment.replace(/\r?\n?^risk_heatmap_gamma:\s*[\d.]+\s*$/m, '');
  s = s.replace(/\r?\n?^risk_heatmap_curve:\s*\S+\s*$/m, '');

  const wantGamma = Math.abs(gamma - 1) >= 0.001;
  const wantCurve = curve !== 'power';
  if (!wantGamma && !wantCurve) return s;

  const lines: string[] = [];
  if (wantGamma) lines.push(`risk_heatmap_gamma: ${gamma}`);
  if (wantCurve) lines.push(`risk_heatmap_curve: ${curve}`);
  const block = `\n${lines.join('\n')}`;

  const countryOnly = s.replace(/^(country:\s*\S+)\s*$/m, `$1${block}`);
  if (countryOnly !== s) return countryOnly;

  const afterCountry = s.replace(/^(country:\s*\S+)/m, `$1${block}`);
  if (afterCountry !== s) return afterCountry;

  return s;
}

/** @deprecated Use `patchDslRiskHeatmapVisual` */
export function patchDslRiskHeatmapGamma(dslText: string, market: string, gamma: number): string {
  return patchDslRiskHeatmapVisual(dslText, market, { gamma, curve: 'power' });
}
