import { SignOutButton } from '@clerk/react';
import { LogOut } from 'lucide-react';
import { clerkPublishableKey } from '@/lib/clerkConfig';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  /** Icon-only control for the collapsed controls rail */
  collapsed?: boolean;
};

/**
 * Secondary sign-out for the controls panel (header `UserButton` remains primary).
 * Renders nothing without `VITE_CLERK_PUBLISHABLE_KEY`.
 */
export function DslPanelClerkSignOut({ collapsed }: Props) {
  if (!clerkPublishableKey()) return null;

  return (
    <SignOutButton redirectUrl="/">
      <Button
        type="button"
        variant={collapsed ? 'ghost' : 'outline'}
        size="sm"
        className={cn(
          collapsed
            ? 'h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground'
            : 'h-7 gap-1.5 px-2 text-[11px] font-normal leading-none text-muted-foreground'
        )}
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className={cn('shrink-0 opacity-80', collapsed ? 'h-4 w-4' : 'h-3 w-3')} aria-hidden />
        {collapsed ? null : 'Sign out'}
      </Button>
    </SignOutButton>
  );
}
