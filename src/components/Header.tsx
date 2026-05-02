import { APP_VERSION, BUILD_TIME_ISO, GIT_COMMIT_MESSAGE, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
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

export function Header() {
  const navigate = useNavigate();
  const onTitleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const st = useAtcStore.getState();
      if (!isRunwayMultiMarketStrip(st.country)) return;
      e.preventDefault();
      const order = st.runwayMarketOrder.length ? st.runwayMarketOrder : [...FALLBACK_RUNWAY_MARKET_IDS];
      st.setCountry(gammaFocusMarket(st.country, st.configs, order), {});
      navigate({ pathname: '/', search: '' });
    },
    [navigate]
  );

  const titleLinkClass = cn(
    'text-inherit no-underline decoration-transparent transition-colors',
    'hover:underline hover:decoration-foreground/50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm'
  );

  return (
    <header className="border-b border-border bg-background">
      <div className="px-4 py-1.5 md:px-5 md:py-1.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h1 className="text-sm font-bold leading-tight tracking-tight text-foreground sm:text-[0.9375rem]">
              <Link
                to={{ pathname: '/', search: '' }}
                onClick={onTitleClick}
                className={cn(titleLinkClass, 'inline-flex items-center gap-2')}
                title="Landing page"
                aria-label="Go to landing page"
              >
                <SegmentWorkbenchMark className="h-5 w-5 text-foreground sm:h-[1.125rem] sm:w-[1.125rem]" />
                Capacity Workbench
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
