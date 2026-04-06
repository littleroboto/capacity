import { useAuth, useOrganization } from '@clerk/react';
import {
  CLERK_ORG_PUBLIC_META_EDITOR,
  CLERK_ORG_PUBLIC_META_MARKET,
  CLERK_ORG_PUBLIC_META_SEGMENT,
  readClerkOrgCapacityHints,
} from '@/lib/clerkOrgCapacityMetadata';
import { useCapacityAccess } from '@/lib/capacityAccessContext';
import { isClerkConfigured } from '@/lib/clerkConfig';
import { cn } from '@/lib/utils';

/**
 * Workspace dialog helper: shows effective `cap_*`–derived access and active org metadata hints.
 */
export function WorkspaceAccessSummary() {
  const access = useCapacityAccess();
  const { isLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();

  if (!isClerkConfigured() || !isLoaded || !isSignedIn) return null;

  const hints = readClerkOrgCapacityHints(organization?.publicMetadata);
  const orgName = organization?.name?.trim() || 'No active organization';
  const lines: string[] = [];

  if (access.legacyFullAccess && access.admin && access.canEditYaml) {
    lines.push('Session: full workspace (no restrictive cap_* claims, or global admin).');
  } else {
    if (access.admin) lines.push('Session: workspace admin (all markets).');
    else {
      if (access.segments.length) {
        lines.push(`Session segments: ${access.segments.join(', ')}`);
      }
      if (access.allowedMarketIds.length) {
        lines.push(`Session markets: ${access.allowedMarketIds.join(', ')}`);
      } else if (!access.admin && !access.legacyFullAccess) {
        lines.push('Session markets: (none — check Clerk claims and segment definitions)');
      }
    }
    lines.push(`Session YAML edit: ${access.canEditYaml ? 'allowed' : 'read-only'}`);
  }

  return (
    <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Workspace access
      </p>
      <p className="mb-1.5 text-[11px] text-foreground/85">
        <span className="font-medium">Active org:</span> {orgName}
      </p>
      <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/90">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {organization ? (
        <div
          className={cn(
            'mt-2 border-t border-border/40 pt-2 text-[10px] leading-snug text-muted-foreground'
          )}
        >
          <span className="font-medium text-foreground/75">Org metadata hints</span>
          {' — '}
          {hints.segment || hints.market || hints.editorHint !== undefined ? (
            <span className="font-mono text-[9px] text-foreground/80">
              {CLERK_ORG_PUBLIC_META_SEGMENT}={hints.segment ?? '—'} · {CLERK_ORG_PUBLIC_META_MARKET}=
              {hints.market ?? '—'} · {CLERK_ORG_PUBLIC_META_EDITOR}=
              {hints.editorHint === undefined ? '—' : String(hints.editorHint)}
            </span>
          ) : (
            <span>
              No <code className="rounded bg-muted px-0.5 font-mono text-[9px]">capacity_*</code> keys on this org —
              set them in Clerk and map to JWT claims (see docs/CLERK_CAPACITY_ORG_SETUP.md).
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          Choose an organization in the header switcher so segment/market metadata can apply.
        </p>
      )}
    </div>
  );
}
