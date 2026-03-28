import type { Monaco } from '@monaco-editor/react';

/** Custom Monaco themes for YAML DSL — saturated tokens mapped to Monaco’s built-in yaml grammar. */
export const CAPACITY_YAML_THEME_DARK = 'capacity-yaml-dark';
export const CAPACITY_YAML_THEME_LIGHT = 'capacity-yaml-light';

const darkRules = [
  { token: 'comment', foreground: '6b7a99', fontStyle: 'italic' },
  { token: 'white', foreground: '3d4f6f' },
  { token: 'type', foreground: '5ee7ff', fontStyle: 'bold' },
  { token: 'keyword', foreground: 'ff7edb' },
  { token: 'string', foreground: 'b4f396' },
  { token: 'string.escape', foreground: '86efac' },
  { token: 'string.invalid', foreground: 'fb7185' },
  { token: 'string.escape.invalid', foreground: 'f87171' },
  { token: 'number', foreground: 'fcd34d' },
  { token: 'number.float', foreground: 'fde047' },
  { token: 'number.octal', foreground: 'fbbf24' },
  { token: 'number.hex', foreground: 'facc15' },
  { token: 'number.infinity', foreground: 'fdba74' },
  { token: 'number.nan', foreground: 'fb923c' },
  { token: 'number.date', foreground: 'fb923c', fontStyle: 'bold' },
  { token: 'operators', foreground: 'c4b5fd' },
  { token: 'operators.directivesEnd', foreground: 'a78bfa', fontStyle: 'bold' },
  { token: 'operators.documentEnd', foreground: 'a78bfa', fontStyle: 'bold' },
  { token: 'delimiter.comma', foreground: '94a3b8' },
  { token: 'delimiter.bracket', foreground: 'f0abfc' },
  { token: 'delimiter.square', foreground: 'e879f9' },
  { token: 'tag', foreground: 'f472b6' },
  { token: 'namespace', foreground: '22d3ee' },
  { token: 'meta.directive', foreground: '818cf8', fontStyle: 'italic' },
];

const lightRules = [
  { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
  { token: 'white', foreground: 'cbd5e1' },
  { token: 'type', foreground: '0369a1', fontStyle: 'bold' },
  { token: 'keyword', foreground: '0e7490' },
  { token: 'string', foreground: '15803d' },
  { token: 'string.escape', foreground: '166534' },
  { token: 'string.invalid', foreground: 'be123c' },
  { token: 'string.escape.invalid', foreground: 'dc2626' },
  { token: 'number', foreground: 'c2410c' },
  { token: 'number.float', foreground: 'b45309' },
  { token: 'number.octal', foreground: 'a16207' },
  { token: 'number.hex', foreground: 'ca8a04' },
  { token: 'number.infinity', foreground: 'ea580c' },
  { token: 'number.nan', foreground: 'f97316' },
  { token: 'number.date', foreground: 'b45309', fontStyle: 'bold' },
  { token: 'operators', foreground: '475569' },
  { token: 'operators.directivesEnd', foreground: '334155', fontStyle: 'bold' },
  { token: 'operators.documentEnd', foreground: '334155', fontStyle: 'bold' },
  { token: 'delimiter.comma', foreground: '64748b' },
  { token: 'delimiter.bracket', foreground: '475569' },
  { token: 'delimiter.square', foreground: '64748b' },
  { token: 'tag', foreground: '0f172a' },
  { token: 'namespace', foreground: '0e7490' },
  { token: 'meta.directive', foreground: '0369a1', fontStyle: 'italic' },
];

const darkColors: Record<string, string> = {
  'editor.background': '#0f0f14',
  'editor.foreground': '#e8e9f0',
  'editorLineNumber.foreground': '#4a5068',
  'editorLineNumber.activeForeground': '#a5b4fc',
  'editorCursor.foreground': '#f472b6',
  'editor.selectionBackground': '#6366f180',
  'editor.inactiveSelectionBackground': '#6366f140',
  'editor.selectionHighlightBackground': '#8b5cf633',
  'editor.wordHighlightBackground': '#7c3aed22',
  'editor.wordHighlightStrongBackground': '#a855f733',
  'editorBracketMatch.background': '#c084fc22',
  'editorBracketMatch.border': '#c084fc88',
  'editorIndentGuide.background': '#2a2d3a',
  'editorIndentGuide.activeBackground': '#4f46e555',
  'editorWhitespace.foreground': '#2a2d3a',
  'editorLineHighlightBackground': '#1a1c28',
  'scrollbarSlider.background': '#4c1d9533',
  'scrollbarSlider.hoverBackground': '#7c3aed55',
  'scrollbarSlider.activeBackground': '#a855f777',
  'minimap.background': '#0f0f14',
  'minimap.selectionHighlight': '#6366f180',
};

const lightColors: Record<string, string> = {
  'editor.background': '#f8fafc',
  'editor.foreground': '#0f172a',
  'editorLineNumber.foreground': '#94a3b8',
  'editorLineNumber.activeForeground': '#475569',
  'editorCursor.foreground': '#0369a1',
  'editor.selectionBackground': '#bae6fd99',
  'editor.inactiveSelectionBackground': '#bae6fd55',
  'editor.selectionHighlightBackground': '#e0f2fe88',
  'editor.wordHighlightBackground': '#cbd5e166',
  'editor.wordHighlightStrongBackground': '#94a3b855',
  'editorBracketMatch.background': '#e0f2fe',
  'editorBracketMatch.border': '#0369a180',
  'editorIndentGuide.background': '#e2e8f0',
  'editorIndentGuide.activeBackground': '#94a3b888',
  'editorWhitespace.foreground': '#e2e8f0',
  'editorLineHighlightBackground': '#f1f5f9',
  'scrollbarSlider.background': '#cbd5e199',
  'scrollbarSlider.hoverBackground': '#94a3b8bb',
  'scrollbarSlider.activeBackground': '#64748bcc',
  'minimap.background': '#f8fafc',
  'minimap.selectionHighlight': '#bae6fd99',
};

export function registerCapacityYamlThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(CAPACITY_YAML_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: darkRules,
    colors: darkColors,
  });
  monaco.editor.defineTheme(CAPACITY_YAML_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: lightRules,
    colors: lightColors,
  });
}

export function capacityYamlThemeId(isDark: boolean): string {
  return isDark ? CAPACITY_YAML_THEME_DARK : CAPACITY_YAML_THEME_LIGHT;
}
