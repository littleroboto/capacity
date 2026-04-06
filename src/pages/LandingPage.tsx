import { Fragment, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Show, SignInButton, UserButton } from '@clerk/react';
import { motion, useReducedMotion } from 'motion/react';
import {
  APP_VERSION,
  GIT_COMMIT_SHORT,
  LANDING_BOM_AUTH,
  LANDING_BOM_CLIENT,
  LANDING_BOM_FLAGS,
  LANDING_BOM_HOSTING,
} from '@/lib/buildMeta';
import { landingBomSourceHref } from '@/lib/landingBomGithub';
import { isClerkConfigured } from '@/lib/clerkConfig';
import { prefetchWorkbenchApp } from '@/lib/prefetchWorkbench';
import { cn } from '@/lib/utils';
import { LandingCellDetailCardMock } from '@/components/landing/LandingCellDetailCardMock';
import { LandingIsoBrowserMock } from '@/components/landing/LandingIsoBrowserMock';
import { LandingMonacoYamlMock } from '@/components/landing/LandingMonacoYamlMock';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { heatmapColorDiscrete, heatmapSpectrumLegendGradientCss } from '@/lib/riskHeatmapColors';
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Columns2,
  ExternalLink,
  GitBranch,
  Globe2,
  Layers,
  Radar,
} from 'lucide-react';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Deterministic 0..1 from date (stable heat texture). */
function hash01(y: number, m: number, d: number): number {
  const x = Math.sin(y * 12.9898 + m * 78.233 + d * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Synthetic runway pressure: mirrors “busy Q3”, “quiet early year”, weekend clusters — not real data.
 */
function pressureLevel(year: number, month: number, day: number): number {
  const dt = new Date(year, month - 1, day);
  const dow = dt.getDay();
  const weekend = dow === 0 || dow === 6;
  const quarter = Math.floor((month - 1) / 3) + 1;
  const noise = hash01(year, month, day) * 0.14;

  if (year === 2027 && quarter === 1) {
    return clamp01(0.08 + noise + (weekend ? 0.05 : 0));
  }

  if (year === 2026 && quarter === 3) {
    const thuThroughSun = dow === 4 || dow === 5 || dow === 6 || dow === 0;
    const base = 0.48 + Math.sin(day * 0.35 + month * 1.7) * 0.18;
    const bump = thuThroughSun ? 0.32 : 0.06;
    return clamp01(base + bump + noise);
  }

  if (year === 2026 && quarter === 4) {
    return clamp01(0.32 + noise * 1.2 + (weekend ? 0.14 : 0));
  }

  if (year === 2026) {
    return clamp01(0.22 + noise * 1.4 + (weekend ? 0.12 : 0) + (month === 4 || month === 5 ? 0.08 : 0));
  }

  return clamp01(0.18 + noise);
}

function monthsForQuarter(q: number): number[] {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

const HERO_YEAR_PLAN: { year: number; quarters: readonly number[] }[] = [
  { year: 2026, quarters: [1, 2, 3, 4] },
  { year: 2027, quarters: [1] },
];

type HeroQuarterRow = {
  quarter: number;
  months: { month: number; animIndex: number }[];
};
type HeroYearBlock = { year: number; quarterRows: HeroQuarterRow[] };

function buildHeroBlocks(): HeroYearBlock[] {
  let anim = 0;
  const blocks: HeroYearBlock[] = [];
  for (const { year, quarters } of HERO_YEAR_PLAN) {
    const quarterRows: HeroQuarterRow[] = quarters.map((q) => ({
      quarter: q,
      months: monthsForQuarter(q).map((month) => ({ month, animIndex: anim++ })),
    }));
    blocks.push({ year, quarterRows });
  }
  return blocks;
}

const HERO_BLOCKS = buildHeroBlocks();

/** First real day of Apr 2026 (Wed) — selection dot like the reference. */
const HERO_SELECTED = { year: 2026, month: 4, day: 1 };

function HeatLegend() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 self-stretch pt-6 sm:pt-8">
      <span className="font-landing text-[7px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        High
      </span>
      <div
        className="min-h-[100px] w-2 flex-1 max-h-[200px] rounded-full border border-white/[0.08] shadow-inner shadow-black/40 sm:min-h-[140px]"
        style={{ background: heatmapSpectrumLegendGradientCss() }}
        aria-hidden
      />
      <span className="font-landing text-[7px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Low
      </span>
    </div>
  );
}

type MonthMiniProps = {
  year: number;
  month: number;
  reducedMotion: boolean;
  animIndex: number;
};

function MonthMini({ year, month, reducedMotion, animIndex }: MonthMiniProps) {
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const jsDow = first.getDay();
  const padStart = jsDow === 0 ? 6 : jsDow - 1;

  const cells: ({ t: number; day: number } | null)[] = [];
  for (let i = 0; i < padStart; i += 1) cells.push(null);
  for (let d = 1; d <= lastDate; d += 1) {
    cells.push({ day: d, t: pressureLevel(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reducedMotion ? 0 : animIndex * 0.022,
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="min-w-0 w-full rounded-lg border border-white/[0.06] bg-[#0a0a0c]/90 p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] sm:p-1.5"
    >
      <div className="mb-0.5 text-center font-landing text-[8px] font-semibold tracking-wide text-zinc-400 sm:mb-1 sm:text-[9px]">
        {MONTH_SHORT[month - 1]}
      </div>
      <div className="mx-auto mb-0.5 grid w-max max-w-full grid-cols-[repeat(7,max-content)] gap-[2px] sm:mb-1">
        {DOW.map((d) => (
          <div
            key={d}
            className="text-center font-landing text-[5px] font-medium uppercase tracking-tight text-zinc-600 sm:text-[6px]"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="mx-auto grid w-max max-w-full grid-cols-[repeat(7,max-content)] gap-[2px]">
        {cells.map((c, i) => {
          if (!c) {
            return (
              <div
                key={`e-${i}`}
                className="size-[9px] shrink-0 rounded-[2px] bg-[#2a2a2e] ring-1 ring-black/25 sm:size-[10px] sm:rounded-[3px]"
                aria-hidden
              />
            );
          }
          const fill = heatmapColorDiscrete(c.t);
          const sel =
            HERO_SELECTED.year === year && HERO_SELECTED.month === month && HERO_SELECTED.day === c.day;
          return (
            <div
              key={`d-${c.day}`}
              className="relative size-[9px] shrink-0 rounded-[2px] ring-1 ring-black/20 sm:size-[10px] sm:rounded-[3px]"
              style={{ backgroundColor: fill }}
            >
              {sel ? (
                <span
                  className="absolute left-1/2 top-1/2 block size-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.95)] sm:size-[3px]"
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function HeroBrowserHeatmap({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[min(100%,920px)]"
      initial={reducedMotion ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="landing-nebula-motion pointer-events-none absolute -inset-3 rounded-[1.35rem] blur-2xl sm:-inset-5 sm:rounded-[1.5rem] sm:blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse 72% 58% at 45% 18%, rgba(34, 211, 238, 0.22), transparent 58%), radial-gradient(ellipse 55% 48% at 88% 72%, rgba(244, 63, 94, 0.16), transparent 52%), radial-gradient(ellipse 48% 42% at 12% 65%, rgba(129, 140, 248, 0.2), transparent 50%)',
        }}
        aria-hidden
      />
      <div
        className="landing-nebula-motion pointer-events-none absolute -inset-5 animate-landing-hero-halo-pulse rounded-[1.5rem] blur-[44px] sm:-inset-8 sm:rounded-[1.65rem] sm:blur-[56px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 62% at 50% 42%, rgba(99, 102, 241, 0.35), transparent 62%), radial-gradient(ellipse 50% 40% at 75% 88%, rgba(6, 182, 212, 0.18), transparent 55%)',
        }}
        aria-hidden
      />
      <div
        className="landing-nebula-motion pointer-events-none absolute -inset-6 animate-landing-hero-halo-pulse-alt rounded-[1.6rem] blur-[52px] sm:-inset-10 sm:blur-[64px]"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 30% 85%, rgba(248, 113, 113, 0.2), transparent 58%), radial-gradient(ellipse 45% 38% at 92% 22%, rgba(167, 139, 250, 0.22), transparent 52%)',
        }}
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#111114] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-400">capacity</span>
            <span className="text-zinc-600">.app</span>
            <span className="text-cyan-500/80"> / runway</span>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex gap-2 rounded-xl border border-white/[0.06] bg-[#070708] p-2 sm:gap-3 sm:p-3">
            <HeatLegend />
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="mb-2 flex min-w-[min(100%,280px)] flex-wrap items-center gap-2 sm:min-w-0 sm:mb-3">
                <h3 className="font-landing text-[11px] font-semibold tracking-tight text-zinc-200 sm:text-xs">
                  Programme pressure
                </h3>
                <span className="text-zinc-600" aria-hidden>
                  ·
                </span>
                <span className="flex items-center gap-1.5">
                  <MarketCircleFlag marketId="AT" size={16} className="ring-white/15" />
                  <span className="font-landing text-[11px] font-semibold text-zinc-400 sm:text-xs">AT</span>
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:gap-4">
                {HERO_BLOCKS.map(({ year, quarterRows }) => (
                  <div key={year}>
                    <div className="mb-1.5 font-landing text-[10px] font-bold tabular-nums text-zinc-300 sm:text-[11px]">
                      {year}
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {quarterRows.map(({ quarter, months }) => (
                        <div key={`${year}-q${quarter}`} className="flex gap-1.5 sm:gap-2">
                          <div className="w-5 shrink-0 pt-6 font-landing text-[8px] font-semibold uppercase tracking-wide text-zinc-600 sm:w-6 sm:pt-7 sm:text-[9px]">
                            Q{quarter}
                          </div>
                          <div className="grid min-w-0 flex-1 grid-cols-3 gap-[2px]">
                            {months.map(({ month, animIndex }) => (
                              <MonthMini
                                key={`${year}-${month}`}
                                year={year}
                                month={month}
                                reducedMotion={reducedMotion}
                                animIndex={animIndex}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.05] pt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:mt-4 sm:pt-4 sm:text-[11px]">
            <span className="flex items-center gap-2 text-cyan-400/85">
              <span className="h-2 w-2 rounded-sm bg-cyan-400/90 shadow-[0_0_10px_rgba(34,211,238,0.35)]" />
              BAU technology
            </span>
            <span className="flex items-center gap-2 text-rose-400/85">
              <span className="h-2 w-2 rounded-sm bg-rose-500/85 shadow-[0_0_10px_rgba(244,63,94,0.35)]" />
              Project load
            </span>
            <span className="text-zinc-600 normal-case tracking-normal">Separate lenses, one timeline</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Data-driven runway',
    body: 'Capacity as a picture everyone can read — pressure, mix, and time in one surface.',
  },
  {
    icon: GitBranch,
    title: 'YAML programmes & resourcing',
    body: 'Programme and resourcing truth stays in structured YAML — the UI is the shared view.',
  },
  {
    icon: Globe2,
    title: 'Markets & segments',
    body: 'Zoom from the whole portfolio into individual markets and segments without losing context.',
  },
  {
    icon: Layers,
    title: 'Tech resourcing',
    body: 'See how technology capacity is allocated across streams, roles, and the calendar.',
  },
  {
    icon: Columns2,
    title: 'BAU vs projects',
    body: 'Distinct visualisations for BAU technology workstream load and project load side by side.',
  },
  {
    icon: Radar,
    title: 'Air traffic control',
    body: 'A control tower for technology programmes — what is landing when, and what conflicts.',
  },
] as const;

type LandingBomEntry = {
  readonly label: string;
  readonly range: string;
  readonly pkg: string;
  /** Logical sub-bundle; repeated on consecutive rows — table shows one sub-heading per change. */
  readonly bundle?: string;
};

function LandingBomBundleHeader({ title, variant }: { title: string; variant: 'flush' | 'ruled' }) {
  return (
    <tr
      className={cn(
        'bg-black/[0.18]',
        variant === 'ruled' && 'border-t border-dashed border-white/[0.06]'
      )}
    >
      <th
        scope="colgroup"
        colSpan={2}
        className={cn(
          'px-3 pb-1 pl-5 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600',
          variant === 'flush' ? 'pt-2' : 'pt-1.5'
        )}
      >
        {title}
      </th>
    </tr>
  );
}

function LandingBomSectionHeader({ title }: { title: string }) {
  return (
    <tr className="border-y border-white/[0.06] bg-white/[0.03]">
      <th
        scope="colgroup"
        colSpan={2}
        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500"
      >
        {title}
      </th>
    </tr>
  );
}

function LandingBomRowView({ row }: { row: LandingBomEntry }) {
  const href = landingBomSourceHref(row.pkg);
  return (
    <tr className="border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <th
        scope="row"
        className="max-w-[min(100%,16rem)] py-2 pl-3 pr-2 align-middle font-normal sm:max-w-none"
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="group inline-flex items-center gap-1.5 text-left text-zinc-400 underline decoration-white/[0.08] underline-offset-[3px] transition hover:text-zinc-100 hover:decoration-[#FFC72C]/50"
        >
          <span className="text-pretty">{row.label}</span>
          <ExternalLink
            className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-80"
            aria-hidden
          />
        </a>
      </th>
      <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right align-middle font-mono text-[10px] leading-none text-zinc-500 tabular-nums sm:w-[6.5rem] sm:min-w-[6.5rem] sm:text-left">
        {row.range}
      </td>
    </tr>
  );
}

function LandingBomRows({ rows }: { rows: readonly LandingBomEntry[] }) {
  let bundleHeadersInSection = 0;
  return (
    <>
      {rows.map((row, i) => {
        const prev = i > 0 ? rows[i - 1] : undefined;
        const bundle = row.bundle?.trim();
        const showBundle = Boolean(bundle && (!prev || prev.bundle?.trim() !== bundle));
        if (showBundle && bundle) bundleHeadersInSection += 1;
        return (
          <Fragment key={row.pkg}>
            {showBundle && bundle ? (
              <LandingBomBundleHeader
                title={bundle}
                variant={bundleHeadersInSection === 1 ? 'flush' : 'ruled'}
              />
            ) : null}
            <LandingBomRowView row={row} />
          </Fragment>
        );
      })}
    </>
  );
}

/** ~5–6 table body lines visible; thead sticks while scrolling. */
const LANDING_BOM_SCROLL_MAX_H = 'min(13.5rem,42vh)';

function LandingBomTable() {
  const panelId = useId();
  const [open, setOpen] = useState(true);

  return (
    <div className="mx-auto mt-5 w-full max-w-4xl sm:mx-0">
      <button
        type="button"
        id={`${panelId}-toggle`}
        aria-expanded={open}
        aria-controls={`${panelId}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors',
          'hover:border-white/[0.1] hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC72C]/35'
        )}
      >
        <span className="min-w-0 text-pretty text-[11px] leading-snug text-zinc-500">
          <span className="font-medium text-zinc-400">Bill of materials</span>
          <span className="text-zinc-600"> · dependency bundles, semver ranges, upstream links</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200', open && '-rotate-180')}
          aria-hidden
        />
      </button>

      <div
        id={`${panelId}-panel`}
        role="region"
        aria-labelledby={`${panelId}-toggle`}
        hidden={!open}
      >
        <div className="mt-2 overflow-hidden rounded-lg border border-white/[0.07] bg-[#050608]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm">
          <div
            className="overflow-x-auto overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(63,63,70,0.55)_transparent] [scrollbar-width:thin]"
            style={{ maxHeight: LANDING_BOM_SCROLL_MAX_H }}
          >
            <table className="w-full min-w-[280px] border-collapse text-left text-[11px]">
              <caption className="sr-only">
                Bill of materials: open-source dependencies with declared semver ranges and links to upstream source
                repositories on GitHub or GitLab.
              </caption>
              <thead className="sticky top-0 z-[2] border-b border-white/[0.08] bg-[#06080a]/95 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 backdrop-blur-sm">
                <tr>
                  <th scope="col" className="py-2.5 pl-3 pr-2 font-medium">
                    Module
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 pl-2 pr-3 text-right font-medium sm:w-[6.5rem] sm:min-w-[6.5rem] sm:text-left"
                  >
                    Range
                  </th>
                </tr>
              </thead>
              <tbody className="text-zinc-500">
                <LandingBomSectionHeader title="Client bundle" />
                <LandingBomRows rows={LANDING_BOM_CLIENT} />
                <LandingBomSectionHeader title="Hosting & sync" />
                <LandingBomRows rows={LANDING_BOM_HOSTING} />
                <LandingBomSectionHeader title="Auth (optional)" />
                <LandingBomRows rows={LANDING_BOM_AUTH} />
                <LandingBomSectionHeader title="Market chrome" />
                <LandingBomRows rows={LANDING_BOM_FLAGS} />
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 max-w-4xl text-pretty text-[10px] leading-relaxed text-zinc-600 sm:mx-0">
          Ranges are from <code className="rounded bg-white/[0.04] px-1 font-mono text-[9px]">package.json</code> at
          build. Links open the upstream source repo on GitHub (or GitLab / npm when that is canonical). Deployed on
          Vercel; no Next.js — Vite SPA only.
        </p>
      </div>
    </div>
  );
}

export function LandingPage() {
  const reducedMotion = useReducedMotion();
  const clerkOn = isClerkConfigured();

  useEffect(() => {
    document.title = 'Segment Capacity Workbench · Air traffic control for technology programmes';
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => prefetchWorkbenchApp(), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="landing-root relative min-h-screen bg-[#040506] text-zinc-100 antialiased selection:bg-[#FFC72C]/35">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_65%_at_50%_115%,rgba(15,23,42,0.9),transparent_58%)]" />
        <div
          className="landing-nebula-motion absolute -left-[22%] -top-[28%] h-[90vh] w-[min(110vw,900px)] opacity-[0.42] blur-[88px] animate-landing-nebula-drift sm:blur-[104px]"
          style={{
            background:
              'radial-gradient(circle at 38% 42%, rgba(99, 102, 241, 0.2), transparent 56%), radial-gradient(circle at 72% 58%, rgba(139, 92, 246, 0.12), transparent 52%)',
          }}
        />
        <div
          className="landing-nebula-motion absolute -bottom-[24%] -right-[18%] h-[75vh] w-[min(95vw,820px)] opacity-[0.38] blur-[80px] animate-landing-nebula-drift-slow sm:blur-[96px]"
          style={{
            background:
              'radial-gradient(circle at 52% 48%, rgba(14, 165, 233, 0.1), transparent 54%), radial-gradient(circle at 28% 68%, rgba(79, 70, 229, 0.09), transparent 50%)',
          }}
        />
        <div
          className="landing-nebula-motion absolute left-[5%] top-[32%] h-[min(60vh,520px)] w-[min(78vw,640px)] blur-[96px] animate-landing-nebula-breathe sm:blur-[112px]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.08), transparent 62%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_50%_at_50%_-5%,transparent_20%,rgba(0,0,0,0.5)_100%)]" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <header className="mb-16 flex flex-wrap items-center justify-between gap-4 sm:mb-20">
          <motion.div
            className="min-w-0 max-w-[min(100%,18rem)] font-landing text-balance text-base font-extrabold leading-snug tracking-[-0.02em] text-zinc-50 sm:max-w-none sm:text-xl"
            initial={reducedMotion ? false : { opacity: 0, filter: 'blur(10px)', y: 5 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            Segment Capacity Workbench
          </motion.div>
          <nav className="flex flex-wrap items-center gap-3">
            {clerkOn ? (
              <>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-white"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </>
            ) : null}
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.09] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/[0.12] transition hover:bg-white/[0.14]"
              onMouseEnter={prefetchWorkbenchApp}
              onFocus={prefetchWorkbenchApp}
            >
              Open workbench
              <ArrowRight className="h-4 w-4 opacity-80" aria-hidden />
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col gap-16 sm:gap-24">
          <section className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-landing text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
                Air traffic control for technology programmes
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
                A shared picture of how capacity is consumed — BAU technology streams, project load, markets, and
                segments — so teams steer before things stack up.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FFC72C] px-5 py-2.5 text-sm font-semibold text-[#292929] shadow-[0_0_40px_-8px_rgba(255,199,44,0.5)] transition hover:bg-[#E6B028]"
                  onMouseEnter={prefetchWorkbenchApp}
                  onFocus={prefetchWorkbenchApp}
                >
                  Enter the workbench
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </motion.div>
            <HeroBrowserHeatmap reducedMotion={!!reducedMotion} />
          </section>

          <section aria-labelledby="features-heading">
            <motion.div
              className="mb-10 max-w-2xl"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45 }}
            >
              <h2 id="features-heading" className="font-landing text-2xl font-semibold text-white">
                What you get
              </h2>
              <p className="mt-2 text-zinc-400">
                Built for leaders and delivery teams who need one honest view of the runway.
              </p>
            </motion.div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <motion.li
                  key={title}
                  initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.4, delay: reducedMotion ? 0 : i * 0.05 }}
                  className={cn(
                    'rounded-xl border border-white/[0.06] bg-white/[0.02] p-5',
                    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                  )}
                >
                  <Icon className="mb-3 h-5 w-5 text-[#FFC72C]" strokeWidth={1.75} aria-hidden />
                  <h3 className="font-landing text-sm font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">{body}</p>
                </motion.li>
              ))}
            </ul>
          </section>

          <LandingIsoBrowserMock />

          <LandingCellDetailCardMock />

          <LandingMonacoYamlMock />

          <section
            aria-labelledby="model-heading"
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-10 sm:px-10"
          >
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
            >
              <h2 id="model-heading" className="font-landing text-xl font-semibold text-white">
                Real-world rhythm, in the model
              </h2>
              <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
                We do not drown you in formulas. What matters is that the picture reflects how work
                actually lands: <strong className="font-medium text-zinc-300">holiday windows</strong>{' '}
                and <strong className="font-medium text-zinc-300">resourcing</strong> interact;
                typical <strong className="font-medium text-zinc-300">week, month, and year</strong>{' '}
                patterns carry through; <strong className="font-medium text-zinc-300">campaign weightings</strong>{' '}
                shape demand; and{' '}
                <strong className="font-medium text-zinc-300">support load for large campaigns</strong>{' '}
                is part of the same calculation — so the heat you see matches the operating reality.
              </p>
            </motion.div>
          </section>
        </main>

        <footer className="mt-20 border-t border-white/[0.06] pt-8 text-center text-xs text-zinc-600 sm:text-left">
          <p className="text-zinc-500">Designed &amp; Engineered by Doug Booth, Segment Architecture</p>
          <p className="mx-auto mt-3 max-w-4xl text-pretty text-[11px] font-normal leading-relaxed tracking-normal text-zinc-600 sm:mx-0">
            <span className="sr-only">Release — </span>
            v<span className="text-zinc-500">{APP_VERSION}</span>
            <span aria-hidden> · </span>
            <span className="whitespace-nowrap">
              git <span className="font-mono text-zinc-500">{GIT_COMMIT_SHORT}</span>
            </span>
            <span className="text-zinc-600"> — BOM semver ranges frozen at build from package.json.</span>
          </p>
          <LandingBomTable />
        </footer>
      </div>
    </div>
  );
}
