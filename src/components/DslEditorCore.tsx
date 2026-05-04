import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import {
  ALargeSmall,
  AlertCircle,
  Check,
  ListOrdered,
  Map,
  Play,
  RotateCcw,
  Sparkles,
  WrapText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtcStore } from '@/store/useAtcStore';
import {
  capacityYamlThemeId,
  registerCapacityYamlThemes,
} from '@/lib/monacoCapacityThemes';
import { registerDslEditorFlush } from '@/lib/dslEditorSyncBridge';
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
      <span className="font-mono text-foreground/80">bau.market_it_weekly_load.weekday_intensity</span> (legacy{' '}
      <span className="font-mono text-foreground/80">weekly_pattern</span> and top-level{' '}
      <span className="font-mono text-foreground/80">tech:</span> still parse; prefer <strong>0–1</strong> numbers;
      named levels still work), use{' '}
      <span className="font-mono text-foreground/80">default</span> (or{' '}
      <span className="font-mono text-foreground/80">weekdays</span> /{' '}
      <span className="font-mono text-foreground/80">weekend</span>) plus per-day overrides instead of listing all seven
      days. Under <span className="font-mono text-foreground/80">public_holidays</span> and{' '}
      <span className="font-mono text-foreground/80">school_holidays</span>, optional{' '}
      <span className="font-mono text-foreground/80">ranges:</span> (list of{' '}
      <span className="font-mono text-foreground/80">from</span> / <span className="font-mono text-foreground/80">to</span>{' '}
      ISO dates, inclusive) expands to calendar days and merges with <span className="font-mono text-foreground/80">dates:</span>.{' '}
      Other optional keys under that BAU block: <span className="font-mono text-foreground/80">labs_multiplier</span> /{' '}
      <span className="font-mono text-foreground/80">teams_multiplier</span>,{' '}
      <span className="font-mono text-foreground/80">trading.monthly_pattern</span> (optional Jan–Dec{' '}
      <strong>0–1</strong> multipliers on weekly store level),{' '}
      <span className="font-mono text-foreground/80">extra_support_weekdays</span> /{' '}
      <span className="font-mono text-foreground/80">extra_support_months</span> (optional Market IT–only readiness
      rhythm; monthly defaults to <strong>1</strong>),{' '}
      <span className="font-mono text-foreground/80">trading.seasonal</span> (annual store wave),{' '}
      <span className="font-mono text-foreground/80">prep_before_live_days</span> +{' '}
      <span className="font-mono text-foreground/80">live_support_load</span> /{' '}
      <span className="font-mono text-foreground/80">live_support_scale</span> (campaign lead vs live),{' '}
      <span className="font-mono text-foreground/80">operating_windows</span> with{' '}
      <span className="font-mono text-foreground/80">ramp_in_days</span>,{' '}
      <span className="font-mono text-foreground/80">ramp_out_days</span>,{' '}
      <span className="font-mono text-foreground/80">envelope</span> (smoothstep),{' '}
      <span className="font-mono text-foreground/80">holidays.capacity_taper_days</span>, campaign{' '}
      <span className="font-mono text-foreground/80">replaces_bau_tech</span> (prep + live when campaign carries tech), optional top-level{' '}
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

export type DslEditorMarketTabBinding = {
  /** One `market:` / `country:` document — updates merged workspace on change. */
  marketId: string;
  text: string;
  onTextChange: (value: string) => void;
};

function applyCapacitySpecMarkers(
  monaco: Monaco,
  editor: Parameters<OnMount>[0],
  parseErrorVal: string | null
) {
  const model = editor.getModel();
  if (!model) return;
  const msg = parseErrorVal?.trim();
  if (msg) {
    const endCol = Math.max(1, model.getLineMaxColumn(1));
    monaco.editor.setModelMarkers(model, 'capacity-spec', [
      {
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: endCol,
        message: msg,
      },
    ]);
  } else {
    monaco.editor.setModelMarkers(model, 'capacity-spec', []);
  }
}

