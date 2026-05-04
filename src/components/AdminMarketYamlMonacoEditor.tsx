import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import {
  capacityYamlThemeId,
  registerCapacityYamlThemes,
} from '@/lib/monacoCapacityThemes';
import {
  registerCapacityYamlCompletion,
  registerCapacityYamlMultiDocFolding,
  registerCapacityYamlOutline,
} from '@/lib/monacoCapacityYamlProviders';
import { getSectionBandLineRanges } from '@/lib/monacoCapacityYamlSectionScan';
import { cn } from '@/lib/utils';

const YAML_FONT_STACK =
  "'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace";

const SECTION_BAND_DEBOUNCE_MS = 400;
const SECTION_BAND_DEBOUNCE_REDUCED_MOTION_MS = 550;

function computeSectionBandDecorations(monaco: Monaco, model: editor.ITextModel) {
  const text = model.getValue();
  const ranges = getSectionBandLineRanges(text);
  return ranges.map((r, i) => ({
    range: new monaco.Range(
      r.startLineNumber,
      1,
      r.endLineNumber,
      model.getLineMaxColumn(r.endLineNumber)
    ),
    options: {
      isWholeLine: true,
      className: i % 2 === 0 ? 'cd-yaml-section-band-a' : 'cd-yaml-section-band-b',
    },
  }));
}

function applySectionBandDecorations(
  editor: Parameters<OnMount>[0],
  monaco: Monaco,
  decorationIdsRef: { current: string[] }
) {
  const model = editor.getModel();
  if (!model) return;
  const next = computeSectionBandDecorations(monaco, model);
  decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, next);
}

export type AdminMarketYamlMonacoEditorProps = {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  className?: string;
};

/**
 * Same Monaco YAML stack as the workbench {@link DslEditorCore} (themes, outline,
 * folding, completion, section bands) — without the ATC store / Apply pipeline.
 */
export function AdminMarketYamlMonacoEditor({
  value,
  onChange,
  readOnly = false,
  className,
}: AdminMarketYamlMonacoEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const sectionBandDecoIdsRef = useRef<string[]>([]);
  const sectionBandDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'));
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const monacoTheme = capacityYamlThemeId(isDark);

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: true, scale: 0.85 as const },
      fontSize: 13,
      fontFamily: YAML_FONT_STACK,
      fontLigatures: true,
      wordWrap: 'on' as const,
      lineNumbers: 'on' as const,
      readOnly,
      scrollBeyondLastLine: false,
      tabSize: 2,
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      cursorBlinking: 'smooth' as const,
      bracketPairColorization: { enabled: true },
      glyphMargin: true,
      stickyScroll: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
        highlightActiveIndentation: true,
      },
      renderLineHighlight: 'line' as const,
      folding: true,
      foldingHighlight: true,
      matchBrackets: 'always' as const,
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
    }),
    [readOnly]
  );

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerCapacityYamlThemes(monaco);
    registerCapacityYamlOutline(monaco);
    registerCapacityYamlMultiDocFolding(monaco);
    registerCapacityYamlCompletion(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    sectionBandDecoIdsRef.current = [];

    const debounceMs =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        ? SECTION_BAND_DEBOUNCE_REDUCED_MOTION_MS
        : SECTION_BAND_DEBOUNCE_MS;

    const model = editor.getModel();
    const scheduleSectionBands = () => {
      if (sectionBandDebounceRef.current) clearTimeout(sectionBandDebounceRef.current);
      sectionBandDebounceRef.current = setTimeout(() => {
        sectionBandDebounceRef.current = null;
        applySectionBandDecorations(editor, monaco, sectionBandDecoIdsRef);
      }, debounceMs);
    };

    applySectionBandDecorations(editor, monaco, sectionBandDecoIdsRef);

    const contentSub = model?.onDidChangeContent(() => {
      scheduleSectionBands();
    });

    editor.onDidDispose(() => {
      contentSub?.dispose();
      if (sectionBandDebounceRef.current) {
        clearTimeout(sectionBandDebounceRef.current);
        sectionBandDebounceRef.current = null;
      }
      sectionBandDecoIdsRef.current = [];
    });
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    applySectionBandDecorations(editor, monaco, sectionBandDecoIdsRef);
  }, [value]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-muted/20 shadow-sm',
        'min-h-[min(70vh,720px)] h-[min(70vh,720px)] w-full',
        className
      )}
    >
      <Editor
        height="100%"
        defaultLanguage="yaml"
        theme={monacoTheme}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={editorOptions}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={
          <div className="flex h-[min(70vh,720px)] min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
            Loading editor…
          </div>
        }
      />
    </div>
  );
}
