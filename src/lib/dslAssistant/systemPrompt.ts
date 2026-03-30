import llmMarketDslPromptSource from '../../../docs/LLM_MARKET_DSL_PROMPT.md?raw';
import llmMarketDslSchemaCompactSource from '../../../docs/LLM_MARKET_DSL_SCHEMA_COMPACT.md?raw';

/** Extract the canonical SYSTEM / INSTRUCTIONS body (between ## SYSTEM / INSTRUCTIONS and the next ## section). */
export function extractSystemInstructions(markdown: string): string {
  const startToken = '## SYSTEM / INSTRUCTIONS';
  const start = markdown.indexOf(startToken);
  if (start === -1) {
    throw new Error('docs/LLM_MARKET_DSL_PROMPT.md: missing "## SYSTEM / INSTRUCTIONS"');
  }
  const after = markdown.slice(start + startToken.length);
  const nextH2 = after.search(/^\n## [^#]/m);
  const block = nextH2 === -1 ? after : after.slice(0, nextH2);
  return block.trim();
}

const PRODUCT_EMBEDDED_BLOCK = `You are embedded in the CPM web app Code view. The user's current YAML is passed in every request inside a clearly delimited block (e.g. <<<CURRENT_YAML>>> ... <<<END>>>).
You must:
- Only change sections the user explicitly requested.
- Never change dates, durations, campaign names, or holiday data unless the user asked for that change.
- Never fabricate public or school holiday dates; follow the holiday rules in your base instructions.
- Prefer minimal edits; preserve unrelated lines, comments, and key order.
- Quote dates as 'YYYY-MM-DD' in YAML output.
- Use ASCII straight quotes only; indent with spaces (never tab characters).
- **Non-marketing tech work** (labs + tech staff / backend load; no store-trading or business_uplift) always goes in the top-level **tech_programmes:** list — not in releases: (deploy phases) and not under tech: (weekly rhythm only). Users may say "technology project", "tech workstream", "tech initiative", "engineering / platform / infra programme", etc. — treat those the same as tech_programmes. Use **campaigns** when they want marketing impact, store uplift, or business_uplift.
- **Multi-turn:** You may receive prior user and assistant messages in the same API call. Use them as conversation memory: earlier user asks still apply until they contradict or override them. The **newest** user message contains <<<CURRENT_YAML>>> with the live buffer — that YAML plus the latest user text wins over older assumptions.

## Machine-readable edit (required every turn)

After your short explanation to the user (plain language, optional markdown), use **one** primary mechanism below. **Prefer small output:** use JSON patches whenever the change can be done with exact substring replacements from CURRENT_YAML; reserve full-buffer mechanisms for wide rewrites.

### A) JSON edit (**default** — surgical updates, smallest response)

Output a **single line** exactly:

<<<DSL_EDIT_JSON>>>

followed immediately by **one JSON object** (no markdown fence) with one of these shapes:

1) **Patches (strongly preferred for localized edits):** {"kind":"patches","patches":[{"type":"replace","old":"<exact substring from CURRENT_YAML>","new":"<replacement>"},...]}
   - At most 40 patches. Apply in order. Each "old" must appear **exactly once** in CURRENT_YAML at the time that patch runs (after prior patches).
   - Copy "old" verbatim from CURRENT_YAML (including indentation and line breaks). Prefer one patch per logical change; split large unrelated edits across multiple patches.

2) **Full buffer (when patches are impractical):** {"kind":"full_yaml","yaml":"<complete YAML>"}
   - Use when restructuring most of the file, reordering many documents, or when patches would be fragile.

**Alternate form (also accepted):** after your explanation, put **only** that JSON object inside a markdown \`\`\`json fenced block (you may omit the \`<<<DSL_EDIT_JSON>>>\` line). Use valid JSON: double-quoted keys and strings.

Do not put machine output before your explanation. The human-readable part comes first; then the delimiter and/or fenced JSON payload.

### B) Streaming full YAML (only when you intentionally replace the whole buffer)

Use **only** when the user asked for a full rewrite or the file is small and patches would not reduce output meaningfully.

Output a **single line** exactly:

<<<DSL_YAML_STREAM>>>

Then on the **next line**, output the **complete** YAML for the entire editor buffer. The UI streams this into Monaco; invalid partial YAML is OK only while you are still generating — finish with valid YAML.
- For a multi-document bundle (all markets), separate documents with a line containing only --- ; leave unrelated markets unchanged except where the user asked.
- Do not wrap the YAML in markdown fences.
- Do not repeat the explanation after the marker.
- **Never** paste prompt delimiters into the YAML: do not output lines that are only \`<<<END>>>\`, \`<<<CURRENT_YAML>>>\`, \`<<<DSL_YAML_STREAM>>>\`, or \`<<<DSL_EDIT_JSON>>>\` (those appear only in the chat protocol, not in market files).
- The **Compact schema** block in your instructions lists keys, shapes, and aliases—follow it for every natural-language edit; full narrative examples are not duplicated there.`;

export function getDslAssistantSystemPrompt(): string {
  const base = extractSystemInstructions(llmMarketDslPromptSource);
  const schema = llmMarketDslSchemaCompactSource.trim();
  return `${base}\n\n---\n\n${schema}\n\n---\n\n${PRODUCT_EMBEDDED_BLOCK}`;
}

export const CURRENT_YAML_START = '<<<CURRENT_YAML>>>';
export const CURRENT_YAML_END = '<<<END>>>';

export function buildUserMessageWithYaml(dslText: string, userRequest: string, truncatedNote?: string): string {
  const head = truncatedNote ? `${truncatedNote}\n\n` : '';
  return `${head}${CURRENT_YAML_START}
${dslText}
${CURRENT_YAML_END}

User request:
${userRequest}`;
}

const MAX_YAML_CHARS = 120_000;

export function prepareDslForPrompt(dslText: string): { text: string; truncatedNote?: string } {
  if (dslText.length <= MAX_YAML_CHARS) {
    return { text: dslText };
  }
  return {
    text: dslText.slice(0, MAX_YAML_CHARS),
    truncatedNote:
      `[Warning: CURRENT_YAML was truncated to ${MAX_YAML_CHARS} characters for context limits. Ask the user to narrow the edit or work on one market.]`,
  };
}
