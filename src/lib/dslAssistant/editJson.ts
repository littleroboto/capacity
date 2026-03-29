export const DSL_EDIT_MARKER = '<<<DSL_EDIT_JSON>>>';

/** After this marker the model streams raw YAML into the editor (Code workspace / dock). */
export const DSL_YAML_STREAM_MARKER = '<<<DSL_YAML_STREAM>>>';

export type ReplacePatch = { type: 'replace'; old: string; new: string };

export type DslEditPayload =
  | { kind: 'patches'; patches: ReplacePatch[] }
  | { kind: 'full_yaml'; yaml: string };

const MAX_PATCHES = 20;

function isReplacePatch(x: unknown): x is ReplacePatch {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.type === 'replace' && typeof o.old === 'string' && typeof o.new === 'string';
}

/** Parse the JSON block after {@link DSL_EDIT_MARKER} in the assistant message. */
export function parseDslEditPayload(assistantContent: string): DslEditPayload | null {
  const idx = assistantContent.lastIndexOf(DSL_EDIT_MARKER);
  if (idx === -1) return null;
  let tail = assistantContent.slice(idx + DSL_EDIT_MARKER.length).trim();
  // Strip optional markdown code fence
  if (tail.startsWith('```')) {
    tail = tail.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/s, '');
  }
  try {
    const raw = JSON.parse(tail) as unknown;
    return normalizePayload(raw);
  } catch {
    const start = tail.indexOf('{');
    const end = tail.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const raw = JSON.parse(tail.slice(start, end + 1)) as unknown;
      return normalizePayload(raw);
    } catch {
      return null;
    }
  }
}

function normalizePayload(raw: unknown): DslEditPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'full_yaml' && typeof o.yaml === 'string') {
    return { kind: 'full_yaml', yaml: o.yaml };
  }
  if (o.kind === 'patches' && Array.isArray(o.patches)) {
    const patches = o.patches.filter(isReplacePatch).slice(0, MAX_PATCHES);
    if (!patches.length) return null;
    return { kind: 'patches', patches };
  }
  return null;
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

/** Strip machine / YAML stream tails for display in the chat bubble. */
export function assistantContentForDisplay(full: string): string {
  const cuts: number[] = [];
  const j = full.indexOf(DSL_EDIT_MARKER);
  if (j !== -1) cuts.push(j);
  const y = full.indexOf(DSL_YAML_STREAM_MARKER);
  if (y !== -1) cuts.push(y);
  if (!cuts.length) return full.trimEnd();
  return full.slice(0, Math.min(...cuts)).trimEnd();
}

/**
 * While the model streams, content after {@link DSL_YAML_STREAM_MARKER} is the in-progress YAML buffer
 * (shown live in Monaco). Before the marker appears, `yaml` is null.
 */
export function yamlStreamBufferFromAssistantAccumulated(accumulated: string): {
  yaml: string | null;
} {
  const idx = accumulated.indexOf(DSL_YAML_STREAM_MARKER);
  if (idx === -1) return { yaml: null };
  const tail = accumulated.slice(idx + DSL_YAML_STREAM_MARKER.length).replace(/^\r?\n/, '');
  return { yaml: tail };
}
