import type { ReactNode } from 'react';
import { TermWithDefinition } from '@/components/DefinitionInfo';
import type { RunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';
import {
  glossaryFillScore,
  glossaryFillScorePopover,
  glossaryPlanningBlend,
  glossaryPlanningBlendPopover,
  glossaryTileVsBandCollapse,
} from '@/lib/runwayDayDetailsGlossary';
import { cn } from '@/lib/utils';

export type DayDetailsPresentation = 'popover' | 'markdown';

function parseRgbHex6(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgbaCss(css: string): [number, number, number, number] | null {
  const m =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(css.trim()) ??
    /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(css.trim());
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] != null ? Math.min(1, Math.max(0, Number(m[4]))) : 1;
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return [r, g, b, a];
}

function relativeLuminanceFromSrgb(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Readable text on arbitrary heatmap cell fills (relative luminance; blends rgba on white). */
function foregroundOnHeatmapFill(cssColor: string): string {
  const rgba = parseRgbaCss(cssColor);
  if (rgba) {
    const [r, g, b, a] = rgba;
    const br = Math.round(r * a + 255 * (1 - a));
    const bg = Math.round(g * a + 255 * (1 - a));
    const bb = Math.round(b * a + 255 * (1 - a));
    const L = relativeLuminanceFromSrgb(br, bg, bb);
    return L > 0.52 ? 'rgb(15 23 42)' : 'rgb(255 252 250)';
  }
  const rgb = parseRgbHex6(cssColor);
  if (!rgb) return 'rgb(15 23 42)';
  const L = relativeLuminanceFromSrgb(rgb[0], rgb[1], rgb[2]);
  return L > 0.52 ? 'rgb(15 23 42)' : 'rgb(255 252 250)';
}

function clampList<T>(items: T[], max: number): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: items, more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}

/** Side-panel markdown: show full programme/campaign names without the popover’s short list cap. */
const LENS_PRIMARY_LIST_MAX = 50;

function SectionTitle({
  children,
  className,
  presentation,
}: {
  children: ReactNode;
  className?: string;
  presentation: DayDetailsPresentation;
}) {
  return (
    <h4
      className={cn(
        presentation === 'markdown'
          ? 'mb-2 mt-6 text-sm font-semibold tracking-tight text-foreground first:mt-0'
          : 'mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        className
      )}
    >
      {children}
    </h4>
  );
}

function BulletList({
  items,
  presentation,
}: {
  items: string[];
  presentation: DayDetailsPresentation;
}) {
  if (!items.length) return null;
  if (presentation === 'markdown') {
    return (
      <ul className="my-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-foreground marker:text-muted-foreground">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5 text-xs leading-snug text-foreground">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function contributorShortLabel(label: string): string {
  return label
    .replace(/\s*\(this heatmap\)\s*/i, '')
    .replace(/\s*\(heatmap\)\s*/i, '')
    .replace(/\s*\(live campaigns[^)]*\)\s*/i, '')
    .trim();
}

function ContributorsBlock({
  p,
  presentation,
  embedded = false,
}: {
  p: RunwayTooltipPayload;
  presentation: DayDetailsPresentation;
  /** When nested (e.g. inside `<details>`), drop extra top margin. */
  embedded?: boolean;
}) {
  const terms = [...p.riskTerms].sort((a, b) => b.contribution - a.contribution);
  const blendSum = terms.reduce((acc, t) => acc + t.contribution, 0);
  const denom = blendSum > 1e-9 ? blendSum : 1;
  const techLens = p.viewMode === 'combined';
  const headroomPct =
    techLens && terms[0] ? Math.min(100, Math.round(Math.max(0, terms[0].factor) * 100)) : null;

  const wrap = (inner: ReactNode) =>
    presentation === 'markdown' ? (
      <div className="mt-6 border-l-2 border-primary/35 bg-muted/20 py-3 pl-4 pr-2 dark:border-primary/25 dark:bg-muted/10">
        {inner}
      </div>
    ) : (
      <div
        className={cn(
          'rounded-lg border border-border bg-muted/25 px-3 py-3',
          embedded ? 'mt-0' : 'mt-4'
        )}
      >
        {inner}
      </div>
    );

  const title =
    presentation === 'markdown' ? (
      <h3 className="text-sm font-semibold text-foreground">How the score is built</h3>
    ) : (
      <SectionTitle presentation={presentation} className="mt-0 text-foreground">
        How the score is built
      </SectionTitle>
    );

  return wrap(
    <>
      {title}

      {techLens ? (
        <>
          <p
            className={cn(
              'font-semibold leading-relaxed text-foreground',
              presentation === 'markdown' ? 'mt-3 text-[15px]' : 'mt-2 text-xs'
            )}
          >
            {p.techExplanation}
          </p>
          {headroomPct != null ? (
            <p
              className={cn(
                'tabular-nums text-muted-foreground',
                presentation === 'markdown' ? 'mt-2 text-sm' : 'mt-1.5 text-[11px]'
              )}
            >
              Capacity headroom in this cell: ~{headroomPct}%
            </p>
          ) : null}
          {p.techReadinessSustainLine ? (
            <p
              className={cn(
                'border-t border-border leading-relaxed text-muted-foreground',
                presentation === 'markdown' ? 'mt-4 border-border/60 pt-3 text-sm' : 'mt-3 pt-2.5 text-[11px]'
              )}
            >
              {p.techReadinessSustainLine}
            </p>
          ) : null}
          {p.pressureSurfaceLines.length > 0 ? (
            <div
              className={cn(
                'space-y-1 text-muted-foreground',
                presentation === 'markdown' ? 'mt-3 text-sm' : 'mt-2 text-[11px]'
              )}
            >
              <ul
                className={cn(
                  'space-y-1 leading-relaxed',
                  presentation === 'markdown' ? 'list-disc pl-5' : ''
                )}
              >
                {p.pressureSurfaceLines.slice(0, 4).map((line, i) => (
                  <li key={i} className={presentation === 'markdown' ? '' : 'pl-0.5 leading-snug'}>
                    {line}
                  </li>
                ))}
              </ul>
              {p.pressureSurfaceFootnote ? (
                <p
                  className={cn(
                    'leading-snug text-muted-foreground/90',
                    presentation === 'markdown' ? 'mt-2 text-[13px]' : 'mt-1.5 text-[10px]'
                  )}
                >
                  {p.pressureSurfaceFootnote}
                </p>
              ) : null}
            </div>
          ) : null}
          {p.storeTradingLine ? (
            <p
              className={cn(
                'border-t border-border leading-relaxed text-muted-foreground',
                presentation === 'markdown' ? 'mt-4 border-border/60 pt-3 text-sm' : 'mt-3 border-border/60 pt-2.5 text-[11px]'
              )}
            >
              <span className="font-medium text-foreground">Store rhythm (context): </span>
              {p.storeTradingLine}
            </p>
          ) : null}
        </>
      ) : p.viewMode === 'market_risk' ? (
        <>
          {p.deploymentRiskLine ? (
            <p
              className={cn(
                'leading-relaxed text-foreground',
                presentation === 'markdown' ? 'mt-3 text-[15px]' : 'mt-2 text-xs'
              )}
            >
              {p.deploymentRiskLine}
            </p>
          ) : null}
          <ul className={cn('space-y-2.5', presentation === 'markdown' ? 'mt-3' : 'mt-2')}>
            {terms.map((t) => {
              const share = (t.contribution / denom) * 100;
              const levelPct = Math.round(Math.min(1, Math.max(0, t.factor)) * 100);
              return (
                <li
                  key={t.key}
                  className={cn('leading-snug', presentation === 'markdown' ? 'text-[14px]' : 'text-xs')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-semibold text-foreground">{contributorShortLabel(t.label)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(share)}% of heatmap score
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    About {levelPct}% on the deployment-risk scale
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <>
          <ul className={cn('space-y-2.5', presentation === 'markdown' ? 'mt-3' : 'mt-2')}>
            {terms.map((t) => {
              const share = (t.contribution / denom) * 100;
              const levelPct = Math.round(Math.min(1, Math.max(0, t.factor)) * 100);
              const isHolidayDial = t.key === 'holiday';
              return (
                <li
                  key={t.key}
                  className={cn('leading-snug', presentation === 'markdown' ? 'text-[14px]' : 'text-xs')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-semibold text-foreground">{contributorShortLabel(t.label)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {isHolidayDial
                        ? t.factor >= 0.5
                          ? 'On'
                          : '—'
                        : `${Math.round(share)}% of blend`}
                    </span>
                  </div>
                  {!isHolidayDial ? (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      About {levelPct}% on this factor’s own scale
                      {t.weight < 0.999
                        ? ` · the model counts it as ${(t.weight * 100).toFixed(0)}% of the mix`
                        : null}
                    </p>
                  ) : t.factor >= 0.5 ? (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">Holiday boost is on for this view</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {p.storeTradingLine ? (
            <p
              className={cn(
                'border-t border-border leading-relaxed text-muted-foreground',
                presentation === 'markdown' ? 'mt-4 border-border/60 pt-3 text-sm' : 'mt-3 pt-2.5 text-[11px]'
              )}
            >
              {p.storeTradingLine}
            </p>
          ) : null}
        </>
      )}
      {presentation === 'markdown' ? (
        <p
          className={cn(
            'border-t border-border leading-snug text-muted-foreground',
            'mt-4 border-border/60 pt-3 text-[13px]'
          )}
        >
          {techLens ? (
            <>
              Band uses the full planning blend (tech, stores, campaigns, holidays)—not the same as tech headroom in the
              tile.
            </>
          ) : p.viewMode === 'market_risk' ? (
            <>Band uses the full planning blend; this heatmap is deployment risk only.</>
          ) : (
            <>Band includes tech delivery too; this heatmap highlights trading-style pressure only.</>
          )}
        </p>
      ) : null}
    </>
  );
}

function lensScoreFootnoteClass(presentation: DayDetailsPresentation): string {
  return presentation === 'markdown'
    ? 'mt-2 text-xs leading-snug text-muted-foreground'
    : 'mt-2 text-[10px] leading-snug text-muted-foreground';
}

function LensScoreFootnote({
  viewMode,
  presentation,
}: {
  viewMode: RunwayTooltipPayload['viewMode'];
  presentation: DayDetailsPresentation;
}) {
  const cls = lensScoreFootnoteClass(presentation);
  if (viewMode === 'combined') {
    return (
      <p className={cls}>
        Tile shows tech capacity headroom (0–1).{' '}
        <span className="font-medium text-foreground">Planning blend</span> below mixes tech, stores, campaigns, and
        holidays for the band—different construct.
      </p>
    );
  }
  if (viewMode === 'market_risk') {
    return (
      <p className={cls}>
        Tile is the deployment risk score (deployment/calendar fragility).{' '}
        <span className="font-medium text-foreground">Planning blend</span> is still the wider operational mix used for
        the band.
      </p>
    );
  }
  return (
    <p className={cls}>
      Fill score is modeled restaurant busyness from the store curve (0–1 before colour tweaks).{' '}
      <span className="font-medium text-foreground">Planning blend</span> still includes tech delivery and campaign risk,
      so the two numbers can diverge.
    </p>
  );
}

/** Lens fill metric before transfer curve / γ (all runway lenses use 0–1 headline values today). */
function formatLensFillScore(v: number, _viewMode: RunwayTooltipPayload['viewMode']): string {
  const clamped = Math.min(1, Math.max(0, v));
  return (Math.round(clamped * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '') || '0';
}

export function RunwayDayDetailsPayloadBody({
  p,
  presentation = 'popover',
}: {
  p: RunwayTooltipPayload;
  presentation?: DayDetailsPresentation;
}) {
  const pct = Math.min(999, Math.round(Math.max(0, p.fillMetricValue) * 100));
  const heatmapScoreStr = formatLensFillScore(p.fillMetricValue, p.viewMode);
  const planningBlend = p.row.planning_blend_01 ?? 0;
  const planningBlendStr = (Math.round(Math.min(1, Math.max(0, planningBlend)) * 100) / 100).toFixed(2);
  const fg = foregroundOnHeatmapFill(p.cellFillHex);
  const camps = clampList(p.activeCampaigns, 4);
  const techProgs = clampList(p.activeTechProgrammes, 4);
  const primaryTech = clampList(p.activeTechProgrammes, LENS_PRIMARY_LIST_MAX);
  const primaryCamps = clampList(p.activeCampaigns, LENS_PRIMARY_LIST_MAX);
  const primaryTechInline = clampList(p.activeTechProgrammes, 12);
  const wins = clampList(p.operatingWindows, 3);
  const bau = clampList(p.bauToday, 3);
  const fillGlossary =
    presentation === 'popover' ? glossaryFillScorePopover(p.viewMode) : glossaryFillScore(p.viewMode);
  const planningGlossary =
    presentation === 'popover'
      ? glossaryPlanningBlendPopover(p.viewMode)
      : glossaryPlanningBlend(p.viewMode);
  const fillLeadForPresentation =
    presentation === 'popover' ? p.fillMetricLeadCompact : p.fillMetricLabel;

  const bodyPad = presentation === 'markdown' ? 'px-0 pb-0 pt-1' : 'px-4 pb-4 pt-3';

  return (
    <article
      key={p.dateStr + p.market + p.viewMode}
      className={cn(
        'min-h-0 font-sans antialiased [font-feature-settings:"tnum","lnum"]',
        presentation === 'markdown' && 'text-[15px] leading-[1.65] text-foreground'
      )}
    >
      {presentation === 'markdown' ? (
        <header className="border-b border-border/70 pb-4">
          <p className="text-xs font-medium text-muted-foreground">{p.fillMetricHeadline}</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">{p.dateStr}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {p.market} · {p.weekdayShort}
              </p>
            </div>
            <div
              className="shrink-0 rounded-lg border border-border/80 px-3.5 py-2.5 shadow-sm"
              style={{ backgroundColor: p.cellFillHex, color: fg }}
              aria-label={`${pct} percent`}
            >
              <span className="block text-center text-3xl font-extrabold tabular-nums leading-none tracking-tight">
                {pct}
                <span className="align-top text-xl font-extrabold tracking-tight">%</span>
              </span>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{p.riskBand}</strong>
            <span className="mx-2 text-muted-foreground/40">·</span>
            {fillLeadForPresentation}
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-foreground">
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <TermWithDefinition label="Planning blend" definition={planningGlossary} dense />
            </span>{' '}
            <span className="font-semibold">{planningBlendStr}</span>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <TermWithDefinition label="Fill score" definition={fillGlossary} dense />
            </span>{' '}
            <span className="font-semibold">{heatmapScoreStr}</span>
          </p>
          <LensScoreFootnote viewMode={p.viewMode} presentation={presentation} />
        </header>
      ) : (
        <header className="relative border-b border-border bg-muted/15 px-4 pb-4 pt-11">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {p.fillMetricHeadline}
              </p>
              <p className="mt-1.5 text-xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-2xl">
                {p.dateStr}
              </p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {p.market} · {p.weekdayShort}
              </p>
            </div>
            <div
              className="shrink-0 rounded-lg border border-border/80 px-3.5 py-2.5 shadow-sm ring-1 ring-border/50"
              style={{ backgroundColor: p.cellFillHex, color: fg }}
              aria-label={`${pct} percent`}
            >
              <span className="block text-center text-3xl font-extrabold tabular-nums leading-none tracking-tight sm:text-[2.125rem]">
                {pct}
                <span className="align-top text-xl font-extrabold tracking-tight sm:text-2xl">%</span>
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-medium leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">{p.riskBand}</span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {fillLeadForPresentation}
          </p>
          <div className="mt-2.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-mono tabular-nums leading-snug text-foreground">
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <TermWithDefinition label="Planning blend" definition={planningGlossary} dense />
              </span>{' '}
              <span className="font-semibold">{planningBlendStr}</span>
            </p>
          </div>
          <p className="mt-2.5 text-[11px] font-mono tabular-nums leading-snug text-foreground">
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <TermWithDefinition label="Fill score" definition={fillGlossary} dense />
            </span>{' '}
            <span className="font-semibold">{heatmapScoreStr}</span>
          </p>
        </header>
      )}

      <div className={bodyPad}>
        {presentation !== 'markdown' && p.row.public_holiday_flag ? (
          <div className="mt-1 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 py-2.5 dark:border-sky-400/30 dark:bg-sky-400/10">
            <p className="text-xs font-semibold text-sky-950 dark:text-sky-200">Public holiday</p>
            <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
              {p.publicHolidayName ?? 'Stub calendar'}
            </p>
          </div>
        ) : null}

        {presentation !== 'markdown' && p.row.school_holiday_flag ? (
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-muted-foreground">
            School break — the model may treat this as a busier or tighter week.
          </p>
        ) : null}

        {presentation === 'markdown' ? (
          <>
            <h3 className="mt-0 text-sm font-semibold tracking-tight text-foreground">What shaped this day</h3>
            <div className="mt-3 space-y-5">
              {p.driverSummaryBlocks.map((block) => (
                <div key={block.heading}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {block.heading}
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-foreground marker:text-muted-foreground">
                    {block.bullets.map((b, i) => (
                      <li key={`${block.heading}-${i}`}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {presentation === 'markdown' && p.viewMode === 'combined' ? (
          <>
            <h3 className="mt-6 text-sm font-semibold tracking-tight text-foreground">Tech programmes</h3>
            {primaryTech.shown.length > 0 ? (
              <BulletList items={primaryTech.shown} presentation={presentation} />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">None scheduled on this day.</p>
            )}
            {primaryTech.more > 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">+{primaryTech.more} more</p>
            ) : null}
          </>
        ) : null}

        {presentation === 'markdown' && (p.viewMode === 'in_store' || p.viewMode === 'market_risk') ? (
          <>
            <h3 className="mt-6 text-sm font-semibold tracking-tight text-foreground">Marketing campaigns</h3>
            {primaryCamps.shown.length > 0 ? (
              <BulletList items={primaryCamps.shown} presentation={presentation} />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">None on the calendar for this day.</p>
            )}
            {primaryCamps.more > 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">+{primaryCamps.more} more</p>
            ) : null}
            {primaryTechInline.shown.length > 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Tech programmes (engineering only): </span>
                {primaryTechInline.shown.join(' · ')}
                {primaryTechInline.more > 0 ? ` · +${primaryTechInline.more} more` : null}
                <span className="text-muted-foreground/90"> — no store marketing uplift.</span>
              </p>
            ) : null}
          </>
        ) : null}

        {camps.shown.length > 0 && presentation !== 'markdown' ? (
          <>
            <SectionTitle presentation={presentation}>Campaigns on the calendar</SectionTitle>
            <BulletList items={camps.shown} presentation={presentation} />
            {camps.more > 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">+{camps.more} more</p>
            ) : null}
          </>
        ) : null}

        {techProgs.shown.length > 0 && presentation !== 'markdown' ? (
          p.viewMode === 'combined' ? (
            <>
              <SectionTitle presentation={presentation}>Tech programmes (no marketing uplift)</SectionTitle>
              <BulletList items={techProgs.shown} presentation={presentation} />
              {techProgs.more > 0 ? (
                <p className="mt-1 text-xs italic text-muted-foreground">+{techProgs.more} more</p>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">Engineering-only windows: </span>
              {techProgs.shown.join(' · ')}
              {techProgs.more > 0 ? ` · +${techProgs.more} more` : null}
              <span className="text-muted-foreground/90"> — no store marketing uplift.</span>
            </p>
          )
        ) : null}

        {wins.shown.length > 0 && presentation !== 'markdown' ? (
          <>
            <SectionTitle presentation={presentation}>When Market IT is staffed</SectionTitle>
            <BulletList items={wins.shown} presentation={presentation} />
            {wins.more > 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">+{wins.more} more</p>
            ) : null}
          </>
        ) : null}

        {bau.shown.length > 0 ? (
          <>
            <SectionTitle presentation={presentation}>Routine work on the schedule</SectionTitle>
            <BulletList items={bau.shown} presentation={presentation} />
            {bau.more > 0 ? (
              <p className="mt-1 text-xs italic text-muted-foreground">+{bau.more} more</p>
            ) : null}
          </>
        ) : null}

        {presentation !== 'markdown' ? (
          <details className="mt-2 rounded-md border border-border/70 bg-muted/10 open:shadow-sm">
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold tracking-tight text-foreground hover:bg-muted/30">
              Heatmap breakdown
            </summary>
            <div className="border-t border-border/60 px-1 pb-2 pt-0">
              <ContributorsBlock p={p} presentation={presentation} embedded />
            </div>
          </details>
        ) : null}

        {presentation !== 'markdown' ? (
          <details className="mt-2 rounded-md border border-border/70 bg-muted/10">
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold tracking-tight text-muted-foreground hover:bg-muted/30">
              Why the band can differ from the tile
            </summary>
            <p className="border-t border-border/60 px-3 pb-3 pt-2 text-[11px] leading-snug text-muted-foreground">
              {glossaryTileVsBandCollapse(p.viewMode)}
            </p>
          </details>
        ) : null}

        {presentation === 'markdown' && p.row.public_holiday_flag ? (
          <div className="mt-6 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 py-3 dark:border-sky-400/30 dark:bg-sky-400/10">
            <p className="text-xs font-semibold text-sky-950 dark:text-sky-200">Public holiday</p>
            <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
              {p.publicHolidayName ?? 'Stub calendar'}
            </p>
          </div>
        ) : null}

        {presentation === 'markdown' && p.row.school_holiday_flag ? (
          <p className="mt-5 text-sm font-medium leading-relaxed text-muted-foreground">
            School break — the model may treat this as a busier or tighter week.
          </p>
        ) : null}
      </div>
    </article>
  );
}
