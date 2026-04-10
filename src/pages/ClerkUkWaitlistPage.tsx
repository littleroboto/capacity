import { Link } from 'react-router-dom';
import { Waitlist } from '@clerk/react';
import { Loader2 } from 'lucide-react';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import { SegmentWorkbenchMark } from '@/components/SegmentWorkbenchMark';
import { clerkPublishableKey } from '@/lib/clerkConfig';
import { cn } from '@/lib/utils';

const clerkAppearance = {
  elements: {
    footerAction: { display: 'none' as const },
  },
};

/**
 * Clerk waitlist for UK early access. Requires **Waitlist** enabled in Clerk Dashboard
 * (User & Authentication → Waitlist) and {@link clerkPublishableKey} set in env.
 *
 * @see https://clerk.com/docs/react/components/waitlist
 */
export function ClerkUkWaitlistPage() {
  const key = clerkPublishableKey();

  if (!key) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#040506] px-4 py-10 text-center text-sm text-zinc-400">
        <p>Early access signup is not available in this build.</p>
        <Link
          to="/"
          className="text-sm font-medium text-[#FFC72C] underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="landing-root relative min-h-screen bg-[#040506] text-zinc-100 antialiased selection:bg-[#FFC72C]/35">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_65%_at_50%_115%,rgba(15,23,42,0.9),transparent_58%)]" />
        <div
          className="absolute -left-[18%] -top-[24%] h-[70vh] w-[min(100vw,720px)] opacity-[0.35] blur-[72px]"
          style={{
            background:
              'radial-gradient(circle at 40% 45%, rgba(99, 102, 241, 0.18), transparent 55%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-landing text-base font-extrabold tracking-[-0.02em] text-zinc-50 sm:text-lg"
          >
            <SegmentWorkbenchMark className="h-7 w-7 shrink-0 text-zinc-50 sm:h-8 sm:w-8" />
            Segment Workbench
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-semibold text-zinc-300">
            <MarketCircleFlag marketId="UK" size={18} className="ring-white/15" />
            UK early access
          </span>
        </header>

        <main className="flex flex-1 flex-col items-stretch">
          <h1 className="font-landing text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Join the UK waitlist
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
            Register for early access to the workbench. We’ll email you when your account is ready.
            Already approved?{' '}
            <Link
              to="/app"
              className="font-medium text-[#FFC72C] underline-offset-4 hover:underline"
            >
              Open the workbench
            </Link>
            .
          </p>

          <div
            className={cn(
              'mt-10 w-full max-w-md self-center',
              '[&_.cl-card]:shadow-lg [&_.cl-rootBox]:mx-auto [&_.cl-rootBox]:w-full'
            )}
          >
            <Waitlist
              signInUrl="/app"
              afterJoinWaitlistUrl="/"
              appearance={clerkAppearance}
              fallback={
                <div
                  className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-500"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-5 w-5 animate-spin opacity-70" />
                  <span>Loading form…</span>
                </div>
              }
            />
          </div>
        </main>
      </div>
    </div>
  );
}
