import { useCallback, useEffect, useReducer, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isClerkConfigured } from '@/lib/clerkConfig';
import {
  describeSharedDslProbe,
  fetchSharedDslDetailed,
  getSharedDslBearer,
  getSharedDslEtag,
  isSharedDslEnabled,
  pullTeamWorkspaceWithUserConfirm,
  pushCurrentWorkspaceToCloud,
  setSharedDslBearer,
  SHARED_DSL_AUTH_CHANGED_EVENT,
  sharedDslCloudPutAllowedSync,
  sharedDslWriteReadySync,
  type FetchSharedDslDetailed,
} from '@/lib/sharedDslSync';
import { WorkspaceAccessSummary } from '@/components/WorkspaceAccessSummary';
import { cn } from '@/lib/utils';

function SectionDivider() {
  return <div role="presentation" className="h-px shrink-0 bg-border/70" />;
}

/** Vercel Blob shared YAML — rendered inside the Workspace dialog when `VITE_SHARED_DSL` is set. */
export function SharedWorkspaceSection() {
  const [, authBump] = useReducer((n: number) => n + 1, 0);
  const [bearerInput, setBearerInput] = useState('');
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null);
  const [etagPreview, setEtagPreview] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [lastProbe, setLastProbe] = useState<FetchSharedDslDetailed | null>(null);
  const [legacyPanelOpen, setLegacyPanelOpen] = useState(() => Boolean(getSharedDslBearer()?.trim()));

  useEffect(() => {
    const onAuth = () => authBump();
    window.addEventListener(SHARED_DSL_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(SHARED_DSL_AUTH_CHANGED_EVENT, onAuth);
  }, []);

  useEffect(() => {
    if (isClerkConfigured() && getSharedDslBearer()?.trim()) setLegacyPanelOpen(true);
  }, [authBump]);

  const refreshMeta = useCallback(async () => {
    if (!isSharedDslEnabled()) return;
    const d = await fetchSharedDslDetailed();
    setLastProbe(d);

    if (d.ok) {
      setRemoteOk(true);
      setEtagPreview(d.etag ? `${d.etag.slice(0, 12)}…` : null);
      setCloudFeedback(null);
      return;
    }

    if (d.reason === 'not_found') {
      setRemoteOk(false);
      setEtagPreview(null);
      setCloudFeedback(null);
      return;
    }

    if (d.reason === 'unauthorized') {
      setRemoteOk(false);
      setEtagPreview(null);
      setCloudFeedback({
        kind: 'err',
        text: 'Cloud workspace returned 401. Open “Connection check” below — usually CLERK_SECRET_KEY, authorized parties, or sign-in.',
      });
      return;
    }

    if (d.reason === 'html_spa_fallback' || d.reason === 'network') {
      setRemoteOk(false);
      setEtagPreview(null);
      setCloudFeedback({
        kind: 'err',
        text: 'No real API at this URL (see “Connection check”). Use `vercel dev` locally or test on Vercel.',
      });
      return;
    }

    if (d.reason === 'server_error' || d.reason === 'invalid_yaml') {
      setRemoteOk(false);
      setEtagPreview(null);
      setCloudFeedback({
        kind: 'err',
        text: 'Unexpected response from /api/shared-dsl — see “Connection check” below.',
      });
      return;
    }

    setRemoteOk(false);
    setEtagPreview(null);
    setCloudFeedback(null);
  }, []);

  useEffect(() => {
    if (!isSharedDslEnabled()) return;
    setBearerInput(getSharedDslBearer() ?? '');
    void refreshMeta();
  }, [refreshMeta, authBump]);

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

  const hasCloudAuth = sharedDslWriteReadySync();
  const canPutToCloud = sharedDslCloudPutAllowedSync();
  const clerkOn = isClerkConfigured();

  const legacySecretFields = (
    <>
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
          disabled={cloudBusy || !canPutToCloud}
          title={!canPutToCloud ? 'Your role cannot upload to the team cloud.' : undefined}
          onClick={() => void onSaveSecret()}
        >
          Save secret & upload
        </Button>
      </div>
    </>
  );

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground/85">Team scenario</span> — one shared YAML on Vercel Blob (bundled
        markets until the first successful save). Personal heatmap curves, filters, palette, and 3D are per browser — use{' '}
        <span className="font-medium text-foreground/85">View on this device</span> below to export/import that state.
        {clerkOn ? (
          <>
            {' '}
            While signed in, cloud load/save uses your Clerk session when the server has{' '}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">CLERK_SECRET_KEY</code>. You normally do not need
            the legacy team secret.
          </>
        ) : (
          <>
            {' '}
            The write secret must match{' '}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">CAPACITY_SHARED_DSL_SECRET</code> on Vercel.
          </>
        )}{' '}
        {clerkOn ? (
          <>
            Use <span className="font-medium text-foreground/85">Save to cloud now</span> after edits, or wait ~3s idle for
            auto-save.
          </>
        ) : (
          <>
            After you <span className="font-medium text-foreground/85">Save secret</span>, the current workspace uploads
            immediately. Use <span className="font-medium text-foreground/85">Save to cloud now</span> after further edits,
            or wait ~3s idle for auto-save.
          </>
        )}
      </p>

      {clerkOn ? (
        <div className="mb-3">
          <WorkspaceAccessSummary />
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-1.5">
        {clerkOn ? (
          <details
            className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5"
            open={legacyPanelOpen}
            onToggle={(e) => setLegacyPanelOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer select-none text-[11px] font-medium text-foreground/80 outline-none hover:text-foreground">
              Legacy team secret (optional)
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">{legacySecretFields}</div>
          </details>
        ) : (
          legacySecretFields
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 text-xs"
            disabled={cloudBusy || !canPutToCloud}
            title={
              !hasCloudAuth
                ? 'Sign in (Clerk) or save the team secret first'
                : !canPutToCloud
                  ? 'Your Clerk organization role cannot save (viewer or role not in VITE_CLERK_DSL_WRITE_ROLES).'
                  : undefined
            }
            onClick={() => void runSaveToCloud()}
          >
            {cloudBusy ? 'Saving…' : 'Save to cloud now'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {!hasCloudAuth ? (
              <>
                <span className="font-medium text-foreground/85">Read-only</span>
                {' · sign in or add secret above.'}
              </>
            ) : !canPutToCloud ? (
              <>
                <span className="font-medium text-foreground/85">Cloud read-only</span>
                {' · your org role cannot PUT; pulls still work. Match '}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">VITE_CLERK_DSL_WRITE_ROLES</code> with the
                server allow list.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground/85">Ready to publish</span>
                {' · auto-save ~3s after YAML changes.'}
              </>
            )}
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
            : lastProbe && !lastProbe.ok && lastProbe.reason === 'not_found'
              ? 'no copy yet (first successful save creates it)'
              : 'not loaded — see connection check'}
      </p>

      <div className="mt-3 rounded-md border border-border/70 bg-background/80 p-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Connection check
        </p>
        {lastProbe == null ? (
          <p className="text-[11px] text-muted-foreground">Run Refresh status to probe GET /api/shared-dsl.</p>
        ) : (
          <ul className="space-y-1 text-[11px] leading-snug text-foreground/90">
            {describeSharedDslProbe(lastProbe).map((line, i) => (
              <li key={i} className="pl-0.5">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
