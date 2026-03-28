import { useState } from 'react';
import { DslAssistantPanel } from '@/components/DslAssistantPanel';
import { LocalDataPanelContent } from '@/components/LocalDataSection';
import { RightPanelSection } from '@/components/RightPanelSection';
import { RiskModelPanel } from '@/components/RiskModelPanel';
import { WorkbenchRunwayControls } from '@/components/WorkbenchRunwayControls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { saveNamedWorkspaceInteractive } from '@/lib/workspaceSnapshot';
import { useAtcStore } from '@/store/useAtcStore';
import { ChevronLeft, ChevronRight, Database, FileCode2, Save } from 'lucide-react';

type DSLPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

/** Sits in a split layout: runway/heatmap left, controls + workbench right. */
export function DSLPanel({ collapsed, onCollapsedChange }: DSLPanelProps) {
  const [localDataOpen, setLocalDataOpen] = useState(false);
  const [dslAuthoringExpanded, setDslAuthoringExpanded] = useState(true);
  const parseError = useAtcStore((s) => s.parseError);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const viewMode = useAtcStore((s) => s.viewMode);

  const localDataDialog = (
    <Dialog open={localDataOpen} onOpenChange={setLocalDataOpen}>
      <DialogContent className="max-h-[min(88dvh,720px)] gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Local data</DialogTitle>
          <DialogDescription className="text-pretty">
            Everything stays in this browser. Use <strong className="font-medium text-foreground">Save snapshot</strong>{' '}
            (disk icon below) to store DSL, runway order, pressure tuning, view, theme, and related state. The{' '}
            <strong className="font-medium text-foreground">history</strong> table is newest first — click a row or{' '}
            <strong className="font-medium text-foreground">Load</strong> to restore.{' '}
            <strong className="font-medium text-foreground">Export</strong> / <strong className="font-medium text-foreground">import</strong>{' '}
            JSON backs up or moves the full list.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 pb-2 pt-1">
          <LocalDataPanelContent />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setLocalDataOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (collapsed) {
    return (
      <>
        <aside className="flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col items-center gap-1 border-l border-border bg-card py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => onCollapsedChange(false)}
            aria-expanded={false}
            aria-controls="dsl-controls-panel"
            aria-label="Expand controls panel"
            title="Expand controls"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <div className="min-h-0 flex-1" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setViewMode('code')}
            title="Code — YAML editor in the main area"
            aria-label="Open Code view — YAML editor"
          >
            <FileCode2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setLocalDataOpen(true)}
            title="Local data — workspace history, export & import JSON"
            aria-label="Open local data"
          >
            <Database className="h-4 w-4" aria-hidden />
          </Button>
          {parseError ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400"
              title={parseError}
              aria-label="DSL parse error — switch to Code view to review"
            />
          ) : null}
        </aside>
        {localDataDialog}
      </>
    );
  }

  return (
    <>
      <aside
        id="dsl-controls-panel"
        className="flex h-full min-h-0 min-w-0 shrink-0 flex-col gap-3 overflow-hidden border-l border-border bg-card p-4"
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Controls</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground lg:flex"
            onClick={() => onCollapsedChange(true)}
            aria-expanded={true}
            aria-controls="dsl-controls-panel"
            aria-label="Collapse controls panel"
            title="Collapse controls"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-start gap-3 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-0.5 [scrollbar-gutter:stable]">
          <WorkbenchRunwayControls />
          <RightPanelSection
            expanded={dslAuthoringExpanded}
            onExpandedChange={setDslAuthoringExpanded}
            title={viewMode === 'code' ? 'DSL assistant' : 'DSL authoring'}
            fillHeight={false}
            className="w-full shrink-0 self-start border-border/60 bg-muted/15"
            collapsedSummary={
              viewMode === 'code' ? (
                <span>Open for BYOK chat, model picker, and apply preview.</span>
              ) : (
                <span>
                  View mode → <span className="font-medium text-foreground/85">Code</span> for YAML and the assistant.
                </span>
              )
            }
            headerExtras={
              parseError ? (
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400"
                  title={parseError}
                  aria-label="Parse error"
                />
              ) : null
            }
          >
            {viewMode === 'code' ? (
              <div className="flex w-full flex-col justify-start border-t border-border/50 bg-background/20 px-3 pb-3 pt-3 dark:bg-background/10">
                <DslAssistantPanel />
              </div>
            ) : (
              <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 bg-background/20 px-3 pb-3 pt-3 dark:bg-background/10">
                <p className="text-xs leading-snug text-muted-foreground">
                  Use <span className="font-medium text-foreground/85">Code</span> in{' '}
                  <span className="font-medium text-foreground/85">View mode</span> for the YAML editor and this
                  assistant. Switch to <span className="font-medium text-foreground/85">Technology</span> or{' '}
                  <span className="font-medium text-foreground/85">Business</span> to run the model on the runway.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-center gap-2 text-xs font-medium"
                  onClick={() => setViewMode('code')}
                  title="Open Code view"
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  Open Code view
                </Button>
              </div>
            )}
          </RightPanelSection>
          <RiskModelPanel />
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 border-t border-border/60 bg-card/40 px-0 pt-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-normal leading-none"
            onClick={() => setLocalDataOpen(true)}
            title="History table, export & import JSON"
            aria-label="Open local data — workspace history"
          >
            <Database className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            Local data
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-normal leading-none"
            onClick={() => {
              saveNamedWorkspaceInteractive();
            }}
            title="Save workspace snapshot (DSL + config) to browser history"
            aria-label="Save workspace snapshot"
          >
            <Save className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            Save snapshot
          </Button>
        </div>
      </aside>
      {localDataDialog}
    </>
  );
}
