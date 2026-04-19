import type { Options } from 'html2canvas';

/** Snapshot-friendly: stop CSS animations / motion blur filters on the cloned tree. */
function stripAnimationsInClone(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    el.style.animation = 'none';
    el.style.transition = 'none';
    const cs = window.getComputedStyle(el);
    if (cs.filter && cs.filter !== 'none') {
      el.style.filter = 'none';
    }
  }
}

/** Extra space between weekday labels and first cell row — html2canvas clone only (font metrics differ from screen). */
const RUNWAY_PNG_EXPORT_DAY_GRID_TOP_PX = 6;

/**
 * html2canvas often under-measures tight flex + `leading-none` text, so weekday labels
 * can sit on top of the first heatmap row. Nudge only in the off-DOM clone.
 */
function fixRunwayTextCellOverlapInClone(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-runway-weeks-grid]')) {
    const cur = parseFloat(el.style.marginTop) || 0;
    el.style.marginTop = `${cur + RUNWAY_PNG_EXPORT_DAY_GRID_TOP_PX}px`;
  }
}

/** Live DOM: stamp before `html2canvas` so the cloned tree copies sizes (iframe clone metrics can be wrong). */
export function stampRunwayScrollportsForPngExport(
  candidates: readonly (HTMLElement | null | undefined)[]
): HTMLElement[] {
  const stamped: HTMLElement[] = [];
  for (const el of candidates) {
    if (!el) continue;
    const sw = el.scrollWidth;
    const sh = el.scrollHeight;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (sw <= cw + 1 && sh <= ch + 1) continue;
    el.dataset.runwayPngExpandW = String(Math.ceil(sw));
    el.dataset.runwayPngExpandH = String(Math.ceil(sh));
    stamped.push(el);
  }
  return stamped;
}

export function clearRunwayPngScrollportStamps(stamped: readonly HTMLElement[]): void {
  for (const el of stamped) {
    delete el.dataset.runwayPngExpandW;
    delete el.dataset.runwayPngExpandH;
  }
}

const OVERFLOW_SCROLL_LIKE = new Set(['auto', 'scroll', 'overlay']);

/**
 * Walk from `start` toward `document.body` and collect elements whose overflow creates a scrollport
 * with content larger than the client box. Needed so {@link stampRunwayScrollportsForPngExport} can
 * expand workbench / page scroll regions — not only inner runway scrollports.
 */
export function collectOverflowScrollAncestors(start: HTMLElement, maxHops = 48): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p: HTMLElement | null = start.parentElement;
  let hops = 0;
  while (p && hops < maxHops) {
    hops++;
    if (p === document.body || p === document.documentElement) break;
    const cs = window.getComputedStyle(p);
    const scrollY = OVERFLOW_SCROLL_LIKE.has(cs.overflowY);
    const scrollX = OVERFLOW_SCROLL_LIKE.has(cs.overflowX);
    if (scrollY || scrollX) {
      const sw = p.scrollWidth;
      const sh = p.scrollHeight;
      const cw = p.clientWidth;
      const ch = p.clientHeight;
      if (sw > cw + 1 || sh > ch + 1) {
        out.push(p);
      }
    }
    p = p.parentElement;
  }
  return out;
}

function applyStampedScrollportSizesInClone(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-runway-png-expand-w], [data-runway-png-expand-h]')) {
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('overflow-x', 'visible', 'important');
    el.style.setProperty('overflow-y', 'visible', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('max-width', 'none', 'important');
    const w = el.dataset.runwayPngExpandW;
    const h = el.dataset.runwayPngExpandH;
    if (w) {
      const n = parseInt(w, 10);
      if (n > 0) {
        el.style.setProperty('width', `${n}px`, 'important');
        el.style.setProperty('min-width', `${n}px`, 'important');
        el.style.setProperty('flex', 'none', 'important');
      }
    }
    if (h) {
      const n = parseInt(h, 10);
      if (n > 0) {
        el.style.setProperty('height', `${n}px`, 'important');
        el.style.setProperty('min-height', `${n}px`, 'important');
        el.style.setProperty('flex', 'none', 'important');
      }
    }
  }
}

/**
 * html2canvas renders overflow:auto/scroll regions as their on-screen viewport only.
 * Walk deepest-first and expand any node whose content extends past its client box so the PNG includes the full grid.
 */
function expandScrollportsForFullCaptureInClone(root: HTMLElement): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const el = nodes[i]!;
    const sh = el.scrollHeight;
    const sw = el.scrollWidth;
    const ch = el.clientHeight;
    const cw = el.clientWidth;
    const expandW = sw > cw + 1 || (cw === 0 && sw > 2);
    const expandH = sh > ch + 1 || (ch === 0 && sh > 2);
    if (!expandW && !expandH) continue;

    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('overflow-x', 'visible', 'important');
    el.style.setProperty('overflow-y', 'visible', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('max-width', 'none', 'important');

    if (expandW) {
      const w = Math.ceil(sw);
      el.style.setProperty('width', `${w}px`, 'important');
      el.style.setProperty('min-width', `${w}px`, 'important');
      el.style.setProperty('flex', 'none', 'important');
    }
    if (expandH) {
      const h = Math.ceil(sh);
      el.style.setProperty('height', `${h}px`, 'important');
      el.style.setProperty('min-height', `${h}px`, 'important');
      el.style.setProperty('flex', 'none', 'important');
    }
  }
}

export type RunwayPngExportOptions = {
  filename: string;
  /** Device-pixel ratio clamp; default 2 for sharp PNGs. */
  scale?: number;
};

/**
 * Rasterise a DOM subtree to a PNG with a transparent canvas background (cell fills still opaque).
 */
export async function downloadRunwayHeatmapPng(
  element: HTMLElement,
  options: RunwayPngExportOptions
): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const scale = Math.min(3, Math.max(1, options.scale ?? (window.devicePixelRatio >= 2 ? 2 : 2)));

  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale,
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    onclone: (_document, clone) => {
      applyStampedScrollportSizesInClone(clone);
      expandScrollportsForFullCaptureInClone(clone);
      stripAnimationsInClone(clone);
      fixRunwayTextCellOverlapInClone(clone);
    },
  } satisfies Partial<Options>);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = options.filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
