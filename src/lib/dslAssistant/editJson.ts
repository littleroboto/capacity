import { stripEchoedPromptDelimitersFromYaml } from '@/lib/dslAssistant/normalizeAssistantYaml';

export const DSL_EDIT_MARKER = '<<<DSL_EDIT_JSON>>>';

const JSON_EDIT_MARKER_WRAPPERS = [
  DSL_EDIT_MARKER,
  '`' + DSL_EDIT_MARKER + '`',
  '**' + DSL_EDIT_MARKER + '**',
  '<<<dsl_edit_json>>>',
  '`<<<dsl_edit_json>>>`',
  '**<<<dsl_edit_json>>>**',
] as const;

function findLastJsonEditMarkerRange(s: string): { start: number; contentStart: number } | null {
  let best: { start: number; contentStart: number } | null = null;
  for (const m of JSON_EDIT_MARKER_WRAPPERS) {
    const i = s.lastIndexOf(m);
    if (i === -1) continue;
    if (!best || i > best.start) {
      best = { start: i, contentStart: i + m.length };
    }
  }
  return best;
}

/** After this marker the model streams raw YAML into the editor (Code workspace / dock). */
export const DSL_YAML_STREAM_MARKER = '<<<DSL_YAML_STREAM>>>';

const YAML_STREAM_MARKER_WRAPPERS = [
  DSL_YAML_STREAM_MARKER,
  '`' + DSL_YAML_STREAM_MARKER + '`',
  '**' + DSL_YAML_STREAM_MARKER + '**',
] as const;

/** Start index of marker in `s`, and index where YAML payload begins (after marker / wrapper). */
export function findYamlStreamMarkerRange(s: string): { start: number; contentStart: number } | null {
  let best: { start: number; contentStart: number } | null = null;
  for (const m of YAML_STREAM_MARKER_WRAPPERS) {
    const i = s.indexOf(m);
    if (i === -1) continue;
    if (!best || i < best.start) {
      best = { start: i, contentStart: i + m.length };
    }
  }
  return best;
}

export function assistantHasYamlStreamMarker(s: string): boolean {
  return findYamlStreamMarkerRange(s) !== null;
}

export type ReplacePatch = { type: 'replace'; old: string; new: string };

export type DslEditPayload =
  | { kind: 'patches'; patches: ReplacePatch[] }
  | { kind: 'full_yaml'; yaml: string };

const MAX_PATCHES = 40;

function normalizeReplacePatch(x: unknown): ReplacePatch | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const t = o.type;
  if (t !== undefined && t !== null && t !== 'replace') return null;

  const oldV =
    typeof o.old === 'string'
      ? o.old
      : typeof o.old_text === 'string'
        ? o.old_text
        : typeof o.from === 'string'
          ? o.from
          : typeof o.search === 'string'
            ? o.search
            : null;
  const newV =
    typeof o.new === 'string'
      ? o.new
      : typeof o.new_text === 'string'
        ? o.new_text
        : typeof o.to === 'string'
          ? o.to
          : typeof o.replace === 'string'
            ? o.replace
            : typeof o.replacement === 'string'
              ? o.replacement
              : null;
  if (oldV === null || newV === null) return null;
  return { type: 'replace', old: oldV, new: newV };
}

function patchArray(o: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(o.patches)) return o.patches;
  if (Array.isArray(o.replacements)) return o.replacements;
  if (Array.isArray(o.edits)) return o.edits;
  if (Array.isArray(o.changes)) return o.changes;
  return null;
}

