// After client consolidation (Phase 2.5), the calcsheet-specific Clients page is gone.
// /sales/calcsheet/clients redirects to the unified clients page (Sales-workspace mount).
import { Navigate } from 'react-router-dom';

export default function CalcsheetClients() {
  return <Navigate to="/sales/clients" replace />;
}
