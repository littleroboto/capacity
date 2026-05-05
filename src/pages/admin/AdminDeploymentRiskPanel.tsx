import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type EventFormRow = {
  id: string;
  start: string;
  end: string;
  severity: string;
  kind: string;
};

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function isRowEmpty(r: EventFormRow): boolean {
  return (
    !r.id.trim() &&
    !r.start.trim() &&
    !r.end.trim() &&
    !r.severity.trim() &&
    !r.kind.trim()
  );
}

function normalizeEventsFromRow(fragment: Record<string, unknown>): EventFormRow[] {
  const raw = fragment.events;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    const id = o.id ?? o.eventId;
    return {
      id: id != null && id !== '' ? String(id) : '',
      start: o.start != null && o.start !== '' ? String(o.start) : '',
      end: o.end != null && o.end !== '' ? String(o.end) : '',
      severity: o.severity != null && o.severity !== '' ? String(o.severity) : '',
      kind: o.kind != null && o.kind !== '' ? String(o.kind) : '',
    };
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  fragments: Record<string, unknown>[];
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
};

/**
 * Editor for `deployment_risk_configs.events` → YAML `deployment_risk_events`.
 * Month curves, blackouts, and week weights stay in Quick edit / Full YAML fields.
 */
export function AdminDeploymentRiskPanel({ fragments, saving, onPersist }: Props) {
  const row = useMemo(() => {
    const active = fragments.filter((f) => String(f.status) !== 'archived');
    return active[0] ?? fragments[0] ?? null;
  }, [fragments]);

  const [eventRows, setEventRows] = useState<EventFormRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = row ? `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!row) {
      setEventRows([]);
      setLocalError(null);
      return;
    }
    const loaded = normalizeEventsFromRow(row);
    setEventRows(loaded.length > 0 ? loaded : []);
    setLocalError(null);
  }, [rowHydrateKey]);

  const updateRow = useCallback((index: number, patch: Partial<EventFormRow>) => {
    setEventRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    setEventRows((prev) => [...prev, { id: '', start: '', end: '', severity: '', kind: '' }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setEventRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const v = fragmentVersion(row);
    if (!Number.isFinite(v)) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    const candidates = eventRows.filter((r) => !isRowEmpty(r));
    const payload: Record<string, unknown>[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const r = candidates[i];
      if (!r.id.trim()) {
        setLocalError(`Event row ${i + 1}: id is required.`);
        return;
      }
      if (!ISO_DATE.test(r.start.trim())) {
        setLocalError(`Event "${r.id.trim()}": start must be YYYY-MM-DD.`);
        return;
      }
      if (!ISO_DATE.test(r.end.trim())) {
        setLocalError(`Event "${r.id.trim()}": end must be YYYY-MM-DD.`);
        return;
      }
      const sev = Number.parseFloat(r.severity.trim());
      if (!Number.isFinite(sev)) {
        setLocalError(`Event "${r.id.trim()}": severity must be a number.`);
        return;
      }
      const entry: Record<string, unknown> = {
        id: r.id.trim(),
        start: r.start.trim(),
        end: r.end.trim(),
        severity: sev,
      };
      if (r.kind.trim()) entry.kind = r.kind.trim();
      payload.push(entry);
    }

    try {
      await onPersist(row, { events: payload });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [row, eventRows, onPersist]);

  if (!row) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No deployment risk row yet. Import market YAML or create a fragment, then refresh.
      </section>
    );
  }

  const rowSaving = saving === String(row.id);

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-deploy-risk-events-title"
    >
      <div className="mb-4">
        <h2 id="admin-deploy-risk-events-title" className="text-base font-semibold">
          Deployment risk events (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edits YAML <span className="font-mono text-xs">deployment_risk_events</span> (id, start, end, severity, optional
          kind). Use <span className="font-mono text-xs">deployment_risk_week_weight</span>, curves, and{' '}
          <span className="font-mono text-xs">deployment_risk_blackouts</span> via Quick edit or &quot;Full YAML fields…&quot;.
          Build &amp; publish to refresh the artifact.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">id</th>
                <th className="px-3 py-2 font-medium">start</th>
                <th className="px-3 py-2 font-medium">end</th>
                <th className="px-3 py-2 font-medium">severity</th>
                <th className="px-3 py-2 font-medium">kind</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {eventRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No events yet. Add a row or save an empty list to clear stored events.
                  </td>
                </tr>
              ) : (
                eventRows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        value={r.id}
                        onChange={(e) => updateRow(i, { id: e.target.value })}
                        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                        placeholder="e.g. agm_day_fy2026"
                        disabled={rowSaving}
                        aria-label={`Event ${i + 1} id`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        value={r.start}
                        onChange={(e) => updateRow(i, { start: e.target.value })}
                        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums"
                        placeholder="YYYY-MM-DD"
                        disabled={rowSaving}
                        aria-label={`Event ${i + 1} start`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        value={r.end}
                        onChange={(e) => updateRow(i, { end: e.target.value })}
                        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums"
                        placeholder="YYYY-MM-DD"
                        disabled={rowSaving}
                        aria-label={`Event ${i + 1} end`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={r.severity}
                        onChange={(e) => updateRow(i, { severity: e.target.value })}
                        className="w-full min-w-[4rem] rounded border border-border bg-background px-2 py-1.5 tabular-nums"
                        placeholder="0–1"
                        disabled={rowSaving}
                        aria-label={`Event ${i + 1} severity`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="text"
                        value={r.kind}
                        onChange={(e) => updateRow(i, { kind: e.target.value })}
                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                        placeholder="optional"
                        disabled={rowSaving}
                        aria-label={`Event ${i + 1} kind`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeRow(i)}
                        disabled={rowSaving}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={addRow} disabled={rowSaving}>
            Add event
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={rowSaving}>
            {rowSaving ? 'Saving…' : 'Save events'}
          </Button>
          <span className="text-xs text-muted-foreground">v{String(row.version_number ?? '')}</span>
        </div>
      </div>
    </section>
  );
}
