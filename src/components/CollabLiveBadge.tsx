import type YPartyKitProvider from 'y-partykit/provider';
import {
  type CollabLinkPhase,
  useCollabProviderStatus,
} from '@/lib/collab/useCollabProviderStatus';
import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

type CollabLiveBadgeProps = {
  provider: YPartyKitProvider;
  marketId: string;
  className?: string;
};

const PHASE_COPY: Record<CollabLinkPhase, { label: string; detail: string }> = {
  connecting: {
    label: 'Connecting…',
    detail: 'Opening live sync to PartyKit for this market document.',
  },
  connected: {
    label: 'Syncing…',
    detail: 'WebSocket connected; merging document state with the room.',
  },
  synced: {
    label: 'Live',
    detail:
      'Yjs sync is active for this market. Another editor on the same team room sees changes in real time. Solo editing looks the same as before.',
  },
  disconnected: {
    label: 'Offline',
    detail:
      'Not connected to PartyKit (network, auth, or server). Edits stay local until reconnected. Check VITE_PARTYKIT_HOST, PartyKit deploy, and CLERK_SECRET_KEY on PartyKit.',
  },
};

export function CollabLiveBadge({ provider, marketId, className }: CollabLiveBadgeProps) {
  const phase = useCollabProviderStatus(provider);
  const { label, detail } = PHASE_COPY[phase];

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-medium tabular-nums',
        phase === 'synced' &&
          'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100',
        phase === 'connecting' &&
          'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100',
        phase === 'connected' &&
          'border-sky-500/35 bg-sky-500/10 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/35 dark:text-sky-100',
        phase === 'disconnected' &&
          'border-border/80 bg-muted/50 text-muted-foreground dark:bg-muted/30',
        className
      )}
      title={`${detail} Room includes market ${marketId}.`}
      role="status"
      aria-live="polite"
    >
      <Radio
        className={cn(
          'h-3 w-3 shrink-0',
          phase === 'synced' && 'text-emerald-600 dark:text-emerald-400',
          phase === 'connecting' && 'animate-pulse text-amber-600 dark:text-amber-400',
          phase === 'connected' && 'text-sky-600 dark:text-sky-400',
          phase === 'disconnected' && 'opacity-60'
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
