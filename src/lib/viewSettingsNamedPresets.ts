import { VIEW_SETTINGS_FILE_KIND, type ViewSettingsFileV1 } from '@/lib/viewSettingsPreset';

export const NAMED_VIEW_SETTINGS_STORAGE_KEY = 'capacity:view-settings-named-presets-v1' as const;

const MAX_NAMED_PRESETS = 12;

export type NamedViewSettingsPresetV1 = {
  id: string;
  name: string;
  savedAt: string;
  file: ViewSettingsFileV1;
};

type StoredV1 = { version: 1; presets: NamedViewSettingsPresetV1[] };

function isViewSettingsFileV1(x: unknown): x is ViewSettingsFileV1 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.kind === VIEW_SETTINGS_FILE_KIND && o.version === 1 && o.settings != null && typeof o.settings === 'object';
}

function isNamedPreset(x: unknown): x is NamedViewSettingsPresetV1 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.savedAt === 'string' &&
    isViewSettingsFileV1(o.file)
  );
}

export function loadNamedViewSettingsPresets(): NamedViewSettingsPresetV1[] {
  try {
    const raw = localStorage.getItem(NAMED_VIEW_SETTINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return [];
    const o = parsed as StoredV1;
    if (o.version !== 1 || !Array.isArray(o.presets)) return [];
    return o.presets.filter(isNamedPreset);
  } catch {
    return [];
  }
}

export function persistNamedViewSettingsPresets(presets: NamedViewSettingsPresetV1[]): void {
  const data: StoredV1 = { version: 1, presets: presets.slice(0, MAX_NAMED_PRESETS) };
  localStorage.setItem(NAMED_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(data));
}

export function addNamedViewSettingsPreset(
  name: string,
  file: ViewSettingsFileV1
): { ok: true } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Enter a name for this preset.' };
  if (trimmed.length > 80) return { ok: false, error: 'Name is too long (max 80 characters).' };

  const list = loadNamedViewSettingsPresets();
  if (list.length >= MAX_NAMED_PRESETS) {
    return {
      ok: false,
      error: `You can save at most ${MAX_NAMED_PRESETS} presets on this device. Delete one to add another.`,
    };
  }

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `preset-${Date.now()}`;

  persistNamedViewSettingsPresets([
    ...list,
    { id, name: trimmed, savedAt: new Date().toISOString(), file },
  ]);
  return { ok: true };
}

export function removeNamedViewSettingsPreset(id: string): void {
  const next = loadNamedViewSettingsPresets().filter((p) => p.id !== id);
  persistNamedViewSettingsPresets(next);
}

export function clearNamedViewSettingsPresetsStorage(): void {
  try {
    localStorage.removeItem(NAMED_VIEW_SETTINGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
