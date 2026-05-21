// After client consolidation (Phase 2.5), the calcsheet-specific Clients page is gone.
// /calcsheet/clients redirects to the unified /clients page.
import { Navigate } from 'react-router-dom';

export default function CalcsheetClients() {
  return <Navigate to="/clients" replace />;
}
