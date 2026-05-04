import { getYamlDocStartLineNumber } from '@/lib/monacoCapacityYamlSectionScan';

/** Leading whitespace width (tab counts as 2 columns). */
export function capacityYamlLineIndent(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === ' ') n += 1;
    else if (c === '\t') n += 2;
    else break;
  }
  return n;
}

export type CapacityYamlStackEntry = { key: string; indent: number };

/**
 * Indent-key stack for a Capacity runway YAML document (heuristic, no full parse).
 * Only lines from `docStartLineIndex` through `upToLineIndex` inclusive are processed.
 */
export function buildCapacityYamlKeyStackSlice(
  lines: readonly string[],
  docStartLineIndex: number,
  upToLineIndex: number
): CapacityYamlStackEntry[] {
  const stack: CapacityYamlStackEntry[] = [];
  const start = Math.max(0, docStartLineIndex);
  const end = Math.min(lines.length - 1, upToLineIndex);

  for (let i = start; i <= end; i++) {
    const line = lines[i] ?? '';
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd === '' || trimmedEnd.startsWith('#')) continue;

    const indent = capacityYamlLineIndent(line);
    const trimmed = trimmedEnd.trim();

    const keyMatch = trimmed.match(/^-\s+(.+)$/) ? null : trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    const dashMatch = trimmed.match(/^-\s*(.*)$/);

    if (keyMatch) {
      const key = keyMatch[1]!.toLowerCase();
      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
        stack.pop();
      }
      stack.push({ key, indent });
    } else if (dashMatch) {
      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
        stack.pop();
      }
    }
  }

  return stack;
}

export type CapacityYamlCompletionZone =
  | 'campaigns_list'
  | 'tech_programmes_list'
  | 'holiday_ranges_list'
  | null;

function stackHasKey(stack: readonly CapacityYamlStackEntry[], k: string): boolean {
  return stack.some((e) => e.key === k);
}

function inferZone(stack: readonly CapacityYamlStackEntry[]): CapacityYamlCompletionZone {
  const inHolidayRanges =
    stackHasKey(stack, 'ranges') &&
    (stackHasKey(stack, 'public_holidays') || stackHasKey(stack, 'school_holidays'));
  if (inHolidayRanges) return 'holiday_ranges_list';

  if (stackHasKey(stack, 'tech_programmes')) return 'tech_programmes_list';
  if (stackHasKey(stack, 'campaigns')) return 'campaigns_list';
  return null;
}

/** True when a multi-line list-item scaffold is appropriate (uses text before cursor only). */
function allowListItemScaffold(beforeCursor: string): boolean {
  const t = beforeCursor.trimEnd();
  if (t === '') return true;
  if (/^\s*-\s*$/.test(beforeCursor)) return true;
  return false;
}

export type CapacityYamlCompletionItem = {
  label: string;
  insertText: string;
  insertAsSnippet: boolean;
  documentation: string;
  sortText: string;
};

const DOC_REF = 'See docs/LLM_MARKET_DSL_SCHEMA_COMPACT.md and parser keys in yamlDslParser.';

function campaignScaffold(listDashIndent: number): CapacityYamlCompletionItem {
  const d = listDashIndent;
  const i1 = ' '.repeat(d);
  const i2 = ' '.repeat(d + 2);
  const i4 = ' '.repeat(d + 4);
  return {
    label: 'Campaign list item',
    insertText: [
      `${i1}- name: \${1:New campaign}`,
      `${i2}start_date: '\${2:2026-01-01}'`,
      `${i2}duration: \${3:28}`,
      `${i2}testing_prep_duration: \${4:120}`,
      `${i2}impact: medium`,
      `${i2}promo_weight: 1.0`,
      `${i2}live_tech_load_scale: 0.6`,
      `${i2}campaign_support:`,
      `${i4}labs_required: 1`,
      `${i4}tech_staff: 0.7`,
      `${i2}live_campaign_support:`,
      `${i4}labs_required: 1`,
      `${i4}tech_staff: 0.7`,
    ].join('\n'),
    insertAsSnippet: true,
    documentation: `Scaffold for a \`campaigns:\` list entry (${DOC_REF}).`,
    sortText: '0-campaign',
  };
}

