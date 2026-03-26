import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import {
  ALargeSmall,
  BookOpen,
  ListOrdered,
  Map,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  WrapText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtcStore } from '@/store/useAtcStore';
import { saveNamedWorkspaceInteractive } from '@/lib/workspaceSnapshot';
import {
  capacityYamlThemeId,
  registerCapacityYamlThemes,
} from '@/lib/monacoCapacityThemes';
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
      <span className="font-mono text-foreground/80">tech.weekly_pattern</span> (prefer <strong>0–1</strong> numbers;
      named levels still work), use{' '}
      <span className="font-mono text-foreground/80">default</span> (or{' '}
      <span className="font-mono text-foreground/80">weekdays</span> /{' '}
      <span className="font-mono text-foreground/80">weekend</span>) plus per-day overrides instead of listing all seven
      days. Other optional keys: <span className="font-mono text-foreground/80">tech.labs_scale</span> /{' '}
      <span className="font-mono text-foreground/80">teams_scale</span>,{' '}
      <span className="font-mono text-foreground/80">trading.monthly_pattern</span> (optional Jan–Dec{' '}
      <strong>0–1</strong> multipliers on weekly store level),{' '}
      <span className="font-mono text-foreground/80">trading.seasonal</span> (annual store wave),{' '}
      <span className="font-mono text-foreground/80">prep_before_live_days</span> +{' '}
      <span className="font-mono text-foreground/80">live_support_load</span> /{' '}
      <span className="font-mono text-foreground/80">live_support_scale</span> (campaign lead vs live),{' '}
      <span className="font-mono text-foreground/80">operating_windows</span> with{' '}
      <span className="font-mono text-foreground/80">ramp_in_days</span>,{' '}
      <span className="font-mono text-foreground/80">ramp_out_days</span>,{' '}
      <span className="font-mono text-foreground/80">envelope</span> (smoothstep),{' '}
      <span className="font-mono text-foreground/80">holidays.capacity_taper_days</span>, campaign{' '}
      <span className="font-mono text-foreground/80">replaces_bau_tech</span>, optional top-level{' '}
      <span className="font-mono text-foreground/80">title</span> /{' '}
      <span className="font-mono text-foreground/80">description</span>, and optional{' '}
      <span className="font-mono text-foreground/80">releases</span> (deploy phases with{' '}
      <span className="font-mono text-foreground/80">systems</span>,{' '}
      <span className="font-mono text-foreground/80">phases</span>,{' '}
      <span className="font-mono text-foreground/80">load</span>).
    </p>
  );
}

const DSL_EDITOR_FONT_STACK =
  "'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace";

const DSL_EDITOR_FONT_DEFAULT = 13;
const DSL_EDITOR_FONT_MIN = 10;
const DSL_EDITOR_FONT_MAX = 22;

export type DslEditorChrome = 'default' | 'studio';

type DslEditorCoreProps = {
  /** Wrapper around Monaco (extra classes). */
  editorWrapClassName?: string;
  /** Fixed CSS height for the editor (e.g. modal); omit for flex fill. */
  editorFixedHeight?: string;
  description?: 'full' | 'none';
  /** Extra actions after Save snapshot (e.g. modal Done). */
  trailingActions?: ReactNode;
  className?: string;
  /** Monaco font size (px). */
  initialFontSize?: number;
  /** When false, hide Apply — e.g. main Code view applies on switching back to a heatmap lens. */
  showApplyButton?: boolean;
  /** `studio` = gradient chrome, status bar, stronger frame (main Code view). */
  editorChrome?: DslEditorChrome;
  /** When set, studio toolbar shows a syntax reference control (e.g. open dialog). */
  onSyntaxReference?: () => void;
};

