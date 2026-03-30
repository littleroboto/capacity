/** Lines the model sometimes echoes from the user prompt; must not appear inside real YAML. */
const TRUNCATE_YAML_AT_LINE = new Set(['<<<END>>>', '<<<CURRENT_YAML>>>']);

const SKIP_STANDALONE_LINE = new Set(['<<<DSL_YAML_STREAM>>>', '<<<DSL_EDIT_JSON>>>']);

const LEADING_DELIMITER_LINE = new Set<string>([
  ...TRUNCATE_YAML_AT_LINE,
  ...SKIP_STANDALONE_LINE,
]);

/**
 * Drop echoed UI/prompt delimiters.
 * - **Leading** lines that are only delimiters are removed (models often echo `<<<END>>>` right after
 *   `<<<DSL_YAML_STREAM>>>`, which would otherwise truncate to empty and lose the real YAML).
 * - **After real content starts**, the first line that is only `<<<END>>>` or `<<<CURRENT_YAML>>>`
 *   ends the payload (stops echoed user-wrapper + junk like a following `---`).
 */
export function stripEchoedPromptDelimitersFromYaml(text: string): string {
  const lines = String(text).split('\n');
  let i = 0;
  while (i < lines.length && LEADING_DELIMITER_LINE.has(lines[i]!.trim())) {
    i += 1;
  }
  const out: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    if (TRUNCATE_YAML_AT_LINE.has(t)) break;
    if (SKIP_STANDALONE_LINE.has(t)) continue;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Best-effort cleanup for model-produced YAML before parse/merge.
 * Does not change semantics for well-formed files.
 */
export function normalizeAssistantYaml(text: string): string {
  let s = String(text).replace(/^\uFEFF/, '');
  s = s.replace(/\u200b|\u200c|\u200d|\ufeff/g, '');
  s = s.replace(/[\u201c\u201d]/g, '"');
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s
    .split('\n')
    .map((line) => line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)))
    .join('\n');
  s = stripEchoedPromptDelimitersFromYaml(s);
  return s;
}
