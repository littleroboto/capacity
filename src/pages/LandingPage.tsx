import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Show, SignInButton, UserButton } from '@clerk/react';
import { motion, useReducedMotion } from 'motion/react';
import {
  APP_VERSION,
  GIT_COMMIT_MESSAGE,
  GIT_COMMIT_SHORT,
  LANDING_BOM_AUTH,
  LANDING_BOM_CLIENT,
  LANDING_BOM_FLAGS,
  LANDING_BOM_HOSTING,
} from '@/lib/buildMeta';
import { landingBomSourceHref } from '@/lib/landingBomGithub';
import { isClerkConfigured } from '@/lib/clerkConfig';
import { prefetchWorkbenchApp } from '@/lib/prefetchWorkbench';
import { workbenchEntryHref } from '@/lib/workbenchEntryHref';
import { cn } from '@/lib/utils';
import { LandingIsoBrowserMock } from '@/components/landing/LandingIsoBrowserMock';
import { LandingYamlProjectTwinMock } from '@/components/landing/LandingYamlProjectTwinMock';
import { LandingSingleMarketWorkbenchMock } from '@/components/landing/LandingSingleMarketWorkbenchMock';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { ArrowRight, ChevronDown, ExternalLink } from 'lucide-react';

/** “Same engine as the workbench” iso preview (`LandingIsoBrowserMock`). Re-enable when ready. */
const LANDING_SHOW_ISO_ENGINE_PREVIEW = false;

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
        'bg-zinc-100/90',
        variant === 'ruled' && 'border-t border-dashed border-zinc-200'
      )}
    >
      <th
        scope="colgroup"
        colSpan={2}
        className={cn(
          'px-3 pb-1 pl-5 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500',
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
    <tr className="border-y border-zinc-200 bg-zinc-50/95">
      <th
        scope="colgroup"
        colSpan={2}
        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600"
      >
        {title}
      </th>
    </tr>
  );
}

