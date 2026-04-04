import { UserButton } from '@clerk/react';
import { clerkPublishableKey } from '@/lib/clerkConfig';
import { cn } from '@/lib/utils';

type Props = {
  /** Tighter avatar for the compact header bar */
  compact?: boolean;
  className?: string;
};

/**
 * Account menu when this build includes Clerk (`ClerkProvider` is active).
 * Renders nothing without `VITE_CLERK_PUBLISHABLE_KEY`.
 */
export function HeaderClerkUser({ compact, className }: Props) {
  if (!clerkPublishableKey()) return null;

  return (
    <div
      className={cn('flex shrink-0 items-center border-l border-border/60 pl-2', className)}
      title="Account"
    >
      <UserButton
        appearance={{
          elements: {
            avatarBox: compact ? 'h-7 w-7' : 'h-8 w-8',
          },
        }}
      />
    </div>
  );
}
