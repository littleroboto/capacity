import { Link, matchPath, Outlet, useLocation } from 'react-router-dom';
import { AdminMarketEntitySidebar } from '@/pages/admin/AdminMarketEntitySidebar';

export function AdminLayout() {
  const { pathname } = useLocation();
  const marketMatch = matchPath({ path: '/admin/market/:id/:entity', end: true }, pathname);
  const marketId = marketMatch?.params.id;

  return (
    <div className="admin-studio min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3">
          <Link to="/admin" className="text-lg font-semibold tracking-tight hover:underline">
            Market configuration
          </Link>
          <Link to="/app" className="text-sm text-muted-foreground hover:underline">
            ← Back to workbench
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        {marketId ? (
          <aside className="sticky top-0 hidden h-[calc(100vh-57px)] w-56 shrink-0 overflow-y-auto border-r border-border bg-muted/20 py-4 lg:block">
            <AdminMarketEntitySidebar marketId={marketId} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

