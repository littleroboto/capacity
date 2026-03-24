import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  ALargeSmall,
  ListOrdered,
  Map,
  Play,
  RotateCcw,
  Save,
  WrapText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtcStore } from '@/store/useAtcStore';
import { saveScenario } from '@/lib/storage';
import { cn } from '@/lib/utils';

/** Long-form YAML reference (also used in the syntax dialog). */
export function DslSyntaxHelpBody({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'text-pretty text-sm leading-relaxed text-muted-foreground',
        className
      )}
    >
      Multiple documents in one file define the multi-country runway. In{' '}
      <span className="font-mono text-foreground/80">trading.weekly_pattern</span> and{' '}
      <span className="font-mono text-foreground/80">tech.weekly_pattern</span>, use{' '}
      <span className="font-mono text-foreground/80">default</span> (or{' '}
      <span className="font-mono text-foreground/80">weekdays</span> /{' '}
      <span className="font-mono text-foreground/80">weekend</span>) plus per-day overrides instead of listing all seven
      days. Other optional keys: <span className="font-mono text-foreground/80">tech.labs_scale</span> /{' '}
      <span className="font-mono text-foreground/80">teams_scale</span>,{' '}
      <span className="font-mono text-foreground/80">trading.seasonal</span> (annual store wave),{' '}
      <span className="font-mono text-foreground/80">prep_before_live_days</span> +{' '}
      <span className="font-mono text-foreground/80">live_support_load</span> /{' '}
      <span className="font-mono text-foreground/80">live_support_scale</span> (campaign lead vs live),{' '}
      <span className="font-mono text-foreground/80">operating_windows</span> with{' '}
      <span className="font-mono text-foreground/80">ramp_in_days</span>,{' '}
      <span className="font-mono text-foreground/80">ramp_out_days</span>,{' '}
      <span className="font-mono text-foreground/80">envelope</span> (smoothstep),{' '}
      <span className="font-mono text-foreground/80">holidays.capacity_taper_days</span>.
    </p>
  );
}

type DslEditorCoreProps = {
  /** Wrapper around Monaco (extra classes). */
  editorWrapClassName?: string;
  /** Fixed CSS height for the editor (e.g. modal); omit for flex fill. */
  editorFixedHeight?: string;
  description?: 'full' | 'none';
  /** Extra actions after Save scenario (e.g. modal Done). */
  trailingActions?: ReactNode;
  className?: string;
};

const DSL_EDITOR_FONT_DEFAULT = 13;
const DSL_EDITOR_FONT_MIN = 10;
const DSL_EDITOR_FONT_MAX = 22;

