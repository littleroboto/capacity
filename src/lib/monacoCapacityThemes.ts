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
  { token: 'keyword', foreground: 'a21caf' },
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
  { token: 'number.date', foreground: 'c026d3', fontStyle: 'bold' },
  { token: 'operators', foreground: '6d28d9' },
  { token: 'operators.directivesEnd', foreground: '5b21b6', fontStyle: 'bold' },
  { token: 'operators.documentEnd', foreground: '5b21b6', fontStyle: 'bold' },
  { token: 'delimiter.comma', foreground: '64748b' },
  { token: 'delimiter.bracket', foreground: '9333ea' },
  { token: 'delimiter.square', foreground: '7c3aed' },
  { token: 'tag', foreground: 'db2777' },
  { token: 'namespace', foreground: '0891b2' },
  { token: 'meta.directive', foreground: '4f46e5', fontStyle: 'italic' },
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
  'editor.background': '#faf9fc',
  'editor.foreground': '#1e1b2e',
  'editorLineNumber.foreground': '#a8a3b8',
  'editorLineNumber.activeForeground': '#5b21b6',
  'editorCursor.foreground': '#db2777',
  'editor.selectionBackground': '#c4b5fd99',
  'editor.inactiveSelectionBackground': '#c4b5fd44',
  'editor.selectionHighlightBackground': '#e9d5ff66',
  'editor.wordHighlightBackground': '#ddd6fe55',
  'editor.wordHighlightStrongBackground': '#c4b5fd77',
  'editorBracketMatch.background': '#fae8ff',
  'editorBracketMatch.border': '#c026d388',
  'editorIndentGuide.background': '#e7e5ef',
  'editorIndentGuide.activeBackground': '#c4b5fdaa',
  'editorWhitespace.foreground': '#e2e8f0',
  'editorLineHighlightBackground': '#f1f0f7',
  'scrollbarSlider.background': '#c4b5fd44',
  'scrollbarSlider.hoverBackground': '#a78bfa66',
  'scrollbarSlider.activeBackground': '#8b5cf688',
  'minimap.background': '#faf9fc',
  'minimap.selectionHighlight': '#c4b5fd99',
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
