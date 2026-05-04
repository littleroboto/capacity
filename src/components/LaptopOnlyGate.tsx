import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Laptop } from 'lucide-react';
import { useMediaMinWidth } from '@/hooks/useMediaMinWidth';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { PRODUCT_NAME_SPOKEN, PRODUCT_WORDMARK } from '@/lib/productBranding';
import { Button } from '@/components/ui/button';

/**
 * Workbench is a dense multi-pane planning surface (Monaco editor, day-grid heatmaps,
 * draggable split handle). It assumes ≥1024px (Tailwind `lg`); below that the layout
 * stacks awkwardly and is genuinely hard to use. Render this gate on `/app` and `/admin`
 * to show a friendly viewport message instead of the broken-on-mobile UI. Marketing
 * pages (landing, waitlist) are intentionally outside the gate.
 */
export const LAPTOP_GATE_MIN_WIDTH_PX = 1024;

const OVERRIDE_STORAGE_KEY = 'capacity:workbench-viewport-override';

function readOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(OVERRIDE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOverride(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(OVERRIDE_STORAGE_KEY, '1');
    else window.localStorage.removeItem(OVERRIDE_STORAGE_KEY);
  } catch {
    /* private mode / quota — silently ignore */
  }
}

interface LaptopOnlyGateProps {
  children: ReactNode;
  /** Override the default 1024px threshold (e.g. for unit tests). */
  minWidthPx?: number;
}

export function LaptopOnlyGate({
  children,
  minWidthPx = LAPTOP_GATE_MIN_WIDTH_PX,
}: LaptopOnlyGateProps) {
  const wideEnough = useMediaMinWidth(minWidthPx);
  const [override, setOverride] = useState<boolean>(readOverride);

  const onContinueAnyway = useCallback(() => {
    writeOverride(true);
    setOverride(true);
  }, []);

  if (wideEnough || override) return <>{children}</>;
  return <ViewportTooSmallScreen minWidthPx={minWidthPx} onContinueAnyway={onContinueAnyway} />;
}

function ViewportTooSmallScreen({
  minWidthPx,
  onContinueAnyway,
}: {
  minWidthPx: number;
  onContinueAnyway: () => void;
}) {
  const [viewportPx, setViewportPx] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportPx(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="landing-root relative flex min-h-[100dvh] flex-col bg-zinc-50 text-zinc-900 antialiased"
    >
      <header className="px-5 pt-6 sm:px-8 sm:pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 font-landing text-base font-extrabold tracking-[-0.02em] text-zinc-900"
          title={`${PRODUCT_WORDMARK} — home`}
          aria-label={`${PRODUCT_NAME_SPOKEN}, go to home`}
        >
          <SegmentWorkbenchMark className="h-[1.15em] w-[1.15em] shrink-0 self-center text-zinc-900" />
          <span className="tracking-tight">{PRODUCT_WORDMARK}</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-stretch px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
        <div className="mx-auto flex w-full max-w-lg flex-col">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 shadow-sm">
            <Laptop className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-6 font-landing text-balance text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-[1.65rem]">
            The workbench needs a larger screen
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-600 sm:text-[15px]">
            {PRODUCT_NAME_SPOKEN} is built around a dense, multi-pane planning surface — a YAML
            editor, day-grid heatmaps, and a draggable split — designed for laptop and desktop
            displays. On small screens it stacks awkwardly and is hard to use, so we&rsquo;re
            holding it back rather than ship a broken experience.
          </p>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-zinc-600 sm:text-[15px]">
            Please reopen this page on a device at least{' '}
            <span className="font-semibold text-zinc-800">{minWidthPx}px wide</span>
            {viewportPx != null ? (
              <>
                {' '}
                <span className="text-zinc-500">
                  (currently {viewportPx}px)
                </span>
              </>
            ) : null}
            .
          </p>

          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="bg-zinc-900 text-zinc-50 hover:bg-zinc-800">
              <Link to="/">Back to landing</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onContinueAnyway}
              className="border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            >
              Continue anyway
            </Button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            Choosing &ldquo;Continue anyway&rdquo; is remembered on this device. Clear site data
            to be asked again.
          </p>
        </div>
      </main>
    </div>
  );
}
