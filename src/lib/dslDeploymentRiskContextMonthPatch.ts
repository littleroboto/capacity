import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { roundMonthlyUnit, TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';

export type DeploymentRiskContextMonthPatch = Record<TradingMonthKey, number>;

const MONTH_LINE = /^  (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec):\s*\S+/;

function formatUnit(n: number): string {
  const r = roundMonthlyUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildBlock(pattern: DeploymentRiskContextMonthPatch): string[] {
  return [
    'deployment_risk_context_month_curve:',
    ...TRADING_MONTH_KEYS.map((m) => `  ${m}: ${formatUnit(pattern[m]!)}`),
  ];
}

function findContextBlock(lines: string[]): { start: number; end: number } | null {
  const i = lines.findIndex((l) => /^deployment_risk_context_month_curve:\s*$/.test(l));
  if (i < 0) return null;
  let end = i + 1;
  while (end < lines.length && MONTH_LINE.test(lines[end]!)) end++;
  return { start: i, end };
}

/** Insert after primary deployment month curve, else before events / blackouts / other deployment keys. */
function findInsertIndex(lines: string[]): number {
  const mc = lines.findIndex((l) => /^deployment_risk_month_curve:\s*$/.test(l));
  if (mc >= 0) {
    let j = mc + 1;
    while (j < lines.length && MONTH_LINE.test(lines[j]!)) j++;
    return j;
  }
  const ev = lines.findIndex((l) => /^deployment_risk_events:\s*$/.test(l));
  if (ev >= 0) return ev;
  const bk = lines.findIndex((l) => /^deployment_risk_blackouts:\s*$/.test(l));
  if (bk >= 0) return bk;
  const ww = lines.findIndex((l) => /^deployment_risk_week_weight:\s*\S/.test(l));
  if (ww >= 0) return ww + 1;
  const camps = lines.findIndex((l) => /^campaigns:\s*$/.test(l));
  if (camps >= 0) return camps;
  return lines.length;
}

function patchSegment(segment: string, market: string, pattern: DeploymentRiskContextMonthPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const allZero = TRADING_MONTH_KEYS.every((m) => roundMonthlyUnit(pattern[m]!) === 0);
  const lines = segment.split('\n');
  const block = findContextBlock(lines);

  if (allZero) {
    if (!block) return segment;
    lines.splice(block.start, block.end - block.start);
    if (block.start < lines.length && lines[block.start] === '' && lines[block.start - 1] === '') {
      lines.splice(block.start, 1);
    }
    return lines.join('\n');
  }

  const newLines = buildBlock(pattern);
  if (block) {
    lines.splice(block.start, block.end - block.start, ...newLines);
    return lines.join('\n');
  }

  const ins = findInsertIndex(lines);
  const padBefore = ins > 0 && lines[ins - 1]!.trim() !== '' ? [''] : [];
  const padAfter = ins < lines.length && lines[ins]!.trim() !== '' ? [''] : [];
  lines.splice(ins, 0, ...padBefore, ...newLines, ...padAfter);
  return lines.join('\n');
}

/** Insert / update / remove `deployment_risk_context_month_curve` for `market`. All-zero pattern removes the block. */
export function patchDslDeploymentRiskContextMonthCurve(
  dslText: string,
  market: string,
  pattern: DeploymentRiskContextMonthPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