function LandingBomRowView({ row }: { row: LandingBomEntry }) {
  const href = landingBomSourceHref(row.pkg);
  return (
    <tr className="border-b border-zinc-100 transition-colors last:border-b-0 hover:bg-zinc-50/80">
      <th
        scope="row"
        className="max-w-[min(100%,16rem)] py-2 pl-3 pr-2 align-middle font-normal sm:max-w-none"
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="group inline-flex items-center gap-1.5 text-left text-zinc-600 underline decoration-zinc-300/80 underline-offset-[3px] transition hover:text-zinc-900 hover:decoration-[#FFC72C]/60"
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
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto mt-5 w-full max-w-4xl sm:mx-0">
      <button
        type="button"
        id={`${panelId}-toggle`}
        aria-expanded={open}
        aria-controls={`${panelId}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors',
          'hover:border-zinc-300 hover:bg-zinc-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC72C]/45'
        )}
      >
        <span className="min-w-0 text-pretty text-[11px] leading-snug text-zinc-600">
          <span className="font-medium text-zinc-800">Bill of materials</span>
          <span className="text-zinc-500"> · dependency bundles, semver ranges, upstream links</span>
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
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div
            className="overflow-x-auto overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(113,113,122,0.45)_transparent] [scrollbar-width:thin]"
            style={{ maxHeight: LANDING_BOM_SCROLL_MAX_H }}
          >
            <table className="w-full min-w-[280px] border-collapse text-left text-[11px]">
              <caption className="sr-only">
                Bill of materials: open-source dependencies with declared semver ranges and links to upstream source
                repositories on GitHub or GitLab.
              </caption>
              <thead className="sticky top-0 z-[2] border-b border-zinc-200 bg-zinc-50/98 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 backdrop-blur-sm">
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
              <tbody className="text-zinc-600">
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
        <p className="mt-2 max-w-4xl text-pretty text-[10px] leading-relaxed text-zinc-500 sm:mx-0">
          Ranges are from <code className="rounded bg-zinc-100 px-1 font-mono text-[9px] text-zinc-700">package.json</code> at
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
  const landingSymbolPatternId = useId().replace(/:/g, '');
  const landingNoiseFilterId = useId().replace(/:/g, '');
  const workbenchHref = useMemo(() => workbenchEntryHref(), []);
  useEffect(() => {
    document.title = 'Capacity Workbench · Multi-market capacity on one runway';
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => prefetchWorkbenchApp(), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="landing-root relative min-h-screen overflow-x-visible overflow-y-auto bg-zinc-50 text-zinc-900 antialiased selection:bg-[#FFC72C]/40">
      {/*
        Background stack (light): soft grid + symbol wash + grain + pastel blobs. z-0, pointer-events-none.
      */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: [
              'linear-gradient(to right, rgba(24, 24, 27, 0.06) 1px, transparent 1px)',
              'linear-gradient(to bottom, rgba(24, 24, 27, 0.06) 1px, transparent 1px)',
              'repeating-linear-gradient(45deg, transparent 0, transparent 34px, rgba(24, 24, 27, 0.025) 34px, rgba(24, 24, 27, 0.025) 35px)',
              'repeating-linear-gradient(-45deg, transparent 0, transparent 52px, rgba(24, 24, 27, 0.018) 52px, rgba(24, 24, 27, 0.018) 53px)',
            ].join(', '),
            backgroundSize: '44px 44px, 44px 44px, auto, auto',
          }}
        />
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.14] sm:opacity-[0.16]"
          aria-hidden
        >
          <defs>
            <pattern
              id={landingSymbolPatternId}
              width="88"
              height="88"
              patternUnits="userSpaceOnUse"
            >
              <g
                fill="rgba(24, 24, 27, 0.055)"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '11px',
                  fontWeight: 300,
                }}
              >
                <text x="12" y="20" transform="rotate(-11 12 20)">
                  +
                </text>
                <text x="48" y="26" transform="rotate(8 48 26)" opacity={0.88}>
                  +
                </text>
                <text x="76" y="44" transform="rotate(-6 76 44)" opacity={0.72}>
                  −
                </text>
                <text x="26" y="54" transform="rotate(10 26 54)" opacity={0.78}>
                  ·
                </text>
                <text x="60" y="66" transform="rotate(-9 60 66)" opacity={0.68}>
                  ×
                </text>
                <text x="40" y="82" transform="rotate(5 40 82)" opacity={0.82}>
                  +
                </text>
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${landingSymbolPatternId})`} />
        </svg>
        <svg className="absolute inset-0 h-full w-full opacity-[0.04] mix-blend-multiply" aria-hidden>
          <defs>
            <filter id={landingNoiseFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="4"
                stitchTiles="stitch"
                result="t"
              />
              <feColorMatrix
                in="t"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.35 0"
                result="a"
              />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter={`url(#${landingNoiseFilterId})`} />
        </svg>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_108%,rgba(228,228,231,0.65),transparent_55%)]" />
        <div
          className="landing-nebula-motion absolute -left-[22%] -top-[28%] h-[90vh] w-[min(110vw,900px)] opacity-[0.32] blur-[88px] animate-landing-nebula-drift sm:blur-[104px]"
          style={{
            background:
              'radial-gradient(circle at 38% 42%, rgba(99, 102, 241, 0.14), transparent 56%), radial-gradient(circle at 72% 58%, rgba(139, 92, 246, 0.09), transparent 52%)',
          }}
        />
        <div
          className="landing-nebula-motion absolute -bottom-[24%] -right-[18%] h-[75vh] w-[min(95vw,820px)] opacity-[0.28] blur-[80px] animate-landing-nebula-drift-slow sm:blur-[96px]"
          style={{
            background:
              'radial-gradient(circle at 52% 48%, rgba(14, 165, 233, 0.08), transparent 54%), radial-gradient(circle at 28% 68%, rgba(79, 70, 229, 0.06), transparent 50%)',
          }}
        />
        <div
          className="landing-nebula-motion absolute left-[5%] top-[32%] h-[min(60vh,520px)] w-[min(78vw,640px)] blur-[96px] animate-landing-nebula-breathe sm:blur-[112px]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.06), transparent 62%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,rgba(255,255,255,0.5),transparent_42%)]" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <header className="mb-16 flex flex-wrap items-center justify-between gap-4 sm:mb-20">
          <motion.div
            className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-2.5 font-landing text-balance text-base font-extrabold leading-snug tracking-[-0.02em] text-zinc-800 sm:max-w-none sm:gap-3 sm:text-xl"
            initial={reducedMotion ? false : { opacity: 0, filter: 'blur(10px)', y: 5 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <SegmentWorkbenchMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
            <span>Capacity Workbench</span>
          </motion.div>
          <nav className="flex flex-wrap items-center gap-3">
            {clerkOn ? (
              <>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:text-zinc-900"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
                <Link
                  to="/uk/waitlist"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 transition hover:text-zinc-900"
                >
                  <MarketCircleFlag marketId="UK" size={18} className="ring-zinc-300/80" />
                  UK early access
                </Link>
              </>
            ) : null}
            <Link
              to={workbenchHref}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-md ring-1 ring-zinc-900/10 transition hover:bg-zinc-800"
              onMouseEnter={prefetchWorkbenchApp}
              onFocus={prefetchWorkbenchApp}
            >
              Open workbench
              <ArrowRight className="h-4 w-4 opacity-80" aria-hidden />
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col gap-16 sm:gap-24">
          <section className="grid min-w-0 items-start gap-12 overflow-x-visible lg:grid-cols-[minmax(0,1.05fr)_minmax(32rem,1.45fr)] lg:gap-16">
            <motion.div
              className="min-w-0"
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-landing text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl lg:text-[3.25rem]">
                Stress-test each market. Quantify the ask.
              </h1>
              <p className="mt-5 max-w-3xl text-pretty text-base leading-relaxed text-zinc-700 sm:text-lg lg:max-w-none">
                Declared capacity is a number in a document. Here it becomes a{' '}
                <span className="font-semibold text-zinc-900">runway you can stress</span>—then tweak the inputs
                you actually control (headcount, leave, deploy phases, campaign load) and{' '}
                <span className="font-semibold text-zinc-900">re-quantify the ask in business terms</span>:
                exactly what it takes, where, and by when, to release each pinch.
              </p>
              <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-600 sm:text-base lg:max-w-none">
                Calibrated for{' '}
                <em className="font-semibold not-italic text-zinc-900">this</em> organisation, not generic
                forecasting—trading patterns from{' '}
                <span className="font-medium text-zinc-800">real retail research data</span>, calendars from{' '}
                <span className="font-medium text-zinc-800">actual national holidays</span>, tech load from{' '}
                <span className="font-medium text-zinc-800">real resourcing numbers</span>. Stress-tested
                across:
              </p>
              <dl className="mt-5 max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-600 sm:text-base lg:max-w-none">
                <div className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-1 sm:grid-cols-[8.5rem_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Capacity
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">team &amp; backend ceilings</span>;{' '}
                    <span className="font-medium text-zinc-800">monthly shape</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Calendar
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">holiday pinches</span>;{' '}
                    <span className="font-medium text-zinc-800">pre-holiday taper</span>;{' '}
                    <span className="font-medium text-zinc-800">leave bands</span>;{' '}
                    <span className="font-medium text-zinc-800">operating windows</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Rhythm
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">BAU weekday</span>;{' '}
                    <span className="font-medium text-zinc-800">tech weekly</span>;{' '}
                    <span className="font-medium text-zinc-800">monthly support</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Trading
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">weekly / monthly / seasonal waves</span>;{' '}
                    <span className="font-medium text-zinc-800">payday lift</span>;{' '}
                    <span className="font-medium text-zinc-800">holiday uplift</span>;{' '}
                    <span className="font-medium text-zinc-800">school-holiday stores</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Campaigns
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">prep windows</span>;{' '}
                    <span className="font-medium text-zinc-800">live hypercare</span>;{' '}
                    <span className="font-medium text-zinc-800">flagship vs promo uplift</span>;{' '}
                    <span className="font-medium text-zinc-800">staggered prep</span>;{' '}
                    <span className="font-medium text-zinc-800">replaces BAU</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Releases
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">programmes</span>;{' '}
                    <span className="font-medium text-zinc-800">deploy phases</span>;{' '}
                    <span className="font-medium text-zinc-800">hot-day carry-over</span>;{' '}
                    <span className="font-medium text-zinc-800">freezes &amp; blackouts</span>;{' '}
                    <span className="font-medium text-zinc-800">governance windows</span>
                  </dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Peak
                  </dt>
                  <dd className="text-zinc-700">
                    <span className="font-medium text-zinc-800">Q4 curve</span>;{' '}
                    <span className="font-medium text-zinc-800">12-week ramp</span>;{' '}
                    <span className="font-medium text-zinc-800">deploy fragility</span>;{' '}
                    <span className="font-medium text-zinc-800">campaign × store interactions</span>;{' '}
                    <span className="font-medium text-zinc-800">resourcing → deploy risk</span>
                  </dd>
                </div>
              </dl>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={workbenchHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FFC72C] px-5 py-2.5 text-sm font-semibold text-[#292929] shadow-[0_0_40px_-8px_rgba(255,199,44,0.5)] transition hover:bg-[#E6B028]"
                  onMouseEnter={prefetchWorkbenchApp}
                  onFocus={prefetchWorkbenchApp}
                >
                  Enter the workbench
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </motion.div>
            <LandingSingleMarketWorkbenchMock reducedMotion={!!reducedMotion} />
          </section>

          <section
            className="grid gap-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm sm:grid-cols-2 sm:gap-5 sm:p-6 lg:grid-cols-4"
            aria-labelledby="landing-audience-heading"
          >
            <h2 id="landing-audience-heading" className="sr-only">
              Who the runway is for
            </h2>
            {(
              [
                {
                  title: 'Segment & business leadership',
                  body: 'One runway for back-office capacity and front-line trading—see when marketing, peaks, or holidays already own the attention budget before you commit the next wave.',
                },
                {
                  title: 'Portfolio & programme office',
                  body: 'Make overlap explicit: how programmes and campaigns layer onto the same resources, so sequencing debates start from a shared load picture instead of dueling exports.',
                },
                {
                  title: 'Line managers & delivery leads',
                  body: 'Ground “are we stretched?” in the same calendar the centre uses—specialists, shared services, and change windows visible together.',
                },
                {
                  title: 'Strategy & planning',
                  body: 'Compare markets with the same semantics—where there is slack for a pilot or a bet, and where the model says the system is already tight.',
                },
              ] as const
            ).map(({ title, body }) => (
              <div key={title} className="min-w-0">
                <p className="font-landing text-xs font-semibold uppercase tracking-[0.14em] text-[#b45309]">
                  {title}
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-600">{body}</p>
              </div>
            ))}
          </section>

          {LANDING_SHOW_ISO_ENGINE_PREVIEW ? <LandingIsoBrowserMock /> : null}

          <LandingYamlProjectTwinMock />

        </main>

        <footer className="mt-20 border-t border-zinc-200 pt-8 text-xs text-zinc-500">
          <p className="mx-auto max-w-2xl text-pretty text-center text-[11px] leading-relaxed text-zinc-600 sm:mx-0 sm:text-left">
            A browser-native view of organisational pressure: scenario lives in YAML, the runway stays readable for
            anyone who needs to reason about risk before the plan is cast in stone.
          </p>
          <p
            className="mx-auto mt-3 max-w-4xl text-pretty text-center text-[11px] font-normal leading-relaxed tracking-normal text-zinc-500 sm:mx-0 sm:text-left"
            title={GIT_COMMIT_MESSAGE && GIT_COMMIT_MESSAGE !== '—' ? GIT_COMMIT_MESSAGE : undefined}
          >
            <span className="sr-only">Release — </span>
            v<span className="text-zinc-600">{APP_VERSION}</span>
            <span aria-hidden> · </span>
            <span className="whitespace-nowrap">
              git <span className="font-mono text-zinc-600">{GIT_COMMIT_SHORT}</span>
            </span>
            {GIT_COMMIT_MESSAGE && GIT_COMMIT_MESSAGE !== '—' ? (
              <span className="text-zinc-500">
                {' '}
                — {GIT_COMMIT_MESSAGE.length > 75 ? `${GIT_COMMIT_MESSAGE.slice(0, 75)}…` : GIT_COMMIT_MESSAGE}
              </span>
            ) : null}
          </p>
          <LandingBomTable />
          <p className="mt-8 text-center text-zinc-500">
            Experimental S&amp;P Concept for Global Markets by Doug Booth
          </p>
        </footer>
      </div>
    </div>
  );
}
