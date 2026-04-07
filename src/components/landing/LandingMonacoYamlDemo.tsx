import { useCallback, useMemo, useState } from 'react';
import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import {
  ALargeSmall,
  Columns2,
  ListOrdered,
  Map,
  MoreVertical,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  WrapText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
import { capacityYamlThemeId, registerCapacityYamlThemes } from '@/lib/monacoCapacityThemes';
import { cn } from '@/lib/utils';

const FONT_STACK =
  "'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace";

const TAB_MARKETS = ['AT', 'AU', 'BE', 'CA', 'CH', 'CZ', 'DE', 'ES', 'FR'] as const;

const FONT_MIN = 10;
const FONT_MAX = 22;
const FONT_INITIAL = 16;

/**
 * Short, syntax-rich sample for the landing Monaco — hits comments, keys, strings,
 * ints/floats, lists, and nested blocks so the Capacity YAML theme reads clearly.
 */
const LANDING_YAML_PLACEHOLDER = `# ── Landing preview (sample) — not live workspace data ─────────────
# Capacity theme: comments, keys, numbers, dates & quoted strings are distinct.

---
market: AU
title: "Australia"

# Resources — labs, headcount, test parallelism
resources:
  labs:
    capacity: 6
  staff:
    capacity: 4
    monthly_pattern_basis: absolute
    monthly_pattern:
      Jan: 4
      Jul: 3
      Dec: 2
  testing_capacity: 4

# BAU — weekday_intensity uses 0–1; day codes are mo..sun
bau:
  days_in_use: [mo, tu, we, th, fr, sa, su]
  market_it_weekly_load:
    weekday_intensity:
      Mon: 0.866
      Tue: 0.747
      Wed: 0.342
      Thu: 0.269
      Fri: 0.452
      Sat: 0.229
      Sun: 0.241

trading:
  monthly_pattern:
    Jan: 0.94
    Jun: 0.52
    Nov: 0.88
    Dec: 1.0
  seasonal:
    amplitude: 0.15
    peak_month: 11

campaigns:
  - name: "Easter campaign (illustrative)"
    start_date: '2026-04-06'
    duration: 30
    testing_prep_duration: 28
    impact: medium
    business_uplift: 1.0
    live_tech_load_scale: 1
    campaign_support:
      labs_required: 1
      tech_staff: 1

public_holidays:
  auto: false
  dates: []
  staffing_multiplier: 1.0
`;

export default function LandingMonacoYamlDemo() {
  const [fontSize, setFontSize] = useState(FONT_INITIAL);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [lineNumbers, setLineNumbers] = useState<'on' | 'off'>('on');
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });

  const value = LANDING_YAML_PLACEHOLDER;
  const lineCount = value.split('\n').length;
  const charCount = value.length;

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: minimapEnabled, scale: 0.85 as const },
      fontSize,
      fontFamily: FONT_STACK,
      fontLigatures: true,
      wordWrap,
      lineNumbers,
      readOnly: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
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
    [fontSize, wordWrap, minimapEnabled, lineNumbers]
  );

  const monacoTheme = capacityYamlThemeId(true);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerCapacityYamlThemes(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editor) => {
    requestAnimationFrame(() => editor.layout());
    const sync = () => {
      const p = editor.getPosition();
      if (p) setCursorPos({ line: p.lineNumber, column: p.column });
    };
    sync();
    editor.onDidChangeCursorPosition(sync);
  }, []);

  /** Monaco `height="100%"` only works if this wrapper has a definite height (flex + % often collapses to 0). */
  const editorBoxH = 'min(52vh, 440px)';

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-violet-500/25 bg-[#0f0f14] shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_24px_60px_-12px_rgba(0,0,0,0.55)]">
      <div className="shrink-0 border-b border-violet-500/20 bg-gradient-to-r from-[#12101c] via-[#1a1428] to-[#12101c] px-2 py-1.5">
        <p className="mb-2 font-mono text-[10px] tabular-nums text-zinc-500">
          MarketZero Workbench v{APP_VERSION} · {GIT_COMMIT_SHORT}
        </p>
        <div
          className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Sample market tabs (AU selected — illustrative only)"
        >
          {TAB_MARKETS.map((id) => {
            const sel = id === 'AU';
            return (
              <div
                key={id}
                className={cn(
                  'flex shrink-0 cursor-default items-center gap-1.5 rounded-lg border px-2 py-1 font-landing text-[11px] font-semibold select-none',
                  sel
                    ? 'border-violet-400/50 bg-violet-500/20 text-violet-100 shadow-[0_0_20px_-4px_rgba(139,92,246,0.55)]'
                    : 'border-transparent bg-white/[0.03] text-zinc-500'
                )}
              >
                <MarketCircleFlag marketId={id} size={18} className="ring-white/10" />
                {id}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-violet-500/20 bg-gradient-to-r from-[#12101c] via-[#1a1428] to-[#12101c] px-2 py-1.5"
        role="toolbar"
        aria-label="Editor toolbar"
      >
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-200">
            <Sparkles className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
            YAML
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Search"
            title="Search (demo)"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            disabled={fontSize <= FONT_MIN}
            onClick={() => setFontSize((n) => Math.max(FONT_MIN, n - 1))}
            aria-label="Smaller text"
            title="Smaller text"
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            disabled={fontSize >= FONT_MAX}
            onClick={() => setFontSize((n) => Math.min(FONT_MAX, n + 1))}
            aria-label="Larger text"
            title="Larger text"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            onClick={() => setFontSize(FONT_INITIAL)}
            aria-label="Reset text size"
            title="Reset text size"
          >
            <ALargeSmall className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <span className="select-none tabular-nums text-[10px] text-zinc-500" aria-live="polite">
            Aa {fontSize}px
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <span
            className="mr-2 hidden font-mono text-[10px] tabular-nums text-zinc-500 sm:inline"
            aria-live="polite"
          >
            Ln {cursorPos.line}, Col {cursorPos.column}
            <span className="text-zinc-600"> · </span>
            {lineCount} lines · {charCount.toLocaleString()} chars
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Menu"
            title="Menu (demo)"
          >
            <MoreVertical className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100',
              wordWrap === 'on' && 'bg-white/10 text-zinc-100'
            )}
            onClick={() => setWordWrap((w) => (w === 'on' ? 'off' : 'on'))}
            aria-label="Toggle word wrap"
            title="Word wrap"
          >
            <WrapText className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 shrink-0 gap-1 px-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-100',
              lineNumbers === 'on' && 'bg-white/10 text-zinc-100'
            )}
            onClick={() => setLineNumbers((n) => (n === 'on' ? 'off' : 'on'))}
            aria-label="Toggle line numbers"
            title="Line numbers"
          >
            <ListOrdered className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="select-none text-[10px] font-medium leading-none">Lines</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100',
              minimapEnabled && 'bg-white/10 text-zinc-100'
            )}
            onClick={() => setMinimapEnabled((v) => !v)}
            aria-label="Toggle minimap"
            title="Minimap"
          >
            <Map className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 gap-0 p-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Split editor (demo)"
            title="Split view (demo)"
          >
            <Columns2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
      </div>

      <div
        className="relative isolate z-0 w-full min-w-0 overflow-hidden bg-[#0f0f14]"
        style={{ height: editorBoxH, minHeight: 280 }}
      >
        <Editor
          height="100%"
          defaultLanguage="yaml"
          theme={monacoTheme}
          value={value}
          options={editorOptions}
          beforeMount={handleBeforeMount as BeforeMount}
          onMount={handleMount}
          loading={
            <div
              className="flex w-full items-center justify-center bg-[#0f0f14] text-sm font-medium text-violet-200/80"
              style={{ height: editorBoxH, minHeight: 280 }}
            >
              Loading editor…
            </div>
          }
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-violet-500/15 bg-black/30 px-3 py-1.5">
        <p className="font-mono text-[10px] text-zinc-500">
          <span className="text-violet-300">Capacity</span> syntax theme · keys / dates / strings highlighted
        </p>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500 sm:hidden">
          {cursorPos.line}:{cursorPos.column}
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-violet-500/15 bg-[#0c0c10] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-500"
            disabled
            title="Open the workbench to edit and apply YAML"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Apply YAML
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 shrink-0 border-violet-500/30 p-0 text-zinc-300 hover:bg-white/5"
            disabled
            aria-label="Reset (demo)"
            title="Reset (demo)"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
        <p className="text-[10px] leading-snug text-zinc-600">
          Apply YAML updates the model from the editor. Switching away from Code still applies automatically — open the
          workbench to try it.
        </p>
      </div>
    </div>
  );
}
