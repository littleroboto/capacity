import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';

/** Line numbers (1-based) where `MULTI_DOC_SPLIT` matches — the `---` row only. */
export function getMultiDocSeparatorLines(text: string): number[] {
  const re = new RegExp(MULTI_DOC_SPLIT.source, 'g');
  const lines: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const match = m[0];
    const idx = match.indexOf('---');
    if (idx < 0) continue;
    const pos = m.index + idx;
    const lineNo = text.slice(0, pos).split(/\r\n|\r|\n/).length;
    lines.push(lineNo);
  }
  return lines;
}

export function getYamlLineCount(text: string): number {
  if (text === '') return 1;
  return text.split(/\r\n|\r|\n/).length;
}

/** Top-level `key:` lines (same heuristics as outline), excluding multi-doc separator rows. */
export function getTopLevelKeyLineNumbers(
  text: string,
  separatorLines: ReadonlySet<number>
): number[] {
  const lines = text.split(/\r\n|\r|\n/);
  const keys: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    if (separatorLines.has(lineNo)) continue;
    const line = lines[i]!;
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const trimmed = line.trimEnd();
    if (trimmed === '---') continue;
    const m = trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/);
    if (m) keys.push(lineNo);
  }
  return keys;
}

/** Inclusive line ranges for banding each top-level section (debounced decorations). */
export function getSectionBandLineRanges(
  text: string
): Array<{ startLineNumber: number; endLineNumber: number }> {
  const seps = getMultiDocSeparatorLines(text);
  const sepSet = new Set(seps);
  const keys = getTopLevelKeyLineNumbers(text, sepSet);
  const n = getYamlLineCount(text);
  const ranges: Array<{ startLineNumber: number; endLineNumber: number }> = [];

  const nextSepAfter = (line: number): number | undefined =>
    seps.find((s) => s > line);
  for (let i = 0; i < keys.length; i++) {
    const L = keys[i]!;
    const nextKey = i + 1 < keys.length ? keys[i + 1] : undefined;
    const nextSep = nextSepAfter(L);
    let end = n;
    if (nextKey !== undefined) end = Math.min(end, nextKey - 1);
    if (nextSep !== undefined) end = Math.min(end, nextSep - 1);
    if (end >= L) ranges.push({ startLineNumber: L, endLineNumber: end });
  }
  return ranges;
}

/**
 * Folding ranges for each multi-doc chunk (only when at least one `---` separator exists).
 * Regions exclude separator lines; aligns with `splitToDslByMarket` chunk boundaries.
 */
export function getMultiDocFoldingRanges(text: string): Array<{ start: number; end: number }> {
  const seps = getMultiDocSeparatorLines(text);
  if (seps.length === 0) return [];
  const n = getYamlLineCount(text);
  const ranges: Array<{ start: number; end: number }> = [];

  const firstEnd = seps[0]! - 1;
  if (firstEnd >= 1) ranges.push({ start: 1, end: firstEnd });

  for (let i = 0; i < seps.length; i++) {
    const start = seps[i]! + 1;
    const end = i + 1 < seps.length ? seps[i + 1]! - 1 : n;
    if (start <= end) ranges.push({ start, end });
  }
  return ranges;
}

export type CapacityYamlOutlineEntry =
  | { kind: 'separator'; line: number; docIndex: number }
  | { kind: 'key'; line: number; name: string; detail: string };

/** Shared structure for outline symbols — keeps outline, bands, and folding aligned on separators. */
export function scanCapacityYamlOutline(text: string): CapacityYamlOutlineEntry[] {
  const seps = getMultiDocSeparatorLines(text);
  const sepSet = new Set(seps);
  const lines = text.split(/\r\n|\r|\n/);
  const out: CapacityYamlOutlineEntry[] = [];
  let docChunk = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i]!;
    const trimmed = line.trimEnd();

    if (sepSet.has(lineNo)) {
      docChunk += 1;
      out.push({ kind: 'separator', line: lineNo, docIndex: docChunk });
      continue;
    }

    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    if (trimmed === '---') continue;

    const m = trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const rest = m[2]!.replace(/^['"]|['"]$/g, '').trim();
    let name = key;
    if (key === 'market' || key === 'country') {
      name = rest ? `Market ${rest}` : key;
    }
    out.push({ kind: 'key', line: lineNo, name, detail: key });
  }

  return out;
}

/** First line (1-based) of the YAML document chunk containing `lineNumber` (`---` boundaries). */
export function getYamlDocStartLineNumber(text: string, lineNumber: number): number {
  const seps = getMultiDocSeparatorLines(text);
  let start = 1;
  for (const s of seps) {
    if (s < lineNumber) start = s + 1;
    else break;
  }
  return start;
}
