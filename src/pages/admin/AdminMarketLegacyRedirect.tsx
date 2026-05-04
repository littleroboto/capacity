import { Navigate, useParams } from 'react-router-dom';
import { adminMarketEntityPath, DEFAULT_ADMIN_MARKET_ENTITY } from '@/pages/admin/adminMarketTabs';

/** `/admin/market/:id` → canonical `/admin/market/:id/campaigns` */
export function AdminMarketLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/admin" replace />;
  return <Navigate to={adminMarketEntityPath(id, DEFAULT_ADMIN_MARKET_ENTITY)} replace />;
}
