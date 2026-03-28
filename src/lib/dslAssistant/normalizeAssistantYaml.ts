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
  return s;
}
