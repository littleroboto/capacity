import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type DefinitionInfoProps = {
  term: string;
  definition: string;
  /** Smaller control for dense headers */
  dense?: boolean;
  className?: string;
  iconClassName?: string;
};

export function DefinitionInfo({ term, definition, dense, className, iconClassName }: DefinitionInfoProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, width: 288 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const place = () => {
      const el = triggerRef.current;
      const pop = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const margin = 8;
      const width = Math.min(288, vw - 2 * margin);
      let left = rect.left;
      if (left + width > vw - margin) left = vw - margin - width;
      if (left < margin) left = margin;
      let top = rect.bottom + 6;
      if (pop) {
        const ph = pop.offsetHeight;
        if (top + ph > vh - margin) {
          top = Math.max(margin, rect.top - ph - 6);
        }
      }
      setBox({ top, left, width });
    };

    place();
    const raf = requestAnimationFrame(() => place());
    const pop = popoverRef.current;
    const ro = pop ? new ResizeObserver(() => place()) : null;
    if (pop) ro?.observe(pop);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About: ${term}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          // Superscript-style cue: Lucide has no dedicated glyph; Info reads clearly at small size.
          'inline-flex shrink-0 align-super rounded-sm p-px text-[0.65em] leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          dense ? 'ml-px' : 'ml-0.5',
          className
        )}
      >
        <Info
          className={cn(
            'size-[1em] min-h-[14px] min-w-[14px] touch-manipulation',
            dense && 'min-h-[12px] min-w-[12px]',
            iconClassName
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              data-atc-definition-popover=""
              role="dialog"
              aria-label={term}
              className="fixed z-[360] rounded-lg border border-border bg-card p-3 text-left text-xs leading-relaxed text-card-foreground shadow-lg"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
              <p className="font-semibold text-foreground">{term}</p>
              <p className="mt-2 text-muted-foreground">{definition}</p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** Label text plus trailing info control (keeps phrases readable for screen readers). */
export function TermWithDefinition({
  label,
  definition,
  dense,
}: {
  label: string;
  definition: string;
  dense?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-0">
      <span>{label}</span>
      <DefinitionInfo term={label} definition={definition} dense={dense} />
    </span>
  );
}
