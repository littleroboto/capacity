import { useEffect, useState } from 'react';
import { DslPanelClerkSignOut } from '@/components/DslPanelClerkSignOut';
import { HeatmapSettingsPanel } from '@/components/HeatmapSettingsPanel';
import { LocalDataPanelContent } from '@/components/LocalDataSection';
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
import { isRunwayAllMarkets } from '@/lib/markets';
import { OPEN_WORKSPACE_EVENT } from '@/lib/sharedDslSync';
import { useAtcStore } from '@/store/useAtcStore';
import { ChevronLeft, ChevronRight, Database, FileCode2, SlidersHorizontal } from 'lucide-react';

type DSLPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

/** Sits in a split layout: runway/heatmap left, controls + workbench right. */
export function DSLPanel({ collapsed, onCollapsedChange }: DSLPanelProps) {
  const [localDataOpen, setLocalDataOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setLocalDataOpen(true);
    window.addEventListener(OPEN_WORKSPACE_EVENT, open);
    return () => window.removeEventListener(OPEN_WORKSPACE_EVENT, open);
  }, []);
  const parseError = useAtcStore((s) => s.parseError);
  const country = useAtcStore((s) => s.country);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const viewMode = useAtcStore((s) => s.viewMode);
  const resetRiskTuning = useAtcStore((s) => s.resetRiskTuning);
  const compareAllMarkets = isRunwayAllMarkets(country);

  const settingsDialog = (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-h-[min(88dvh,720px)] gap-0 overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-pretty">
            Runway palette and campaign overlay; heatmap transfer (curve, γ, high-end power for Technology Teams) appears
            here for <strong className="font-medium text-foreground">Technology Teams</strong> and{' '}
            <strong className="font-medium text-foreground">Code</strong>.{' '}
            <strong className="font-medium text-foreground">Market risk</strong> has its own transfer, pressure offset,
            and scalers under <strong className="font-medium text-foreground">Business Patterns</strong>.{' '}
            <strong className="font-medium text-foreground">Restaurant Activity</strong> follows the YAML curve and
            business γ (no separate high-end power on that lens).
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-5 pb-2 pt-1">
          <HeatmapSettingsPanel
            showCampaignBoost={viewMode !== 'combined'}
            showHeatmapTransferTuning={viewMode !== 'in_store' && viewMode !== 'market_risk'}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetRiskTuning();
            }}
          >
            Reset tuning
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const localDataDialog = (
    <Dialog open={localDataOpen} onOpenChange={setLocalDataOpen}>
      <DialogContent className="max-h-[min(88dvh,720px)] gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Workspace</DialogTitle>
          <DialogDescription className="text-pretty">
            Team YAML on the cloud (when enabled) and reset options for this browser — each section below is separate.
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
          {!compareAllMarkets ? (
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
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setLocalDataOpen(true)}
            title="Workspace — team cloud and reset"
            aria-label="Open workspace data"
          >
            <Database className="h-4 w-4" aria-hidden />
          </Button>
          <DslPanelClerkSignOut collapsed />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setSettingsOpen(true)}
            title="Settings — heatmap curve, γ, campaign, palette"
            aria-label="Open settings"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </Button>
          {parseError ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400"
              title={parseError}
              aria-label={
                compareAllMarkets
                  ? 'DSL parse error — choose a single market in Focus to open Code view and fix YAML'
                  : 'DSL parse error — switch to Code view to review'
              }
            />
          ) : null}
        </aside>
        {localDataDialog}
        {settingsDialog}
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
          <WorkbenchRunwayControls compareAllMarkets={compareAllMarkets} />
          {!compareAllMarkets && parseError ? (
            <div
              className="flex w-full shrink-0 items-center gap-2 rounded-md border border-destructive/35 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
              role="status"
              title={parseError}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400" aria-hidden />
              <span className="min-w-0 leading-snug">
                {viewMode === 'code'
                  ? 'YAML parse error — check the editor.'
                  : 'YAML parse error — choose Code in View mode to fix.'}
              </span>
            </div>
          ) : null}
          {compareAllMarkets ? (
            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/85">Focus</span> a single market for YAML editing, the DSL
              assistant, <span className="font-medium text-foreground/85">Code</span> view, business patterns, and{' '}
              <span className="font-medium text-foreground/85">Settings</span>.
            </p>
          ) : null}
          <RiskModelPanel />
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 border-t border-border/60 bg-card/40 px-0 pt-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-normal leading-none"
            onClick={() => setLocalDataOpen(true)}
            title="Team cloud sync and reset"
            aria-label="Open workspace — cloud and local data"
          >
            <Database className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            Workspace
          </Button>
          <DslPanelClerkSignOut />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-normal leading-none"
            onClick={() => setSettingsOpen(true)}
            title="Heatmap curve, γ, campaign boost, palette"
            aria-label="Open settings — heatmap and display"
          >
            <SlidersHorizontal className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            Settings
          </Button>
        </div>
      </aside>
      {localDataDialog}
      {settingsDialog}
    </>
  );
}
