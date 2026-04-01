import { useCallback, useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  fetchSharedDsl,
  getSharedDslBearer,
  getSharedDslEtag,
  isSharedDslEnabled,
  pullTeamWorkspaceWithUserConfirm,
  pushCurrentWorkspaceToCloud,
  setSharedDslBearer,
} from '@/lib/sharedDslSync';
import { cn } from '@/lib/utils';

function SectionDivider() {
  return <div role="presentation" className="h-px shrink-0 bg-border/70" />;
}

/** Vercel Blob shared YAML — rendered inside the Workspace dialog when `VITE_SHARED_DSL` is set. */
export function SharedWorkspaceSection() {
  const [bearerInput, setBearerInput] = useState('');
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null);
  const [etagPreview, setEtagPreview] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshMeta = useCallback(async () => {
    if (!isSharedDslEnabled()) return;
    const r = await fetchSharedDsl();
    setRemoteOk(r != null);
    setEtagPreview(r?.etag ? `${r.etag.slice(0, 12)}…` : null);
  }, []);

  useEffect(() => {
    if (!isSharedDslEnabled()) return;
    setBearerInput(getSharedDslBearer() ?? '');
    void refreshMeta();
  }, [refreshMeta]);

  const applyCloudSaveResult = useCallback(
    async (r: Awaited<ReturnType<typeof pushCurrentWorkspaceToCloud>>) => {
      if (r.ok) {
        setCloudFeedback({ kind: 'ok', text: 'Saved to cloud (Vercel Blob).' });
        await refreshMeta();
        return;
      }
      if (r.conflict) {
        setCloudFeedback({
          kind: 'err',
          text: 'Someone else saved first — use Pull from cloud to load their copy, then re-apply your edits.',
        });
        return;
      }
      setCloudFeedback({ kind: 'err', text: r.errorMessage ?? 'Save failed.' });
    },
    [refreshMeta]
  );

  const runSaveToCloud = useCallback(async () => {
    setCloudFeedback(null);
    setCloudBusy(true);
    try {
      const r = await pushCurrentWorkspaceToCloud();
      await applyCloudSaveResult(r);
    } finally {
      setCloudBusy(false);
    }
  }, [applyCloudSaveResult]);

  const onSaveSecret = useCallback(async () => {
    setCloudFeedback(null);
    setSharedDslBearer(bearerInput.trim() || null);
    setBearerInput(getSharedDslBearer() ?? '');
    if (!getSharedDslBearer()) {
      setCloudFeedback({ kind: 'err', text: 'Enter the team secret first.' });
      return;
    }
    setCloudBusy(true);
    try {
      const r = await pushCurrentWorkspaceToCloud();
      await applyCloudSaveResult(r);
    } finally {
      setCloudBusy(false);
    }
  }, [applyCloudSaveResult, bearerInput]);

  if (!isSharedDslEnabled()) return null;

  const canWrite = Boolean(getSharedDslBearer()?.trim());

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        One shared YAML for the team (Vercel Blob). The write secret must match{' '}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">CAPACITY_SHARED_DSL_SECRET</code> on Vercel.
        After you <span className="font-medium text-foreground/85">Save secret</span>, the current workspace uploads
        immediately. Use <span className="font-medium text-foreground/85">Save to cloud now</span> after further edits,
        or wait ~3s idle for auto-save.
      </p>

      <div className="mb-3 flex flex-col gap-1.5">
        <Label htmlFor="shared-dsl-bearer" className="text-[11px] text-muted-foreground">
          Write secret (session only — not your Vercel login)
        </Label>
        <div className="flex flex-wrap gap-2">
          <input
            id="shared-dsl-bearer"
            type="password"
            autoComplete="off"
            placeholder="Paste CAPACITY_SHARED_DSL_SECRET…"
            className={cn(
              'h-8 max-w-md min-w-[12rem] flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            value={bearerInput}
            onChange={(e) => setBearerInput(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 text-xs"
            disabled={cloudBusy}
            onClick={() => void onSaveSecret()}
          >
            Save secret & upload
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 text-xs"
            disabled={cloudBusy || !canWrite}
            title={!canWrite ? 'Save the secret first' : undefined}
            onClick={() => void runSaveToCloud()}
          >
            {cloudBusy ? 'Saving…' : 'Save to cloud now'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {canWrite ? (
              <span className="font-medium text-foreground/85">Ready to publish</span>
            ) : (
              <span className="font-medium text-foreground/85">Read-only</span>
            )}
            {canWrite ? ' · auto-save ~3s after YAML changes.' : ' · add secret above.'}
          </p>
        </div>
        {cloudFeedback ? (
          <p
            role="status"
            className={cn(
              'text-[11px] leading-snug',
              cloudFeedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
            )}
          >
            {cloudFeedback.text}
          </p>
        ) : null}
      </div>

      <SectionDivider />

      <div className="flex flex-wrap gap-2 pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={cloudBusy}
          onClick={() => void refreshMeta()}
        >
          Refresh status
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={cloudBusy}
          onClick={async () => {
            setCloudFeedback(null);
            setCloudBusy(true);
            try {
              const r = await pullTeamWorkspaceWithUserConfirm();
              if (r === 'ok') {
                const etag = getSharedDslEtag();
                setEtagPreview(etag ? `${etag.slice(0, 12)}…` : null);
                setRemoteOk(true);
                setCloudFeedback({ kind: 'ok', text: 'Loaded the latest copy from the cloud.' });
              } else if (r === 'cancelled') {
                /* user dismissed confirm */
              } else if (r === 'no_remote') {
                setCloudFeedback({
                  kind: 'err',
                  text: 'Nothing on the server yet, or the request failed. Bundled YAML is unchanged.',
                });
              } else {
                setCloudFeedback({ kind: 'err', text: 'Pull failed — check the network and try again.' });
              }
            } finally {
              setCloudBusy(false);
            }
          }}
        >
          Pull from cloud
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
        Server:{' '}
        {remoteOk === null
          ? '…'
          : remoteOk
            ? `copy exists${etagPreview ? ` · ${etagPreview}` : ''}`
            : 'no copy yet (first successful save creates it)'}
      </p>
    </div>
  );
}