export function DslEditorCore({
  editorWrapClassName,
  editorFixedHeight,
  description = 'none',
  trailingActions,
  className,
}: DslEditorCoreProps) {
  const [fontSize, setFontSize] = useState(DSL_EDITOR_FONT_DEFAULT);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [lineNumbers, setLineNumbers] = useState<'on' | 'off'>('on');

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: minimapEnabled, scale: 0.85 as const },
      fontSize,
      wordWrap,
      lineNumbers,
      scrollBeyondLastLine: false,
      tabSize: 2,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
    }),
    [fontSize, wordWrap, minimapEnabled, lineNumbers]
  );

  const dslText = useAtcStore((s) => s.dslText);
  const parseError = useAtcStore((s) => s.parseError);
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const theme = useAtcStore((s) => s.theme);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setDslText = useAtcStore((s) => s.setDslText);
  const applyDsl = useAtcStore((s) => s.applyDsl);
  const resetDsl = useAtcStore((s) => s.resetDsl);

  const handleSaveScenario = () => {
    const name = window.prompt('Scenario name');
    if (!name?.trim()) return;
    saveScenario(name.trim(), { dsl: dslText, picker: country, layer: viewMode, riskTuning });
    window.alert('Scenario saved to this browser.');
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', className)}>
      {description === 'full' ? <DslSyntaxHelpBody /> : null}

      <div
        className={cn(
          'flex min-h-0 w-full flex-col overflow-hidden rounded-md border border-border bg-background',
          editorFixedHeight ? 'shrink-0' : 'min-h-0 flex-1',
          editorWrapClassName
        )}
        style={editorFixedHeight ? ({ height: editorFixedHeight } as CSSProperties) : undefined}
      >
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 border-b border-border/80 bg-muted/25 px-1 py-0.5"
          role="toolbar"
          aria-label="Editor appearance"
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-muted-foreground hover:text-foreground"
            disabled={fontSize <= DSL_EDITOR_FONT_MIN}
            onClick={() => setFontSize((n) => Math.max(DSL_EDITOR_FONT_MIN, n - 1))}
            aria-label="Smaller text"
            title="Smaller text"
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-muted-foreground hover:text-foreground"
            disabled={fontSize >= DSL_EDITOR_FONT_MAX}
            onClick={() => setFontSize((n) => Math.min(DSL_EDITOR_FONT_MAX, n + 1))}
            aria-label="Larger text"
            title="Larger text"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setFontSize(DSL_EDITOR_FONT_DEFAULT)}
            aria-label="Reset text size"
            title="Reset text size"
          >
            <ALargeSmall className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <span
            className="mr-0.5 select-none tabular-nums text-[10px] text-muted-foreground"
            aria-live="polite"
          >
            {fontSize}px
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 w-7 shrink-0 gap-0 p-0 text-muted-foreground hover:text-foreground',
              wordWrap === 'on' && 'bg-muted/80 text-foreground'
            )}
            onClick={() => setWordWrap((w) => (w === 'on' ? 'off' : 'on'))}
            aria-label={wordWrap === 'on' ? 'Turn off word wrap' : 'Turn on word wrap'}
            aria-pressed={wordWrap === 'on'}
            title={wordWrap === 'on' ? 'Word wrap on' : 'Word wrap off'}
          >
            <WrapText className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 shrink-0 gap-1 px-2 text-muted-foreground hover:text-foreground',
              lineNumbers === 'on' && 'bg-muted/80 text-foreground'
            )}
            onClick={() => setLineNumbers((n) => (n === 'on' ? 'off' : 'on'))}
            aria-label={lineNumbers === 'on' ? 'Hide line numbers' : 'Show line numbers'}
            aria-pressed={lineNumbers === 'on'}
            title={lineNumbers === 'on' ? 'Line numbers on — click to hide' : 'Line numbers off — click to show'}
          >
            <ListOrdered className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="select-none text-[10px] font-medium leading-none">Lines</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 w-7 shrink-0 gap-0 p-0 text-muted-foreground hover:text-foreground',
              minimapEnabled && 'bg-muted/80 text-foreground'
            )}
            onClick={() => setMinimapEnabled((v) => !v)}
            aria-label={minimapEnabled ? 'Hide minimap' : 'Show minimap'}
            aria-pressed={minimapEnabled}
            title={minimapEnabled ? 'Hide minimap' : 'Show minimap'}
          >
            <Map className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="yaml"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            value={dslText}
            onChange={(v) => setDslText(v ?? '')}
            options={editorOptions}
          />
        </div>
      </div>

      {parseError ? (
        <p className="shrink-0 rounded-md border border-red-300/50 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {parseError}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 w-7 shrink-0 gap-0 p-0"
          onClick={() => applyDsl()}
          aria-label="Apply DSL — re-run the model"
          title="Apply DSL — re-run the model"
        >
          <Play className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 w-7 shrink-0 gap-0 p-0"
          onClick={() => resetDsl()}
          aria-label="Reset DSL to saved defaults"
          title="Reset DSL"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 w-7 shrink-0 gap-0 p-0"
          onClick={handleSaveScenario}
          aria-label="Save scenario to this browser"
          title="Save scenario"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
        {trailingActions}
      </div>
    </div>
  );
}
