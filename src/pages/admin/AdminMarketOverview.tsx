import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMarkets } from '@/lib/adminApi';
import { AdminHolidayEntryCreate } from '@/pages/admin/AdminHolidayEntryCreate';
import { AdminMarketsDataTable, AdminMarketsTableSkeleton, type AdminMarketRow } from '@/pages/admin/AdminMarketsDataTable';

export function AdminMarketOverview() {
  const [markets, setMarkets] = useState<AdminMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarkets()
      .then((rows) => setMarkets(rows as AdminMarketRow[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Market Configuration</h1>
          <Link to="/app" className="text-sm text-muted-foreground hover:underline">
            ← Back to Workbench
          </Link>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          If this mentions <span className="font-mono text-foreground/80">no_market_scope</span>, your Clerk account
          needs a matching row in Supabase <span className="font-mono text-foreground/80">user_access_scopes</span>{' '}
          (see repo script <span className="font-mono text-foreground/80">pnpm admin:ensure-scope you@email.com</span>
          ).
        </p>
      </div>
    );
  }

  const emptyDb = !loading && markets.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Market Configuration</h1>
        <Link to="/app" className="text-sm text-muted-foreground hover:underline">
          ← Back to Workbench
        </Link>
      </div>

      {emptyDb ? (
        <div className="rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No markets in the database (or none marked active).</p>
          <ul className="mt-3 list-inside list-disc space-y-1">
            <li>
              Apply Supabase migrations from <span className="font-mono text-foreground/80">supabase/migrations/</span>{' '}
              (they seed <span className="font-mono text-foreground/80">markets</span> rows).
            </li>
            <li>
              If the API list is empty but you expected rows: confirm you are pointed at the same Supabase project as{' '}
              <span className="font-mono text-foreground/80">SUPABASE_URL</span> in this environment.
            </li>
          </ul>
        </div>
      ) : null}

      {loading ? (
        <AdminMarketsTableSkeleton />
      ) : !emptyDb ? (
        <div className="space-y-8">
          <AdminHolidayEntryCreate markets={markets} />
          <AdminMarketsDataTable data={markets} />
        </div>
      ) : null}
    </div>
  );
}
