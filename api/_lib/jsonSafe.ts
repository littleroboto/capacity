/**
 * JSON.stringify that survives values PostgREST / drivers sometimes return
 * (e.g. bigint columns) which plain JSON.stringify cannot encode.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function jsonSafeStringify(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}
