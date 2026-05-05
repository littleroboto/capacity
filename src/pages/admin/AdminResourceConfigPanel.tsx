import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/** Canonical YAML / engine month keys under `resources.staff.monthly_pattern`. */
export const STAFF_MONTHLY_KEYS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type StaffMonthKey = (typeof STAFF_MONTHLY_KEYS)[number];

function fragmentVersion(f: Record<string, unknown>): number {
  const raw = f.version_number ?? f.versionNumber;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function readStaffMonthlyPattern(fragment: Record<string, unknown>): Record<StaffMonthKey, string> {
  const raw = fragment.staff_monthly_pattern ?? fragment.staffMonthlyPattern;
  const out = {} as Record<StaffMonthKey, string>;
  for (const m of STAFF_MONTHLY_KEYS) out[m] = '';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const m of STAFF_MONTHLY_KEYS) {
      const v = o[m];
      if (v != null && v !== '') out[m] = String(v);
    }
  }
  return out;
}

function readBasis(fragment: Record<string, unknown>): string {
  const v = fragment.staff_monthly_pattern_basis ?? fragment.staffMonthlyPatternBasis;
  if (v === 'absolute' || v === 'multiplier') return v;
  return '';
}

type Props = {
  fragments: Record<string, unknown>[];
  saving: string | null;
  onPersist: (fragment: Record<string, unknown>, updates: Record<string, unknown>) => Promise<void>;
};

/**
 * Primary editor for the singleton `resource_configs` row — matches YAML `resources` (labs, staff + monthly_pattern, testing_capacity).
 */
export function AdminResourceConfigPanel({ fragments, saving, onPersist }: Props) {
  const row = useMemo(() => {
    const active = fragments.filter((f) => String(f.status) !== 'archived');
    return active[0] ?? fragments[0] ?? null;
  }, [fragments]);

  const [labs, setLabs] = useState('');
  const [staff, setStaff] = useState('');
  const [testing, setTesting] = useState('');
  const [basis, setBasis] = useState<string>('');
  const [months, setMonths] = useState<Record<StaffMonthKey, string>>(() => {
    const z = {} as Record<StaffMonthKey, string>;
    for (const m of STAFF_MONTHLY_KEYS) z[m] = '';
    return z;
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const rowHydrateKey = row ? `${String(row.id)}:${String(row.version_number ?? row.versionNumber ?? '')}` : '';

  useEffect(() => {
    if (!row) {
      setLabs('');
      setStaff('');
      setTesting('');
      setBasis('');
      const empty = {} as Record<StaffMonthKey, string>;
      for (const m of STAFF_MONTHLY_KEYS) empty[m] = '';
      setMonths(empty);
      setLocalError(null);
      return;
    }
    const lc = row.labs_capacity ?? row.labsCapacity;
    const sc = row.staff_capacity ?? row.staffCapacity;
    const tc = row.testing_capacity ?? row.testingCapacity;
    setLabs(lc == null || lc === '' ? '' : String(lc));
    setStaff(sc == null || sc === '' ? '' : String(sc));
    setTesting(tc == null || tc === '' ? '' : String(tc));
    setBasis(readBasis(row));
    setMonths(readStaffMonthlyPattern(row));
    setLocalError(null);
    // `rowHydrateKey` only (not `row`) so we do not reset while typing when the parent re-renders with a new row reference.
  }, [rowHydrateKey]);

  const handleMonth = useCallback((m: StaffMonthKey, v: string) => {
    setMonths((prev) => ({ ...prev, [m]: v }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const v = fragmentVersion(row);
    if (!Number.isFinite(v)) {
      setLocalError('This row has no version number; reload and try again.');
      return;
    }
    setLocalError(null);

    const parseOptInt = (s: string, label: string): number | null => {
      const t = s.trim();
      if (!t) return null;
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n)) throw new Error(`${label} must be a whole number`);
      return n;
    };

    let labsCap: number | null;
    let staffCap: number | null;
    let testCap: number | null;
    try {
      labsCap = parseOptInt(labs, 'Labs capacity');
      staffCap = parseOptInt(staff, 'Staff capacity');
      testCap = parseOptInt(testing, 'Testing capacity');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
      return;
    }

    const pattern: Record<string, number> = {};
    for (const m of STAFF_MONTHLY_KEYS) {
      const t = months[m].trim();
      if (t === '') continue;
      const n = Number.parseFloat(t);
      if (!Number.isFinite(n)) {
        setLocalError(`Staff monthly ${m} must be a number`);
        return;
      }
      pattern[m] = n;
    }

    const basisVal = basis === 'absolute' || basis === 'multiplier' ? basis : null;

    const updates: Record<string, unknown> = {
      labs_capacity: labsCap,
      staff_capacity: staffCap,
      testing_capacity: testCap,
      staff_monthly_pattern_basis: basisVal,
      staff_monthly_pattern: Object.keys(pattern).length > 0 ? pattern : null,
    };

    try {
      await onPersist(row, updates);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }, [row, labs, staff, testing, basis, months, onPersist]);

  if (!row) {
    return (
      <section className="mb-6 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No resource configuration row yet. Import market YAML or create a fragment, then refresh.
      </section>
    );
  }

  const rowSaving = saving === String(row.id);

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="admin-resource-config-title"
    >
      <div className="mb-4">
        <h2 id="admin-resource-config-title" className="text-base font-semibold">
          Resources (YAML parity)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edits <span className="font-mono text-xs">resources.labs.capacity</span>,{' '}
          <span className="font-mono text-xs">resources.staff</span> (capacity,{' '}
          <span className="font-mono text-xs">monthly_pattern_basis</span>,{' '}
          <span className="font-mono text-xs">monthly_pattern</span>), and{' '}
          <span className="font-mono text-xs">testing_capacity</span>. Build &amp; publish to refresh the artifact.
        </p>
      </div>

      {localError ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="res-labs">Labs capacity</Label>
            <input
              id="res-labs"
              type="number"
              min={0}
              step={1}
              value={labs}
              onChange={(e) => setLabs(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-staff">Staff capacity</Label>
            <input
              id="res-staff"
              type="number"
              min={0}
              step={1}
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-testing">Testing capacity</Label>
            <input
              id="res-testing"
              type="number"
              min={0}
              step={1}
              value={testing}
              onChange={(e) => setTesting(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={rowSaving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="res-basis">Staff monthly_pattern_basis</Label>
          <select
            id="res-basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            className="max-w-md w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={rowSaving}
          >
            <option value="">— (not set)</option>
            <option value="absolute">absolute (headcount per month)</option>
            <option value="multiplier">multiplier (vs baseline staff capacity)</option>
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">Staff monthly_pattern (Jan–Dec)</p>
          <p className="text-xs text-muted-foreground">Leave a month empty to omit it from the saved object (same as skipping a key in YAML).</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {STAFF_MONTHLY_KEYS.map((m) => (
              <div key={m} className="space-y-1">
                <Label htmlFor={`res-mo-${m}`} className="text-xs text-muted-foreground">
                  {m}
                </Label>
                <input
                  id={`res-mo-${m}`}
                  type="text"
                  inputMode="decimal"
                  value={months[m]}
                  onChange={(e) => handleMonth(m, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                  placeholder="—"
                  disabled={rowSaving}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={rowSaving}>
            {rowSaving ? 'Saving…' : 'Save resources'}
          </Button>
          <span className="text-xs text-muted-foreground">v{String(row.version_number ?? '')}</span>
        </div>
      </div>
    </section>
  );
}
