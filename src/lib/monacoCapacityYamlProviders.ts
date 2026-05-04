import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import { suggestCapacityYamlCompletions } from '@/lib/capacityYamlCompletionModel';
import {
  getMultiDocFoldingRanges,
  scanCapacityYamlOutline,
} from '@/lib/monacoCapacityYamlSectionScan';

const REGISTERED = '__capacityYamlOutlineRegistered';
const FOLDING_REGISTERED = '__capacityYamlFoldingRegistered';
const COMPLETION_REGISTERED = '__capacityYamlCompletionRegistered';

/**
 * Top-level keys and multi-doc `---` as outline symbols (Quick Outline / Cmd+Shift+O in Monaco).
 * Separator rows match `MULTI_DOC_SPLIT` (same as folding + section bands).
 */
export function registerCapacityYamlOutline(monaco: Monaco): void {
  const bag = monaco as unknown as Record<string, boolean>;
  if (bag[REGISTERED]) return;
  bag[REGISTERED] = true;

  monaco.languages.registerDocumentSymbolProvider('yaml', {
    provideDocumentSymbols(model: editor.ITextModel): languages.DocumentSymbol[] {
      const text = model.getValue();
      const lines = text.split(/\r\n|\r|\n/);
      const { SymbolKind } = monaco.languages;
      const entries = scanCapacityYamlOutline(text);
      const out: languages.DocumentSymbol[] = [];

      for (const e of entries) {
        const idx = e.line - 1;
        const line = lines[idx] ?? '';
        const endCol = Math.max(1, line.length + 1);

        if (e.kind === 'separator') {
          const name =
            e.docIndex === 1 ? 'Runway document 1' : `Runway document ${e.docIndex}`;
          out.push({
            name,
            detail: 'YAML document separator',
            kind: SymbolKind.Module,
            tags: [],
            range: {
              startLineNumber: e.line,
              startColumn: 1,
              endLineNumber: e.line,
              endColumn: endCol,
            },
            selectionRange: {
              startLineNumber: e.line,
              startColumn: 1,
              endLineNumber: e.line,
              endColumn: endCol,
            },
            children: [],
          });
        } else {
          out.push({
            name: e.name,
            detail: e.detail,
            kind: SymbolKind.Field,
            tags: [],
            range: {
              startLineNumber: e.line,
              startColumn: 1,
              endLineNumber: e.line,
              endColumn: endCol,
            },
            selectionRange: {
              startLineNumber: e.line,
              startColumn: 1,
              endLineNumber: e.line,
              endColumn: endCol,
            },
            children: [],
          });
        }
      }

      return out;
    },
  });
}

/** Fold regions per multi-doc chunk (`---` boundaries aligned with `MULTI_DOC_SPLIT`). */
export function registerCapacityYamlMultiDocFolding(monaco: Monaco): void {
  const bag = monaco as unknown as Record<string, boolean>;
  if (bag[FOLDING_REGISTERED]) return;
  bag[FOLDING_REGISTERED] = true;

  monaco.languages.registerFoldingRangeProvider('yaml', {
    provideFoldingRanges(
      model: editor.ITextModel
    ): languages.ProviderResult<languages.FoldingRange[]> {
      const text = model.getValue();
      const raw = getMultiDocFoldingRanges(text);
      return raw.map((r) => ({
        start: r.start,
        end: r.end,
        kind: monaco.languages.FoldingRangeKind.Region,
      }));
    },
  });
}

/** Context-aware list-item snippets for Capacity runway YAML (holidays `ranges`, campaigns, tech programmes). */
export function registerCapacityYamlCompletion(monaco: Monaco): void {
  const bag = monaco as unknown as Record<string, boolean>;
  if (bag[COMPLETION_REGISTERED]) return;
  bag[COMPLETION_REGISTERED] = true;

  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: [],
    provideCompletionItems(
      model: editor.ITextModel,
      position: { lineNumber: number; column: number }
    ): languages.ProviderResult<languages.CompletionList> {
      const raw = suggestCapacityYamlCompletions({
        text: model.getValue(),
        lineNumber: position.lineNumber,
        column: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      return {
        suggestions: raw.map((it) => ({
          label: it.label,
          kind: CompletionItemKind.Snippet,
          insertText: it.insertText,
          insertTextRules: it.insertAsSnippet
            ? CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          documentation: { value: it.documentation },
          sortText: it.sortText,
          range,
        })),
      };
    },
  });
}
