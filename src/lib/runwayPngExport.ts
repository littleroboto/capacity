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
    onclone: (_document, clone) => {
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
