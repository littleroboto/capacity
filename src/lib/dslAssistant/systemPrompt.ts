import llmMarketDslPromptSource from '../../../docs/LLM_MARKET_DSL_PROMPT.md?raw';

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

After your short explanation to the user (plain language, optional markdown), use **one** of the following (never both in the same message).

### A) Streaming full YAML (preferred for Code view — the editor updates live)

Output a **single line** exactly:

<<<DSL_YAML_STREAM>>>

Then on the **next line**, output the **complete** YAML for the entire editor buffer. The UI streams this into Monaco; invalid partial YAML is OK only while you are still generating — finish with valid YAML.
- For a multi-document bundle (all markets), separate documents with a line containing only --- ; leave unrelated markets unchanged except where the user asked.
- Do not wrap the YAML in markdown fences.
- Do not repeat the explanation after the marker.

### B) JSON edit (when tiny surgical changes are easier than rewriting the whole buffer)

Output a **single line** exactly:

<<<DSL_EDIT_JSON>>>

followed immediately by **one JSON object** (no markdown fence) with one of these shapes:

1) Patches: {"kind":"patches","patches":[{"type":"replace","old":"<exact substring from CURRENT_YAML>","new":"<replacement>"},...]}
   - At most 20 patches. Each "old" must appear **exactly once** in CURRENT_YAML.

2) Full buffer: {"kind":"full_yaml","yaml":"<complete YAML>"}

Do not put machine output before your explanation. The human-readable part comes first; then the delimiter and payload.`;

export function getDslAssistantSystemPrompt(): string {
  const base = extractSystemInstructions(llmMarketDslPromptSource);
  return `${base}\n\n---\n\n${PRODUCT_EMBEDDED_BLOCK}`;
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
