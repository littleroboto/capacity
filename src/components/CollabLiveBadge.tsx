import type YPartyKitProvider from 'y-partykit/provider';
import {
  type CollabLinkPhase,
  useCollabProviderStatus,
  useCollabRemotePeerCount,
} from '@/lib/collab/useCollabProviderStatus';
import { cn } from '@/lib/utils';
import { Radio, Users } from 'lucide-react';

type CollabLiveBadgeProps = {
  provider: YPartyKitProvider;
  marketId: string;
  className?: string;
};

const PHASE_BASE: Record<
  Exclude<CollabLinkPhase, 'synced'>,
  { label: string; detail: string }
> = {
  connecting: {
    label: 'Connecting…',
    detail: 'Opening live sync to PartyKit for this market document.',
  },
  connected: {
    label: 'Syncing…',
    detail: 'WebSocket connected; merging document state with the room.',
  },
  disconnected: {
    label: 'Offline',
    detail:
      'Not connected to PartyKit (network, auth, or server). Edits stay local until reconnected. Check VITE_PARTYKIT_HOST, PartyKit deploy, and CLERK_SECRET_KEY on PartyKit.',
  },
};

function syncedCopy(remotePeers: number): { label: string; detail: string } {
  if (remotePeers <= 0) {
    return {
      label: 'Live',
      detail:
        'Real-time collab is on — you are the only one in this market room right now. When someone else joins the same room, their edits merge here automatically.',
    };
  }
  if (remotePeers === 1) {
    return {
      label: 'Live · 1 other',
      detail:
        'One other person is connected to this market document. You should see each other’s typing in near real time.',
    };
  }
  return {
    label: `Live · ${remotePeers} others`,
    detail: `${remotePeers} other people are in this market room; Yjs is merging edits across everyone connected.`,
  };
}

export function CollabLiveBadge({ provider, marketId, className }: CollabLiveBadgeProps) {
  const phase = useCollabProviderStatus(provider);
  const remotePeers = useCollabRemotePeerCount(provider);

  const { label, detail } =
    phase === 'synced' ? syncedCopy(remotePeers) : PHASE_BASE[phase];

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-semibold tabular-nums tracking-tight transition-[box-shadow,background-color,border-color] duration-300',
        phase === 'synced' &&
          remotePeers > 0 &&
          'border-emerald-500/50 bg-emerald-500/12 text-emerald-950 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_2px_12px_-4px_rgba(16,185,129,0.35)] dark:border-emerald-400/40 dark:bg-emerald-950/45 dark:text-emerald-50',
        phase === 'synced' &&
          remotePeers === 0 &&
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100',
        phase === 'connecting' &&
          'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100',
        phase === 'connected' &&
          'border-sky-500/40 bg-sky-500/10 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/35 dark:text-sky-100',
        phase === 'disconnected' &&
          'border-border/80 bg-muted/50 text-muted-foreground dark:bg-muted/30',
        className
      )}
      title={`${detail} Room includes market ${marketId}.`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center" aria-hidden>
        {phase === 'synced' ? (
          <>
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40',
                remotePeers > 0 ? 'animate-ping' : 'animate-pulse'
              )}
            />
            <span
              className={cn(
                'relative inline-flex h-2 w-2 rounded-full',
                remotePeers > 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-emerald-500/90 dark:bg-emerald-400/90'
              )}
            />
          </>
        ) : (
          <Radio
            className={cn(
              'h-3 w-3',
              phase === 'connecting' && 'animate-pulse text-amber-600 dark:text-amber-400',
              phase === 'connected' && 'text-sky-600 dark:text-sky-400',
              phase === 'disconnected' && 'opacity-60'
            )}
          />
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {phase === 'synced' && remotePeers > 0 ? (
          <Users className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}
