import type { PipelineCalendarIsoRange } from '@/engine/pipeline';
import type { MarketConfig } from '@/engine/types';

export type PipelineLogBuildInput = {
  dslText: string;
  result: {
    riskSurface: unknown[];
    configs: MarketConfig[];
    parseError?: string;
  };
  calendar: PipelineCalendarIsoRange | undefined;
  focusCountry: string;
  ranInWorker: boolean;
};

function countYamlDocuments(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const separators = t.match(/^---\s*$/gm);
  return Math.max(1, (separators?.length ?? 0) + 1);
}

function shortErr(msg: string, max = 160): string {
  const s = msg.replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Human-readable pipeline trace lines for the workbench event stream (YAML → configs → risk surface).
 */
export function buildWorkbenchPipelineEventLines(input: PipelineLogBuildInput): string[] {
  const { dslText, result, calendar, focusCountry, ranInWorker } = input;
  const lines: string[] = [];
  const mode = ranInWorker ? 'worker' : 'main';
  const chars = dslText.length;
  const docs = countYamlDocuments(dslText);

  lines.push(`[yaml] ingest · ${chars.toLocaleString()} chars · ~${docs} doc(s) · ${mode} thread`);
  lines.push(`[yaml] focus market · ${focusCountry}`);

  if (result.parseError) {
    lines.push(`[error] ${shortErr(result.parseError)}`);
    return lines;
  }

  const { configs, riskSurface } = result;
  lines.push(`[parse] materialized ${configs.length} market config(s)`);
  for (const c of configs) {
    const camps = c.campaigns?.length ?? 0;
    const tech = c.techProgrammes?.length ?? 0;
    const rel = c.releases?.length ?? 0;
    lines.push(`[model] ${c.market}: campaigns ${camps} · tech ${tech} · releases ${rel}`);
  }

  if (calendar?.startYmd && calendar?.endYmd && calendar.startYmd <= calendar.endYmd) {
    lines.push(
      `[calendar] ${calendar.startYmd} … ${calendar.endYmd} · ${riskSurface.length.toLocaleString()} risk row(s)`,
    );
  } else {
    lines.push(`[calendar] default build · ${riskSurface.length.toLocaleString()} risk row(s)`);
  }

  lines.push('[pipeline] phases · expand → capacity → carryover → deployment risk → daily risk');
  lines.push('[ok] runway model ready');
  return lines;
}
