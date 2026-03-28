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

## Machine-readable edit (required every turn)

After your short explanation to the user (plain language, optional markdown), output a **single line** exactly:

<<<DSL_EDIT_JSON>>>

followed immediately by **one JSON object** (no markdown fence around the JSON) with one of these shapes:

1) Patches (preferred when practical): {"kind":"patches","patches":[{"type":"replace","old":"<exact substring from CURRENT_YAML>","new":"<replacement>"},...]}
   - At most 20 patches. Apply in order. Each "old" must appear **exactly once** in CURRENT_YAML (the snapshot for this request).
   - Use exact whitespace from the file; do not "fix" unrelated formatting.

2) Full buffer (when patches are impractical): {"kind":"full_yaml","yaml":"<complete YAML for the editor buffer>"}
   - For a multi-document bundle (LIOM / all markets), include every document separated by \\n---\\n; leave unrelated markets unchanged except where the user asked.

Do not put the JSON before your explanation. The explanation must appear first; the delimiter and JSON are last.`;

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
