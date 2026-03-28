/** Add short, actionable hints for common assistant / YAML failure modes. */
export function appendParseErrorHints(message: string): string {
  const m = message.trim();
  if (!m) return m;
  if (/YAML parse error/i.test(m)) {
    return `${m}

Hint: Use spaces (not tabs) for indentation; quote values that contain ":"; use straight quotes; date strings as 'YYYY-MM-DD'.`;
  }
  if (/No valid config/i.test(m)) {
    return `${m}

Hint: Each document needs a market (or country) and recognizable fields (e.g. resources, campaigns).`;
  }
  return m;
}
