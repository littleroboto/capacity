import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

function clampInput01(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

export type DecimalClamp = (raw: string) => number | null;

function formatUnitText(n: number, roundUnit: (x: number) => number): string {
  const r = roundUnit(n);
  const s = r.toFixed(3).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

/** Small numeric input for pattern panels; default commit clamp is 0–1 unless `clampDecimal` is set. */
export function PatternUnitField({
  id,
  label,
  value,
  onCommit,
  roundUnit,
  readOnly = false,
  clampDecimal,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (n: number) => void;
  roundUnit: (x: number) => number;
  readOnly?: boolean;
  /** When set, used on blur instead of 0–1 clamp (e.g. capacity shape 0.25–2.5). */
  clampDecimal?: DecimalClamp;
}) {
  const [text, setText] = useState(() => formatUnitText(value, roundUnit));

  useEffect(() => {
    setText(formatUnitText(value, roundUnit));
  }, [value, roundUnit]);

  const commit = () => {
    if (readOnly) return;
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-') {
      setText(formatUnitText(value, roundUnit));
      return;
    }
    const v = (clampDecimal ?? clampInput01)(trimmed);
    if (v == null) {
      setText(formatUnitText(value, roundUnit));
      return;
    }
    const r = roundUnit(v);
    onCommit(r);
    setText(formatUnitText(r, roundUnit));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <label htmlFor={id} className="text-[9px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'h-8 w-full min-w-0 rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[11px] tabular-nums text-foreground shadow-inner dark:bg-muted/55',
          readOnly && 'cursor-default bg-muted/25 text-muted-foreground'
        )}
        value={text}
        onChange={readOnly ? undefined : (e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