function normalizePayload(raw: unknown, unwrapDepth = 0): DslEditPayload | null {
  if (raw === null || raw === undefined) return null;

  if (Array.isArray(raw)) {
    const asPatches = raw
      .map(normalizeReplacePatch)
      .filter((p): p is ReplacePatch => p !== null);
    if (asPatches.length > 0 && asPatches.length === raw.length) {
      return { kind: 'patches', patches: asPatches.slice(0, MAX_PATCHES) };
    }
    if (raw.length === 1) {
      return normalizePayload(raw[0], unwrapDepth);
    }
    return null;
  }

  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kindRaw = o.kind ?? o.type;
  const kind =
    typeof kindRaw === 'string' ? kindRaw.toLowerCase().replace(/[\s-]+/g, '_') : '';

  const yamlBody =
    typeof o.yaml === 'string'
      ? o.yaml
      : typeof o.content === 'string'
        ? o.content
        : typeof o.text === 'string'
          ? o.text
          : null;
  if ((kind === 'full_yaml' || kind === 'fullyaml') && yamlBody !== null) {
    return { kind: 'full_yaml', yaml: yamlBody };
  }

  const arr = patchArray(o);
  if ((kind === 'patches' || kind === 'patch') && arr) {
    const patches = arr
      .map(normalizeReplacePatch)
      .filter((p): p is ReplacePatch => p !== null)
      .slice(0, MAX_PATCHES);
    if (!patches.length) return null;
    return { kind: 'patches', patches };
  }

  if (Array.isArray(o.patches)) {
    const patches = o.patches
      .map(normalizeReplacePatch)
      .filter((p): p is ReplacePatch => p !== null)
      .slice(0, MAX_PATCHES);
    if (patches.length) return { kind: 'patches', patches };
  }

  if (unwrapDepth < 3) {
    let lastNested: DslEditPayload | null = null;
    for (const v of Object.values(o)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const nested = normalizePayload(v, unwrapDepth + 1);
      if (nested) lastNested = nested;
    }
    if (lastNested) return lastNested;
  }

  return null;
}

/** Markdown code fence opener: any common language tag (models often use ```yaml or ```javascript). */
const FENCE_OPEN = /^```[\w.-]*\s*/i;
const FENCE_CLOSE = /\s*```\s*$/s;

function stripLeadingCodeFence(t: string): string {
  let s = t.trim();
  if (s.startsWith('```')) {
    s = s.replace(FENCE_OPEN, '').replace(FENCE_CLOSE, '');
  }
  return s.trim();
}

/** LLMs often emit trailing commas; strip only when the comma is followed (after whitespace) by `}` or `]`. */
function jsonWithTrailingCommasFixed(s: string): string {
  let result = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      result += c;
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      result += c;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      if (j < s.length && (s[j] === '}' || s[j] === ']')) {
        continue;
      }
    }
    result += c;
  }
  return result;
}

function sliceBalancedJsonObject(s: string, start: number): string | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse JSON text (optionally wrapped in a markdown fence) into a payload, or null. */
function parseJsonTailToPayload(tail: string): DslEditPayload | null {
  let t = stripLeadingCodeFence(tail);
  const tryObject = (str: string): DslEditPayload | null => {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    const attempts = [trimmed, jsonWithTrailingCommasFixed(trimmed)];
    for (const cand of attempts) {
      try {
        const parsed = normalizePayload(JSON.parse(cand) as unknown);
        if (parsed) return parsed;
      } catch {
        /* try next */
      }
    }
    return null;
  };
  const direct = tryObject(t);
  if (direct) return direct;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = tryObject(t.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return null;
}

function sliceBalancedJsonArray(s: string, start: number): string | null {
  if (s[start] !== '[') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function mightContainEditPayloadJson(s: string): boolean {
  return /"(?:kind|patches|full_yaml|old|yaml)"\s*:/.test(s);
}

/** When fences/markers fail, scan for balanced `{…}` / `[…]` segments that parse as edit payloads (prefer last). */
function parsePayloadFromBalancedObjects(assistantContent: string): DslEditPayload | null {
  if (!mightContainEditPayloadJson(assistantContent)) return null;
  let best: DslEditPayload | null = null;
  for (let i = 0; i < assistantContent.length; i++) {
    const ch = assistantContent[i];
    if (ch === '{') {
      const slice = sliceBalancedJsonObject(assistantContent, i);
      if (!slice || slice.length < 12) continue;
      const p = parseJsonTailToPayload(slice);
      if (p) best = p;
    } else if (ch === '[') {
      const slice = sliceBalancedJsonArray(assistantContent, i);
      if (!slice || slice.length < 8) continue;
      const p = parseJsonTailToPayload(slice);
      if (p) best = p;
    }
  }
  return best;
}

function parsePayloadAfterMarker(assistantContent: string): DslEditPayload | null {
  const range = findLastJsonEditMarkerRange(assistantContent);
  if (!range) return null;
  return parseJsonTailToPayload(assistantContent.slice(range.contentStart));
}

/**
 * Models often omit <<<DSL_EDIT_JSON>>> and only put JSON in a ```json fence.
 * Try fenced blocks from the end of the message first.
 */
function parsePayloadFromMarkdownFences(assistantContent: string): DslEditPayload | null {
  const re = /```[\w.-]*\s*\n?([\s\S]*?)```/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(assistantContent)) !== null) {
    blocks.push(m[1]!.trim());
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.length < 8) continue;
    const p = parseJsonTailToPayload(b);
    if (p) return p;
  }
  return null;
}

