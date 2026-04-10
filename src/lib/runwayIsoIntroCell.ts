import { contribPanelFill } from '@/components/RunwayIsoHeatCell';
import { heatmapAppearanceAtTransformedT, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';

/** Matches landing hero empty cells — iso towers start here before colour walks the spectrum. */
export const ISO_RUNWAY_INTRO_NEUTRAL = '#2a2a2e';

/**
 * Share of the global 0→1 grow timeline used to stagger cell starts (0 = all together, ~0.5 = strong wave).
 * Last cell still finishes when `globalGrow` hits 1.
 */
export const ISO_RUNWAY_INTRO_WAVE_SPAN = 0.52;

/**
 * Per-cell progress from the shared {@link useIsoRunwayGrowFactor} value.
 *
 * `stagger01` should be in [0, 1] — iso views assign this from **painter order** (depth-sorted cells:
 * lower = drawn first / “front” of the stack).
 */
export function isoRunwayIntroCellProgress(
  globalGrow: number,
  stagger01: number,
  waveSpan: number = ISO_RUNWAY_INTRO_WAVE_SPAN
): number {
  const w = Math.min(0.94, Math.max(0, waveSpan));
  const denom = 1 - w;
  if (denom <= 1e-6) return globalGrow;
  return Math.min(1, Math.max(0, (globalGrow - stagger01 * w) / denom));
}

function parseToRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    color.replace(/\s/g, '')
  );
  if (m) {
    return {
      r: +m[1]!,
      g: +m[2]!,
      b: +m[3]!,
      a: m[4] !== undefined ? +m[4]! : 1,
    };
  }
  return null;
}

function lerpNeutralToColor(neutral: string, target: string, p: number): string {
  const n = parseToRgba(neutral);
  const t = parseToRgba(target);
  if (!n || !t) return target;
  const u = Math.min(1, Math.max(0, p));
  const r = Math.round(n.r + (t.r - n.r) * u);
  const g = Math.round(n.g + (t.g - n.g) * u);
  const b = Math.round(n.b + (t.b - n.b) * u);
  const a = n.a + (t.a - n.a) * u;
  if (a < 0.999) return `rgba(${r},${g},${b},${a})`;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export type IsoRunwayIntroColourStyle = 'spectrum' | 'solid';

/**
 * Grey → spectrum walk → final: blends neutral toward the colour at `tFinal * introP`, weighted by `introP`,
 * then applies {@link contribPanelFill} like normal runway cells.
 *
 * **`solid`** — grey → `finalFill` only (e.g. project-work dimmed cells use pad fill while metric ≠ 0).
 */
export function isoRunwayIntroContribPanels(opts: {
  heatmapOpts: HeatmapColorOpts | undefined;
  finalFill: string;
  tFinal: number;
  introP: number;
  introStyle?: IsoRunwayIntroColourStyle;
}): { topC: string; leftC: string; rightC: string } {
  const { heatmapOpts, finalFill, tFinal, introP, introStyle = 'spectrum' } = opts;
  if (introP >= 0.998) {
    return {
      topC: contribPanelFill(finalFill, 'top'),
      leftC: contribPanelFill(finalFill, 'left'),
      rightC: contribPanelFill(finalFill, 'right'),
    };
  }
  const blended =
    introStyle === 'solid'
      ? lerpNeutralToColor(ISO_RUNWAY_INTRO_NEUTRAL, finalFill, introP)
      : lerpNeutralToColor(
          ISO_RUNWAY_INTRO_NEUTRAL,
          heatmapAppearanceAtTransformedT(heatmapOpts, Math.min(1, Math.max(0, tFinal * introP))),
          introP
        );
  return {
    topC: contribPanelFill(blended, 'top'),
    leftC: contribPanelFill(blended, 'left'),
    rightC: contribPanelFill(blended, 'right'),
  };
}
