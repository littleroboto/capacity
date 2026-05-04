import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ADMIN_MARKET_ENTITY_TABS, adminMarketEntityPath } from '@/pages/admin/adminMarketTabs';

export function AdminMarketEntitySidebar({ marketId }: { marketId: string }) {
  return (
    <nav className="flex flex-col gap-0.5 px-2 pb-4" aria-label="Market configuration sections">
      <p className="mb-2 truncate px-2 font-mono text-xs font-semibold text-foreground" title={marketId}>
        {marketId}
      </p>
      <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Sections
      </p>
      {ADMIN_MARKET_ENTITY_TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={adminMarketEntityPath(marketId, tab.key)}
          end
          className={({ isActive }) =>
            cn(
              'rounded-md px-2 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-primary/12 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
