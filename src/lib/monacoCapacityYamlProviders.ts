import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';

const REGISTERED = '__capacityYamlOutlineRegistered';

/**
 * Top-level keys and multi-doc `---` as outline symbols (Quick Outline / Cmd+Shift+O in Monaco).
 * Cheap full-buffer scan — fine for runway-sized YAML.
 */
export function registerCapacityYamlOutline(monaco: Monaco): void {
  const bag = monaco as unknown as Record<string, boolean>;
  if (bag[REGISTERED]) return;
  bag[REGISTERED] = true;

  monaco.languages.registerDocumentSymbolProvider('yaml', {
    provideDocumentSymbols(model: editor.ITextModel): languages.DocumentSymbol[] {
      const text = model.getValue();
      const lines = text.split('\n');
      const { SymbolKind } = monaco.languages;
      const out: languages.DocumentSymbol[] = [];
      let docChunk = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trimEnd();
        const lineNo = i + 1;
        const endCol = line.length + 1;

        if (trimmed === '---') {
          docChunk += 1;
          const name = docChunk === 1 ? 'Runway document 1' : `Runway document ${docChunk}`;
          out.push({
            name,
            detail: 'YAML document separator',
            kind: SymbolKind.Module,
            tags: [],
            range: {
              startLineNumber: lineNo,
              startColumn: 1,
              endLineNumber: lineNo,
              endColumn: endCol,
            },
            selectionRange: {
              startLineNumber: lineNo,
              startColumn: 1,
              endLineNumber: lineNo,
              endColumn: endCol,
            },
            children: [],
          });
          continue;
        }

        if (line.startsWith(' ') || line.startsWith('\t')) continue;
        const m = trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/);
        if (!m) continue;
        const key = m[1]!;
        const rest = m[2]!.replace(/^['"]|['"]$/g, '').trim();
        let name = key;
        if (key === 'market' || key === 'country') {
          name = rest ? `Market ${rest}` : key;
        }
        out.push({
          name,
          detail: key,
          kind: SymbolKind.Field,
          tags: [],
          range: {
            startLineNumber: lineNo,
            startColumn: 1,
            endLineNumber: lineNo,
            endColumn: endCol,
          },
          selectionRange: {
            startLineNumber: lineNo,
            startColumn: 1,
            endLineNumber: lineNo,
            endColumn: endCol,
          },
          children: [],
        });
      }

      return out;
    },
  });
}
