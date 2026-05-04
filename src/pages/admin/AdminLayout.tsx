import { Link, Outlet } from 'react-router-dom';

export function AdminLayout() {
  return (
    <div className="admin-studio min-h-screen bg-background">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/admin" className="text-lg font-semibold tracking-tight hover:underline">
            Market configuration
          </Link>
          <Link to="/app" className="text-sm text-muted-foreground hover:underline">
            ← Back to workbench
          </Link>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