/** Parse the JSON block after {@link DSL_EDIT_MARKER}, or the last valid fenced edit object, or a loose `{…}` scan. */
export function parseDslEditPayload(assistantContent: string): DslEditPayload | null {
  return (
    parsePayloadAfterMarker(assistantContent) ??
    parsePayloadFromMarkdownFences(assistantContent) ??
    parsePayloadFromBalancedObjects(assistantContent)
  );
}

export function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let n = 0;
  let i = 0;
  while (i <= haystack.length - needle.length) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) break;
    n += 1;
    i = j + needle.length;
  }
  return n;
}

export function applyReplacePatches(
  source: string,
  patches: ReplacePatch[]
): { ok: true; text: string } | { ok: false; error: string } {
  let text = source;
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i]!;
    const c = countOccurrences(text, p.old);
    if (c !== 1) {
      return {
        ok: false,
        error: `Patch ${i + 1}: "old" must match exactly once in the buffer (found ${c} matches).`,
      };
    }
    text = text.replace(p.old, p.new);
  }
  return { ok: true, text };
}

/** If the message ends with a fenced block that parses as an edit payload, hide it in the chat UI. */
function trimTrailingEditJsonFence(s: string): string {
  const re = /\n?```[\w.-]*\s*\n([\s\S]*?)```\s*$/i;
  const m = s.match(re);
  if (!m) return s;
  const inner = m[1]!.trim();
  if (!parseJsonTailToPayload(inner)) return s;
  return s.slice(0, s.length - m[0].length).trimEnd();
}

/** Strip machine / YAML stream tails for display in the chat bubble. */
export function assistantContentForDisplay(full: string): string {
  const cuts: number[] = [];
  for (const m of JSON_EDIT_MARKER_WRAPPERS) {
    const j = full.indexOf(m);
    if (j !== -1) cuts.push(j);
  }
  const y = findYamlStreamMarkerRange(full);
  if (y !== null) cuts.push(y.start);
  const base = cuts.length ? full.slice(0, Math.min(...cuts)).trimEnd() : full.trimEnd();
  return trimTrailingEditJsonFence(base);
}

/**
 * While the model streams, content after {@link DSL_YAML_STREAM_MARKER} is the in-progress YAML buffer
 * (shown live in Monaco). Before the marker appears, `yaml` is null.
 */
export function yamlStreamBufferFromAssistantAccumulated(accumulated: string): {
  yaml: string | null;
} {
  const range = findYamlStreamMarkerRange(accumulated);
  if (!range) return { yaml: null };
  let tail = accumulated.slice(range.contentStart).replace(/^\r?\n/, '');
  tail = stripEchoedPromptDelimitersFromYaml(tail);
  return { yaml: tail };
}