export function DslEditorCore({
  editorWrapClassName,
  editorFixedHeight,
  description = 'none',
  trailingActions,
  className,
  initialFontSize = DSL_EDITOR_FONT_DEFAULT,
  showApplyButton = true,
  editorChrome = 'default',
  onSyntaxReference,
}: DslEditorCoreProps) {
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [lineNumbers, setLineNumbers] = useState<'on' | 'off'>('on');
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });

  const studio = editorChrome === 'studio';

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: minimapEnabled, scale: studio ? (0.9 as const) : (0.85 as const) },
      fontSize,
      fontFamily: DSL_EDITOR_FONT_STACK,
      fontLigatures: true,
      wordWrap,
      lineNumbers,
      scrollBeyondLastLine: false,
      tabSize: 2,
      automaticLayout: true,
      padding: { top: studio ? 14 : 8, bottom: studio ? 14 : 8 },
      smoothScrolling: true,
      cursorBlinking: 'smooth' as const,
      cursorSmoothCaretAnimation: 'on' as const,
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
        highlightActiveIndentation: true,
      },
      renderLineHighlight: 'line' as const,
      occurrencesHighlight: 'singleFile' as const,
      folding: true,
      foldingHighlight: true,
      matchBrackets: 'always' as const,
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
    }),
    [fontSize, wordWrap, minimapEnabled, lineNumbers, studio]
  );

  const dslText = useAtcStore((s) => s.dslText);
  const parseError = useAtcStore((s) => s.parseError);
  const theme = useAtcStore((s) => s.theme);
  const isDark = theme === 'dark';
  const setDslText = useAtcStore((s) => s.setDslText);
  const applyDsl = useAtcStore((s) => s.applyDsl);
  const resetDsl = useAtcStore((s) => s.resetDsl);

  const monacoTheme = capacityYamlThemeId(isDark);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerCapacityYamlThemes(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editor) => {
    const sync = () => {
      const p = editor.getPosition();
      if (p) setCursorPos({ line: p.lineNumber, column: p.column });
    };
    sync();
    editor.onDidChangeCursorPosition(sync);
  }, []);

  const handleSaveScenario = () => {
    const id = saveNamedWorkspaceInteractive();
    if (id) window.alert('Saved to history in this browser. Open Local data to load or export.');
  };

  const lineCount = dslText.split('\n').length;
  const charCount = dslText.length;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', className)}>
      {description === 'full' ? <DslSyntaxHelpBody /> : null}

      <div
        className={cn(
          'flex min-h-0 w-full flex-col overflow-hidden bg-background',
          editorFixedHeight ? 'shrink-0' : 'min-h-0 flex-1',
          studio
            ? 'rounded-2xl border border-violet-500/25 shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_20px_50px_-15px_rgba(0,0,0,0.35)] dark:shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_24px_60px_-12px_rgba(0,0,0,0.55)]'
            : 'rounded-md border border-border',
          editorWrapClassName
        )}
        style={editorFixedHeight ? ({ height: editorFixedHeight } as CSSProperties) : undefined}
      >
        <div
          className={cn(
            'flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-2 py-1.5',
            studio
              ? 'border-violet-500/20 bg-gradient-to-r from-violet-100/90 via-fuchsia-50/80 to-violet-100/90 dark:from-[#12101c] dark:via-[#1a1428] dark:to-[#12101c]'
              : 'border-border/80 bg-muted/25'
          )}
          role="toolbar"
          aria-label="Editor appearance"
        >
          <div className="flex flex-wrap items-center gap-1">
            {studio ? (
              <span className="mr-1 flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/15 dark:text-violet-200">
                <Sparkles className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                YAML
              </span>
            ) : null}
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
              onClick={() => setFontSize(initialFontSize)}
              aria-label="Reset text size"
              title="Reset text size"
            >
              <ALargeSmall className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Button>
            <span
              className="select-none tabular-nums text-[10px] text-muted-foreground"
              aria-live="polite"
            >
              {fontSize}px
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-0.5">
            {studio && onSyntaxReference ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mr-1 h-7 shrink-0 gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={onSyntaxReference}
                aria-label="Open DSL syntax reference"
                title="DSL syntax reference"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                <span className="hidden text-[10px] font-medium sm:inline">Syntax</span>
              </Button>
            ) : null}
            {studio ? (
              <span
                className="mr-2 hidden font-mono text-[10px] tabular-nums text-muted-foreground sm:inline"
                aria-live="polite"
              >
                Ln {cursorPos.line}, Col {cursorPos.column}
                <span className="text-muted-foreground/60"> · </span>
                {lineCount} lines · {charCount.toLocaleString()} chars
              </span>
            ) : null}
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
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="yaml"
            theme={monacoTheme}
            value={dslText}
            onChange={(v) => setDslText(v ?? '')}
            options={editorOptions}
            beforeMount={handleBeforeMount as BeforeMount}
            onMount={handleMount}
            loading={
              <div className="flex h-full min-h-[12rem] items-center justify-center bg-[#0f0f14] text-sm font-medium text-violet-200/80 dark:bg-[#0f0f14]">
                Loading editor…
              </div>
            }
          />
        </div>
        {studio ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-violet-500/15 bg-muted/20 px-3 py-1.5 dark:bg-black/20">
            <p className="font-mono text-[10px] text-muted-foreground">
              <span className="text-violet-600 dark:text-violet-300">Capacity</span> syntax theme · keys / dates /
              strings highlighted
            </p>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground sm:hidden">
              {cursorPos.line}:{cursorPos.column}
            </span>
          </div>
        ) : null}
      </div>

      {parseError ? (
        <p className="shrink-0 rounded-lg border border-red-400/40 bg-gradient-to-r from-red-500/15 to-orange-500/10 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-500/35 dark:from-red-950/50 dark:to-orange-950/30 dark:text-red-200">
          {parseError}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {showApplyButton ? (
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
        ) : null}
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
          aria-label="Save workspace snapshot to this browser"
          title="Save workspace snapshot"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
        {trailingActions}
      </div>
    </div>
  );
}
