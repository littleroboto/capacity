export type WorkbenchEventLogEntry = {
  id: string;
  ts: number;
  text: string;
};

export const WORKBENCH_EVENT_LOG_MAX = 220;

export function trimWorkbenchEventLog(entries: readonly WorkbenchEventLogEntry[]): WorkbenchEventLogEntry[] {
  if (entries.length <= WORKBENCH_EVENT_LOG_MAX) return [...entries];
  return entries.slice(-WORKBENCH_EVENT_LOG_MAX);
}

export function newWorkbenchLogEntries(texts: readonly string[]): WorkbenchEventLogEntry[] {
  const base = Date.now();
  return texts.map((text, i) => ({
    id: `${base}-${i}-${Math.random().toString(36).slice(2, 9)}`,
    ts: base + i,
    text,
  }));
}
