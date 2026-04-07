import { VIEW_SETTINGS_FILE_KIND, type ViewSettingsFileV1 } from '@/lib/viewSettingsPreset';

const MAX_NAMED_PRESETS = 12;

export type NamedViewSettingsPresetV1 = {
  id: string;
  name: string;
  savedAt: string;
  file: ViewSettingsFileV1;
};

type StoredV1 = { version: 1; presets: NamedViewSettingsPresetV1[] };

/** Session memory only (no localStorage). */
let namedPresetsMemory: NamedViewSettingsPresetV1[] = [];

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
  return [...namedPresetsMemory];
}

export function persistNamedViewSettingsPresets(presets: NamedViewSettingsPresetV1[]): void {
  const data: StoredV1 = { version: 1, presets: presets.slice(0, MAX_NAMED_PRESETS) };
  namedPresetsMemory = data.presets.filter(isNamedPreset);
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
      error: `You can save at most ${MAX_NAMED_PRESETS} presets in this session. Delete one to add another.`,
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

export function clearNamedViewSettingsPresets(): void {
  namedPresetsMemory = [];
}

/** @deprecated Use {@link clearNamedViewSettingsPresets}. */
export function clearNamedViewSettingsPresetsStorage(): void {
  clearNamedViewSettingsPresets();
}