type DslEditorCoreProps = {
  /** Wrapper around Monaco (extra classes). */
  editorWrapClassName?: string;
  /** Fixed CSS height for the editor (e.g. modal); omit for flex fill. */
  editorFixedHeight?: string;
  description?: 'full' | 'none';
  /** Extra actions after editor actions (e.g. modal Done). */
  trailingActions?: ReactNode;
  className?: string;
  /** Monaco font size (px). */
  initialFontSize?: number;
  /** When false, hide Apply — e.g. main Code view applies on switching back to a heatmap lens. */
  showApplyButton?: boolean;
  /** `studio` = gradient chrome, status bar, stronger frame (main Code view). */
  editorChrome?: DslEditorChrome;
  /**
   * Code view market tabs: bind Monaco to one document; omit to use store `dslText` only.
   */
  marketTabDocument?: DslEditorMarketTabBinding | null;
  /** Tighter vertical chrome when the parent is a mobile full-viewport shell. */
  fillVerticalSpace?: boolean;
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
  marketTabDocument = null,
  fillVerticalSpace = false,
}: DslEditorCoreProps) {
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  /** Long YAML: minimap off by default (toggle in toolbar). */
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [lineNumbers, setLineNumbers] = useState<'on' | 'off'>('on');
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });

  const studio = editorChrome === 'studio';

  const dslText = useAtcStore((s) => s.dslText);
  const parseError = useAtcStore((s) => s.parseError);
  const dslAssistantEditorLock = useAtcStore((s) => s.dslAssistantEditorLock);
  const dslMutationLocked = useAtcStore((s) => s.dslMutationLocked);
  const theme = useAtcStore((s) => s.theme);
  const setDslText = useAtcStore((s) => s.setDslText);

  const tabOnChangeRef = useRef(marketTabDocument?.onTextChange);
  tabOnChangeRef.current = marketTabDocument?.onTextChange;

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const editorValue = marketTabDocument?.text ?? dslText;
  const handleEditorChange = useCallback((v: string | undefined) => {
    const tabFn = tabOnChangeRef.current;
    if (tabFn) tabFn(v ?? '');
    else setDslText(v ?? '');
  }, [setDslText]);
  const applyDsl = useAtcStore((s) => s.applyDsl);
  const resetDsl = useAtcStore((s) => s.resetDsl);

  const [applyFeedback, setApplyFeedback] = useState<'idle' | 'success' | 'fail'>('idle');
  const applyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearApplyFeedbackTimer = useCallback(() => {
    if (applyFeedbackTimer.current) {
      clearTimeout(applyFeedbackTimer.current);
      applyFeedbackTimer.current = null;
    }
  }, []);

  const handleApplyClick = useCallback(() => {
    clearApplyFeedbackTimer();
    applyDsl();
    const err = useAtcStore.getState().parseError;
    setApplyFeedback(err ? 'fail' : 'success');
    applyFeedbackTimer.current = setTimeout(() => {
      setApplyFeedback('idle');
      applyFeedbackTimer.current = null;
    }, err ? 5000 : 2200);
  }, [applyDsl, clearApplyFeedbackTimer]);

  useEffect(() => () => clearApplyFeedbackTimer(), [clearApplyFeedbackTimer]);

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: minimapEnabled, scale: studio ? (0.9 as const) : (0.85 as const) },
      fontSize,
      fontFamily: DSL_EDITOR_FONT_STACK,
      fontLigatures: true,
      wordWrap,
      lineNumbers,
      readOnly: dslAssistantEditorLock || dslMutationLocked,
      scrollBeyondLastLine: false,
      tabSize: 2,
      automaticLayout: true,
      padding: { top: studio ? 14 : 8, bottom: studio ? 14 : 8 },
      smoothScrolling: true,
      cursorBlinking: 'smooth' as const,
      cursorSmoothCaretAnimation: 'on' as const,
      bracketPairColorization: { enabled: true },
      glyphMargin: true,
      stickyScroll: { enabled: true },
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
    [
      fontSize,
      wordWrap,
      minimapEnabled,
      lineNumbers,
      studio,
      dslAssistantEditorLock,
      dslMutationLocked,
    ]
  );

  const isDark = theme === 'dark';

  const monacoTheme = capacityYamlThemeId(isDark);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerCapacityYamlThemes(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyCapacitySpecMarkers(monaco, editor, useAtcStore.getState().parseError);
    const sync = () => {
      const p = editor.getPosition();
      if (p) setCursorPos({ line: p.lineNumber, column: p.column });
    };
    sync();
    editor.onDidChangeCursorPosition(sync);
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    applyCapacitySpecMarkers(monaco, editor, parseError);
  }, [parseError, editorValue]);

  useEffect(() => {
    registerDslEditorFlush(() => {
      const ed = editorRef.current;
      if (!ed || dslAssistantEditorLock || dslMutationLocked) return;
      const v = ed.getValue();
      const tabFn = tabOnChangeRef.current;
      if (tabFn) tabFn(v);
      else useAtcStore.getState().setDslText(v);
    });
    return () => {
      registerDslEditorFlush(null);
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, [dslAssistantEditorLock, dslMutationLocked]);

  const displaySource = editorValue;
  const lineCount = displaySource.split('\n').length;
  const charCount = displaySource.length;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        fillVerticalSpace ? 'gap-1' : 'gap-2',
        fillVerticalSpace && 'h-full min-h-0',
        className
      )}
    >
      {description === 'full' ? <DslSyntaxHelpBody /> : null}

      <div
        className={cn(
          'flex min-h-0 w-full flex-col overflow-hidden bg-background',
          editorFixedHeight ? 'shrink-0' : 'min-h-0 flex-1',
          studio
            ? 'rounded-lg border border-border/60 shadow-sm'
            : 'rounded-md border border-border',
          editorWrapClassName
        )}
        style={editorFixedHeight ? ({ height: editorFixedHeight } as CSSProperties) : undefined}
      >
        <div
          className={cn(
            'flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5',
            studio ? 'bg-muted/15' : 'border-b border-border/80 bg-muted/25'
          )}
          role="toolbar"
          aria-label="Editor appearance"
        >
          <div className="flex flex-wrap items-center gap-1">
            {studio ? (
              <span className="mr-1 flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
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
        {dslAssistantEditorLock && studio ? (
          <div
            className="flex shrink-0 items-center gap-2 bg-muted/25 px-3 py-1.5 text-[11px] font-medium text-foreground"
            role="status"
            aria-live="polite"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Assistant is updating this buffer — editing is paused until the response finishes or you stop.
          </div>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1">
          <Editor
            key={marketTabDocument ? `dsl-tab-${marketTabDocument.marketId}` : 'dsl-single'}
            height="100%"
            defaultLanguage="yaml"
            theme={monacoTheme}
            value={editorValue}
            onChange={handleEditorChange}
            options={editorOptions}
            beforeMount={handleBeforeMount as BeforeMount}
            onMount={handleMount}
            loading={
              <div
                className={cn(
                  'flex h-full min-h-[12rem] items-center justify-center text-sm font-medium',
                  isDark ? 'bg-[#0f0f14] text-violet-200/80' : 'bg-[#f8fafc] text-muted-foreground'
                )}
              >
                Loading editor…
              </div>
            }
          />
        </div>
        {studio ? (
          <div className="flex shrink-0 items-center justify-between gap-2 bg-muted/10 px-3 py-1.5">
            <p className="font-mono text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground">Capacity</span> syntax
              theme · keys / dates / strings highlighted
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

      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {studio ? (
            <Button
              type="button"
              size="sm"
              variant={applyFeedback === 'success' ? 'secondary' : 'default'}
              className={cn(
                'h-8 gap-1.5 px-3 text-xs font-medium transition-[box-shadow,colors] duration-200',
                applyFeedback === 'success' &&
                  'border border-emerald-500/45 bg-emerald-500/10 text-emerald-900 shadow-[0_0_0_1px_rgba(16,185,129,0.25)] dark:text-emerald-100',
                applyFeedback === 'fail' && 'ring-2 ring-destructive/40 ring-offset-2 ring-offset-background'
              )}
              disabled={dslAssistantEditorLock}
              onClick={handleApplyClick}
              aria-label="Apply YAML — parse editor and refresh the runway model"
              title={
                dslAssistantEditorLock
                  ? 'Wait for the assistant to finish updating the editor.'
                  : 'Parse this YAML and refresh the heatmap. Switching to another view also applies.'
              }
            >
              {applyFeedback === 'success' ? (
                <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              )}
              {applyFeedback === 'success' ? 'Applied' : 'Apply YAML'}
            </Button>
          ) : showApplyButton ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className={cn(
                'h-7 w-7 shrink-0 gap-0 p-0',
                applyFeedback === 'success' && 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100',
                applyFeedback === 'fail' && 'ring-2 ring-destructive/45'
              )}
              disabled={dslAssistantEditorLock}
              onClick={handleApplyClick}
              aria-label="Apply DSL — re-run the model"
              title={
                dslAssistantEditorLock
                  ? 'Wait for the assistant to finish.'
                  : applyFeedback === 'success'
                    ? 'Applied — runway updated'
                    : 'Apply DSL — re-run the model'
              }
            >
              {applyFeedback === 'success' ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn('shrink-0 gap-0 p-0', studio ? 'h-8 w-8' : 'h-7 w-7')}
            onClick={() => resetDsl()}
            aria-label="Reset DSL to saved defaults"
            title="Reset DSL"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          {applyFeedback === 'success' ? (
            <span
              className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
              role="status"
              aria-live="polite"
            >
              Runway updated from YAML.
            </span>
          ) : null}
          {applyFeedback === 'fail' ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              Could not apply — fix the error above.
            </span>
          ) : null}
          {trailingActions}
        </div>
        {studio ? (
          <p className="text-[10px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/80">Apply YAML</span> updates the model from the editor.
            Switching away from Code still applies automatically.
            {dslAssistantEditorLock ? (
              <>
                {' '}
                <span className="text-amber-700/90 dark:text-amber-400/90">Apply is paused while the assistant edits.</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
