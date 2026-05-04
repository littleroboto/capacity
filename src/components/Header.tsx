import {
  APP_VERSION,
  BUILD_TIME_ISO,
  GIT_COMMIT_MESSAGE,
  GIT_COMMIT_SHORT,
} from '@/lib/buildMeta';
import { HeaderClerkOrgSwitcher } from '@/components/HeaderClerkOrgSwitcher';
import { HeaderClerkUser } from '@/components/HeaderClerkUser';
import { cn } from '@/lib/utils';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  gammaFocusMarket,
  isRunwayMultiMarketStrip,
} from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import { Link, useNavigate } from 'react-router-dom';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { PRODUCT_NAME_SPOKEN, PRODUCT_WORDMARK } from '@/lib/productBranding';
import { GitBranch } from 'lucide-react';
import { useCallback, type MouseEvent } from 'react';

/** First 75 chars of the commit subject; ellipsised when longer. Empty/placeholder messages collapse to ''. */
const COMMIT_SUBJECT_75 = (() => {
  const raw = (GIT_COMMIT_MESSAGE ?? '').trim();
  if (!raw || raw === '—') return '';
  return raw.length > 75 ? `${raw.slice(0, 75)}…` : raw;
})();

const BUILD_STAMP_TITLE = (() => {
  const subject = GIT_COMMIT_MESSAGE && GIT_COMMIT_MESSAGE !== '—' ? ` · ${GIT_COMMIT_MESSAGE}` : '';
  const built = BUILD_TIME_ISO ? ` · built ${BUILD_TIME_ISO}` : '';
  return `v${APP_VERSION} · ${GIT_COMMIT_SHORT}${subject}${built}`;
})();

type HeaderProps = {
  /** Dashboard chrome: compact top bar, context in the left rail instead of a marketing title. */
  layout?: 'default' | 'studio';
};

export function Header({ layout = 'default' }: HeaderProps) {
  const navigate = useNavigate();
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const onTitleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const st = useAtcStore.getState();
      if (isRunwayMultiMarketStrip(st.country)) {
        const order = st.runwayMarketOrder.length ? st.runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
        st.setCountry(gammaFocusMarket(st.country, st.configs, order), {});
      }
      navigate({ pathname: '/', search: '' }, { replace: true });
    },
    [navigate]
  );

  const titleLinkClass = cn(
    'text-inherit no-underline decoration-transparent transition-colors',
    'hover:underline hover:decoration-foreground/50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm'
  );

  if (layout === 'studio') {
    const contextLabel = viewMode === 'code' ? 'YAML' : 'Runway';
    return (
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5 md:px-4">
          <div className="flex min-w-0 items-baseline gap-2 lg:hidden">
            <h1 className="truncate font-semibold tracking-tight text-foreground">
              <Link
                to="/"
                onClick={onTitleClick}
                className={cn(titleLinkClass, 'inline-flex items-center gap-1.5 text-[11px]')}
                title={`${PRODUCT_WORDMARK} — home`}
                aria-label={`${PRODUCT_NAME_SPOKEN}, go to home`}
              >
                <SegmentWorkbenchMark className="h-[1.2em] w-[1.2em] shrink-0 self-center text-primary" />
                <span className="tracking-tight">{PRODUCT_WORDMARK}</span>
              </Link>
            </h1>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{country}</span>
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {contextLabel}
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-mono text-xs tabular-nums text-foreground/90">{country}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HeaderClerkOrgSwitcher compact />
            <HeaderClerkUser compact />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-border bg-background">
      <div className="px-4 py-1.5 md:px-5 md:py-1.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h1 className="font-bold leading-tight tracking-tight text-foreground">
              <Link
                to="/"
                onClick={onTitleClick}
                className={cn(
                  titleLinkClass,
                  'inline-flex items-center gap-2 text-[13px] font-semibold sm:text-[0.9375rem]'
                )}
                title={`${PRODUCT_WORDMARK} — home`}
                aria-label={`${PRODUCT_NAME_SPOKEN}, go to home`}
              >
                <SegmentWorkbenchMark className="h-[1.2em] w-[1.2em] shrink-0 self-center text-foreground" />
                <span className="tracking-tight">{PRODUCT_WORDMARK}</span>
              </Link>
            </h1>
            <span
              className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-[10px] leading-snug text-muted-foreground"
              title={BUILD_STAMP_TITLE}
            >
              <span className="font-medium tabular-nums text-foreground/70">v{APP_VERSION}</span>
              <span className="text-muted-foreground/80">·</span>
              <span className="inline-flex items-center gap-0.5">
                <GitBranch className="h-2.5 w-2.5 shrink-0 text-muted-foreground/80" aria-hidden />
                <span className="font-mono tabular-nums text-foreground/65">{GIT_COMMIT_SHORT}</span>
              </span>
              {COMMIT_SUBJECT_75 ? (
                <>
                  <span className="text-muted-foreground/80">·</span>
                  <span className="min-w-0 truncate text-muted-foreground/85">{COMMIT_SUBJECT_75}</span>
                </>
              ) : null}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
            <HeaderClerkOrgSwitcher compact />
            <HeaderClerkUser compact />
          </div>
        </div>
      </div>
    </header>
  );
}
