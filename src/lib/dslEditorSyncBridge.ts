/**
 * Bridges Monaco (controlled buffer) and Zustand before `applyDsl` / leaving Code lens.
 * The editor can be one keystroke ahead of the last `onChange` commit depending on timing.
 */

type FlushFn = () => void;

let registeredFlush: FlushFn | null = null;

export function registerDslEditorFlush(fn: FlushFn | null): void {
  registeredFlush = fn;
}

/** Sync Monaco → store (synchronous). No-op when the Code workspace is not mounted. */
export function flushDslEditorIntoStore(): void {
  registeredFlush?.();
}
