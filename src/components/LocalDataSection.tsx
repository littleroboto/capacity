import type { ChangeEvent, ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { setAtcDsl } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';
import { SharedWorkspaceSection } from '@/components/SharedWorkspaceSection';
import { isSharedDslEnabled } from '@/lib/sharedDslSync';
import { Download, Upload } from 'lucide-react';

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

  const clearAppliedDsl = () => {
    setAtcDsl(null);
    hydrateFromStorage();
  };

  const resetPersistedPrefs = () => {
    if (
      !window.confirm(
        'Remove saved country, view mode, theme, and pressure mix controls from this browser? The page will reload.'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.capacity_atc);
      localStorage.removeItem(STORAGE_KEYS.picker);
      localStorage.removeItem(STORAGE_KEYS.layer);
      localStorage.removeItem(STORAGE_KEYS.theme);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const clearAllLocalData = () => {
    if (
      !window.confirm(
        'Remove all Capacity data in this browser (applied DSL, preferences, and any legacy snapshot list)? The page will reload.'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.atc_scenarios);
      localStorage.removeItem(STORAGE_KEYS.atc_dsl);
      localStorage.removeItem(STORAGE_KEYS.capacity_atc);
      localStorage.removeItem(STORAGE_KEYS.picker);
      localStorage.removeItem(STORAGE_KEYS.layer);
      localStorage.removeItem(STORAGE_KEYS.theme);
    } catch {
      /* ignore */
    }
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
        <SectionHeading id="view-device-heading">View on this device</SectionHeading>
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/85">Team YAML</span> (cloud or bundled) is the scenario data.
          <span className="font-medium text-foreground/85"> Heatmap curves, γ, palette, runway filters, and pressure mix</span>{' '}
          live in this browser unless you export them — they do not replace Save to cloud.
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
      </section>

      <div role="presentation" className="h-px shrink-0 bg-border/70" />

      <section className="space-y-2" aria-labelledby="workspace-reset-heading">
        <SectionHeading id="workspace-reset-heading">Reset browser storage</SectionHeading>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Does not change the team cloud copy. Use when this browser is out of date or you want a clean slate.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clearAppliedDsl}>
            Clear applied DSL
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={resetPersistedPrefs}>
            Reset preferences
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
            onClick={clearAllLocalData}
          >
            Clear everything
          </Button>
        </div>
      </section>
    </div>
  );
}
