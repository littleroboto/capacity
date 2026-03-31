import { STORAGE_KEYS } from './constants';

export function getStored(key: keyof typeof STORAGE_KEYS | string): string | null {
  try {
    const k = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] ?? key;
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function setStored(key: keyof typeof STORAGE_KEYS | string, value: string | null): void {
  try {
    const k = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS] ?? key;
    if (value == null) localStorage.removeItem(k);
    else localStorage.setItem(k, String(value));
  } catch {
    /* ignore */
  }
}

export function getAtcDsl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.atc_dsl);
  } catch {
    return null;
  }
}

export function setAtcDsl(text: string | null): void {
  try {
    if (text == null) localStorage.removeItem(STORAGE_KEYS.atc_dsl);
    else localStorage.setItem(STORAGE_KEYS.atc_dsl, String(text));
  } catch {
    /* ignore */
  }
}
