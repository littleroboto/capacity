import type { ReactNode } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { setAtcDsl } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';
import { SharedWorkspaceSection } from '@/components/SharedWorkspaceSection';
import { isSharedDslEnabled } from '@/lib/sharedDslSync';

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
