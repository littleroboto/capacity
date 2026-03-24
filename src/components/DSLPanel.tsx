import { useState } from 'react';
import { DslEditorCore, DslSyntaxHelpBody } from '@/components/DslEditorCore';
import { LocalDataSection } from '@/components/LocalDataSection';
import { RiskModelPanel } from '@/components/RiskModelPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAtcStore } from '@/store/useAtcStore';
import { BookOpen, ChevronLeft, ChevronRight, FileCode, Rows2 } from 'lucide-react';

type YamlSectionShell = 0 | 1 | 2;

type DSLPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

/** Sits in a split layout: runway/heatmap left, controls + inline DSL editor right. */
export function DSLPanel({ collapsed, onCollapsedChange }: DSLPanelProps) {
  const [syntaxRefOpen, setSyntaxRefOpen] = useState(false);
  const [yamlShell, setYamlShell] = useState<YamlSectionShell>(0);
  const cycleYamlShell = () => setYamlShell((s) => ((s + 1) % 3) as YamlSectionShell);
  const parseError = useAtcStore((s) => s.parseError);
  const yamlShellHint = ['Full header', 'Text strip', 'Icons only'][yamlShell]!;

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col items-center border-l border-border bg-card py-2">
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
        {parseError ? (
          <span
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400"
            title={parseError}
            aria-label="DSL parse error — expand panel for details"
          />
        ) : null}
      </aside>
    );
  }

  return (
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

      <div className="max-h-[min(38vh,320px)] shrink-0 space-y-3 overflow-y-auto overscroll-y-contain pr-0.5">
        <RiskModelPanel />
        <LocalDataSection />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 shadow-sm">
        {yamlShell === 2 ? (
          <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setYamlShell(0)}
              title="Show YAML editor"
              aria-label="Show market configuration editor"
            >
              <FileCode className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setSyntaxRefOpen(true)}
              title="Syntax reference"
              aria-label="Open syntax reference"
            >
              <BookOpen className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={cycleYamlShell}
              title={`Section layout: ${yamlShellHint}`}
              aria-label={`Cycle section layout, ${yamlShellHint}`}
            >
              <Rows2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : yamlShell === 1 ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
              <h3 className="text-xs font-semibold tracking-tight text-foreground">Market Configuration (YAML)</h3>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setSyntaxRefOpen(true)}
                >
                  Syntax reference
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={cycleYamlShell}
                  title={`Layout: ${yamlShellHint}`}
                  aria-label={`Cycle section layout, ${yamlShellHint}`}
                >
                  <Rows2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <DslEditorCore className="min-h-0 min-w-0 flex-1 gap-2" />
          </>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">Market Configuration (YAML)</h3>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 px-2 py-0.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setSyntaxRefOpen(true)}
                >
                  Syntax reference
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={cycleYamlShell}
                  title={`Layout: ${yamlShellHint}. Next: compact strip.`}
                  aria-label={`Cycle section layout, ${yamlShellHint}`}
                >
                  <Rows2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <DslEditorCore className="min-h-0 min-w-0 flex-1 gap-2" />
          </>
        )}
      </div>

      <Dialog open={syntaxRefOpen} onOpenChange={setSyntaxRefOpen}>
        <DialogContent className="max-h-[min(85dvh,720px)] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>DSL syntax reference</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto py-2">
            <DslSyntaxHelpBody />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSyntaxRefOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