function techProgrammeScaffold(listDashIndent: number): CapacityYamlCompletionItem {
  const d = listDashIndent;
  const i1 = ' '.repeat(d);
  const i2 = ' '.repeat(d + 2);
  const i4 = ' '.repeat(d + 4);
  return {
    label: 'Tech programme list item',
    insertText: [
      `${i1}- name: \${1:New tech programme}`,
      `${i2}start_date: '\${2:2026-05-01}'`,
      `${i2}duration: \${3:42}`,
      `${i2}testing_prep_duration: \${4:42}`,
      `${i2}programme_support:`,
      `${i4}labs_required: 1`,
      `${i4}tech_staff: 1`,
      `${i2}live_programme_support:`,
      `${i4}labs_required: 1`,
      `${i4}tech_staff: 1`,
    ].join('\n'),
    insertAsSnippet: true,
    documentation: `Scaffold for a \`tech_programmes:\` entry using programme_support / live_programme_support (${DOC_REF}). Omits trading-only keys (impact, promo_weight, presence_only).`,
    sortText: '0-tech',
  };
}

function padLines(lines: string[], firstLinePad: string, bodyPad: string): string {
  return lines
    .map((line, i) => (i === 0 ? firstLinePad + line : bodyPad + line))
    .join('\n');
}

function guessListDashIndentAbove(
  lines: readonly string[],
  fromIdx: number,
  stopWhenIndentLte: number
): number | undefined {
  for (let i = fromIdx - 1; i >= 0; i--) {
    const raw = lines[i] ?? '';
    const t = raw.trimEnd();
    if (t === '' || t.startsWith('#')) continue;
    const ind = capacityYamlLineIndent(raw);
    if (ind <= stopWhenIndentLte) return undefined;
    const m = t.match(/^(\s*)-\s/);
    if (m) return m[1]!.length;
  }
  return undefined;
}

function holidayRangeScaffold(listDashIndent: number): CapacityYamlCompletionItem {
  const pad = ' '.repeat(listDashIndent);
  const cont = ' '.repeat(listDashIndent + 2);
  return {
    label: 'Holiday range (from / to)',
    insertText: padLines(
      ["- from: '${1:2026-12-25}'", "to: '${2:2026-12-26}'"],
      pad,
      cont
    ),
    insertAsSnippet: true,
    documentation: `Inclusive ISO date range under \`public_holidays.ranges:\` or \`school_holidays.ranges:\` (\`from\` / \`to\`; parser also accepts start/end aliases). Optional \`label:\` line is display-only.`,
    sortText: '0-range',
  };
}

export type SuggestCapacityYamlCompletionsArgs = {
  text: string;
  lineNumber: number;
  column: number;
};

/**
 * Context-aware suggestions for Capacity runway YAML (no yaml.load — line/heuristic only).
 * Scoped to the current multi-doc chunk via `getYamlDocStartLineNumber`.
 */
export function suggestCapacityYamlCompletions(
  args: SuggestCapacityYamlCompletionsArgs
): CapacityYamlCompletionItem[] {
  const { text, lineNumber, column } = args;
  if (lineNumber < 1 || column < 1) return [];

  const lines = text.split(/\r\n|\r|\n/);
  const idx = lineNumber - 1;
  const lineText = lines[idx] ?? '';
  const beforeCursor = lineText.slice(0, column - 1);
  const docStart = getYamlDocStartLineNumber(text, lineNumber);
  const docStartIdx = docStart - 1;

  const stack = buildCapacityYamlKeyStackSlice(lines, docStartIdx, idx);
  const zone = inferZone(stack);

  if (!zone) return [];

  if (!allowListItemScaffold(beforeCursor)) return [];

  // Under `ranges:`, require indentation past the `ranges:` column (skip check on fully empty lines).
  if (zone === 'holiday_ranges_list') {
    const rangesEntry = [...stack].reverse().find((e) => e.key === 'ranges');
    if (rangesEntry && lineText.trimEnd() !== '') {
      const ind = capacityYamlLineIndent(beforeCursor);
      if (ind <= rangesEntry.indent) return [];
    }
  }

  const out: CapacityYamlCompletionItem[] = [];
  if (zone === 'campaigns_list') {
    const c = [...stack].reverse().find((e) => e.key === 'campaigns');
    const dash =
      guessListDashIndentAbove(lines, idx, c?.indent ?? -1) ?? (c ? c.indent + 2 : 2);
    out.push(campaignScaffold(dash));
  } else if (zone === 'tech_programmes_list') {
    const tp = [...stack].reverse().find((e) => e.key === 'tech_programmes');
    const dash =
      guessListDashIndentAbove(lines, idx, tp?.indent ?? -1) ?? (tp ? tp.indent + 2 : 2);
    out.push(techProgrammeScaffold(dash));
  } else if (zone === 'holiday_ranges_list') {
    const r = [...stack].reverse().find((e) => e.key === 'ranges');
    if (!r) return [];
    const dash = guessListDashIndentAbove(lines, idx, r.indent) ?? r.indent + 2;
    out.push(holidayRangeScaffold(dash));
  }

  return out;
}
