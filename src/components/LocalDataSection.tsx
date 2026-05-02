import type { ChangeEvent, ReactNode } from 'react';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import {
  addNamedViewSettingsPreset,
  clearNamedViewSettingsPresets,
  loadNamedViewSettingsPresets,
  removeNamedViewSettingsPreset,
} from '@/lib/viewSettingsNamedPresets';
import type { ViewSettingsExportScope } from '@/lib/viewSettingsPreset';
import { cn } from '@/lib/utils';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SharedWorkspaceSection } from '@/components/SharedWorkspaceSection';
import { isSharedDslEnabled } from '@/lib/sharedDslSync';
import { BookmarkPlus, Download, Trash2, Upload } from 'lucide-react';

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </h3>
  );
}

function CloudDisabledCallout() {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-muted/15 px-2.5 py-2">
      <p className="text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground/85">Cloud sync is off</span> in this build. Add{' '}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">VITE_SHARED_DSL=1</code> to the deploy
        environment and redeploy to show team workspace controls here.
      </p>
    </div>
  );
}

/** Workspace dialog body: team cloud (optional) and reset actions. */
export function LocalDataPanelContent() {
  const hydrateFromStorage = useAtcStore((s) => s.hydrateFromStorage);
  const exportViewSettingsFile = useAtcStore((s) => s.exportViewSettingsFile);
  const importViewSettingsFromJson = useAtcStore((s) => s.importViewSettingsFromJson);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [namedPresetsTick, bumpNamedPresets] = useReducer((n: number) => n + 1, 0);
  const [savePresetScope, setSavePresetScope] = useState<ViewSettingsExportScope>('preferences');
  const [savePresetName, setSavePresetName] = useState('');

  const namedPresets = useMemo(() => loadNamedViewSettingsPresets(), [namedPresetsTick]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const onExportPreferences = useCallback(() => {
    const file = exportViewSettingsFile('preferences');
    downloadJsonFile(`capacity-view-settings-preferences-${stamp()}.json`, file);
  }, [exportViewSettingsFile]);

  const onExportFull = useCallback(() => {
    const file = exportViewSettingsFile('full');
    downloadJsonFile(`capacity-view-settings-full-${stamp()}.json`, file);
  }, [exportViewSettingsFile]);

  const onImportPick = useCallback(() => {
    importFileRef.current?.click();
  }, []);

  const onImportFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      try {
        const text = await f.text();
        const r = importViewSettingsFromJson(text);
        if (!r.ok) {
          window.alert(r.error);
          return;
        }
        window.alert('View settings applied. Heatmap and filters updated from the file.');
      } catch {
        window.alert('Could not read the file.');
      }
    },
    [importViewSettingsFromJson]
  );

  const onSaveNamedPreset = useCallback(() => {
    const file = exportViewSettingsFile(savePresetScope, savePresetName.trim() || undefined);
    const r = addNamedViewSettingsPreset(savePresetName, file);
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    setSavePresetName('');
    bumpNamedPresets();
  }, [exportViewSettingsFile, savePresetName, savePresetScope]);

  const onApplyNamedPreset = useCallback(
    (jsonText: string) => {
      const r = importViewSettingsFromJson(jsonText);
      if (!r.ok) {
        window.alert(r.error);
        return;
      }
      window.alert('Preset applied. Heatmap and filters updated.');
    },
    [importViewSettingsFromJson]
  );

  const onDeleteNamedPreset = useCallback(
    (id: string) => {
      removeNamedViewSettingsPreset(id);
      bumpNamedPresets();
    },
    []
  );

  const clearAppliedDsl = () => {
    const fb = useAtcStore.getState().getLastBootstrapMultiDoc();
    void hydrateFromStorage(fb);
  };

  const resetPersistedPrefs = () => {
    if (
      !window.confirm(
        'Reload the app to reset country, view mode, theme, and pressure mix to defaults? In-memory state only — nothing is read from browser storage.'
      )
    ) {
      return;
    }
    window.location.reload();
  };

  const clearAllLocalData = () => {
    if (
      !window.confirm(
        'Reload and clear named view presets for this session? Team YAML is unchanged; this only affects this tab until you reload.'
      )
    ) {
      return;
    }
    clearNamedViewSettingsPresets();
    window.location.reload();
  };

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <section className="space-y-2" aria-labelledby="workspace-cloud-heading">
        <SectionHeading id="workspace-cloud-heading">Team workspace</SectionHeading>
        {isSharedDslEnabled() ? (
          <SharedWorkspaceSection />
        ) : (
          <CloudDisabledCallout />
        )}
      </section>

      <div role="presentation" className="h-px shrink-0 bg-border/70" />

      <section className="space-y-2" aria-labelledby="view-device-heading">
        <SectionHeading id="view-device-heading">View in this session</SectionHeading>
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/85">Team YAML</span> (Postgres-assembled workspace from the server,
          or bundled files when nothing is deployed yet) is the shared scenario. Lens, heatmap transfer, γ, palette, runway
          filters, and pressure-mix sliders live in memory for this tab only — export/import JSON to copy a look across
          machines; that does not replace server-side workspace updates (fragments/import when PUT is unavailable).
        </p>
        <input
          ref={importFileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-hidden
          onChange={onImportFile}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onExportPreferences}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Export view preferences
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onExportFull}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Export full backup
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onImportPick}>
            <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Import JSON…
          </Button>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          <strong className="font-medium text-foreground/80">Preferences</strong> omits market and runway lens so you
          can share a “CFO view” JSON. <strong className="font-medium text-foreground/80">Full backup</strong> includes
          picker market and lens; importing it may switch market and re-run the model.
        </p>

        <div role="presentation" className="h-px shrink-0 bg-border/60" />

        <div className="space-y-2">
          <p className="text-[11px] font-medium text-foreground/85">Named presets (this tab)</p>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Same JSON format as export/import — kept in memory for this session only (not team YAML). Use{' '}
            <span className="font-medium text-foreground/80">Preferences</span> for a shareable lens;{' '}
            <span className="font-medium text-foreground/80">Full</span> if you want market + lens in the preset.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="view-preset-name" className="text-[10px] text-muted-foreground">
                Preset name
              </Label>
              <input
                id="view-preset-name"
                type="text"
                autoComplete="off"
                placeholder="e.g. CFO heatmap"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                className={cn(
                  'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs shadow-sm',
                  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
            </div>
            <RadioGroup
              value={savePresetScope}
              onValueChange={(v) => setSavePresetScope(v as ViewSettingsExportScope)}
              className="flex flex-col gap-1.5 sm:shrink-0"
              aria-label="What to include when saving this preset"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="preferences" id="preset-scope-pref" />
                <Label htmlFor="preset-scope-pref" className="cursor-pointer text-[11px] font-normal">
                  Preferences only
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="preset-scope-full" />
                <Label htmlFor="preset-scope-full" className="cursor-pointer text-[11px] font-normal">
                  Full (market + lens)
                </Label>
              </div>
            </RadioGroup>
            <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={onSaveNamedPreset}>
              <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Save preset
            </Button>
          </div>
          {namedPresets.length > 0 ? (
            <ul className="mt-1 space-y-1.5" aria-label="Saved view presets">
              {namedPresets
                .slice()
                .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/10 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.file.scope === 'full' ? 'Full' : 'Preferences'} · saved {p.savedAt.slice(0, 10)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => onApplyNamedPreset(JSON.stringify(p.file))}
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        aria-label={`Delete preset ${p.name}`}
                        onClick={() => onDeleteNamedPreset(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-[10px] italic text-muted-foreground">No presets saved yet.</p>
          )}
        </div>
      </section>

      <div role="presentation" className="h-px shrink-0 bg-border/70" />

      <section className="space-y-2" aria-labelledby="workspace-reset-heading">
        <SectionHeading id="workspace-reset-heading">Reset session</SectionHeading>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Does not change the team cloud copy. Reload resets in-memory preferences; “Clear applied DSL” reapplies the
          last bundled or cloud YAML from when this tab loaded.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clearAppliedDsl}>
            Clear applied DSL
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={resetPersistedPrefs}>
            Reload & reset defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
            onClick={clearAllLocalData}
          >
            Clear presets &amp; reload
          </Button>
        </div>
      </section>
    </div>
  );
}
