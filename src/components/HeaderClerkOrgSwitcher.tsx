import { OrganizationSwitcher } from '@clerk/react';
import { clerkPublishableKey } from '@/lib/clerkConfig';
import { cn } from '@/lib/utils';

type Props = {
  compact?: boolean;
  className?: string;
};

/**
 * Picks the **active Clerk organization** so the session JWT includes `o.rol` for
 * `CAPACITY_CLERK_DSL_WRITE_ROLES` / `VITE_CLERK_DSL_WRITE_ROLES`.
 */
export function HeaderClerkOrgSwitcher({ compact, className }: Props) {
  if (!clerkPublishableKey()) return null;

  return (
    <div
      className={cn('flex min-w-0 shrink-0 items-center border-l border-border/60 pl-2', className)}
      title="Active organization"
    >
      <OrganizationSwitcher
        afterSelectOrganizationUrl={
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}${window.location.hash}`
            : '/'
        }
        appearance={{
          elements: {
            organizationSwitcherTrigger: cn(
              'max-w-[11rem] truncate rounded-md border border-border/80 bg-background px-2 font-medium text-foreground shadow-sm hover:bg-muted/80',
              compact ? 'h-7 text-[11px]' : 'h-8 text-xs'
            ),
            organizationSwitcherPopoverActionButton: 'text-sm',
          },
        }}
      />
    </div>
  );
}
