import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OneDriveAuthProvider } from './contexts/OneDriveAuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import ProjectMonitoringApp from './components/ProjectMonitoringApp';
import ProjectLocationDashboard from './components/ProjectLocationDashboard';
import ExpenseMonitoring from './components/ExpenseMonitoring';
import LiquidationFormPage from './components/LiquidationFormPage';
import CAFormPage from './components/CAFormPage';
import ClientsPage from './components/ClientsPage';
import MaterialRequestFormPage from './components/MaterialRequestFormPage';
import DeliveryPage from './components/DeliveryPage';
import SuppliersPage from './components/SuppliersPage';
import PurchaseOrderPage from './components/PurchaseOrderPage';
import EstimatesPage from './components/EstimatesPage';
import ReportsPage from './components/ReportsPage';
import UtilitiesPage from './components/UtilitiesPage';
import EHSPage from './components/EHSPage';
import IDGeneratorPage from './components/IDGeneratorPage';
import AcknowledgementReceiptPage from './components/AcknowledgementReceiptPage';
import DirectLaborPage from './components/DirectLaborPage';
import UserApprovalsPage from './components/UserApprovalsPage';
import UsersPage from './components/UsersPage';
import InvestmentTrackerPage from './components/InvestmentTrackerPage';
import CollectionsDashboard from './components/CollectionsDashboard';
import PayrollDashboard from './components/payroll/PayrollDashboard';
import PayrollGuard from './components/payroll/PayrollGuard';
import FinanceHomePage from './components/finance/FinanceHomePage';
import ReimbursementDashboard from './components/ReimbursementDashboard';
import ProjectExpenseReport from './components/finance/ProjectExpenseReport';
import OverheadExpensesPage from './components/OverheadExpensesPage';
import CompanyPnLPage from './components/finance/CompanyPnLPage';
import TaxFilerLedgerPage from './components/finance/TaxFilerLedgerPage';
import SalesHomePage from './components/sales/SalesHomePage';
import EmployeePortalHome from './components/employee/EmployeePortalHome';
import DTRPage from './components/employee/DTRPage';
import ClockPage from './components/employee/ClockPage';
import EmployeePayslipPage from './components/employee/EmployeePayslipPage';
import EmployeeServiceReportPage from './components/employee/EmployeeServiceReportPage';
import CalcsheetProjects from './components/calcsheet/CalcsheetProjects';
import CalcsheetLegacyImport from './components/calcsheet/CalcsheetLegacyImport';
import CalcsheetProjectDetail from './components/calcsheet/CalcsheetProjectDetail';
import CalcsheetQuotationEditor from './components/calcsheet/CalcsheetQuotationEditor';
import CalcsheetCompareView from './components/calcsheet/CalcsheetCompareView';
import CalcsheetClients from './components/calcsheet/CalcsheetClients';
import CalcsheetPresets from './components/calcsheet/CalcsheetPresets';
import PricelistBrowser from './components/pricelists/PricelistBrowser';
import ScanPage from './components/ScanPage';
import { useQuotationStore } from './store/quotationStore';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2c5aa0',
      light: '#4f7bc8',
      dark: '#1a3f72',
    },
    secondary: {
      main: '#1e4a72', // Darker blue complement
      light: '#3c6ba5',
      dark: '#0f2e4f',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.005em',
    },
    h6: {
      fontWeight: 500,
      letterSpacing: '-0.005em',
    },
    body1: {
      fontWeight: 400,
      letterSpacing: '-0.003em',
    },
    body2: {
      fontWeight: 400,
      letterSpacing: '-0.003em',
    },
    button: {
      fontWeight: 500,
      letterSpacing: '-0.003em',
      textTransform: 'none', // Apple doesn't use all caps for buttons
    },
    caption: {
      fontWeight: 400,
      letterSpacing: '0em',
    },
    overline: {
      fontWeight: 500,
      letterSpacing: '0.05em',
    },
  },
});

// Hydrates the Calcsheet store from the API once on mount
const CalcsheetInit: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const init = useQuotationStore((s) => s.init);
  React.useEffect(() => { init(); }, [init]);
  return <>{children}</>;
};

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </Box>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Superadmin-only route: redirect to dashboard if not superadmin (use inside ProtectedRoute)
const SuperadminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Employee guard: redirect user/viewer roles to the employee portal
const EmployeeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user && (user.role === 'user' || user.role === 'viewer')) {
    return <Navigate to="/employee" replace />;
  }
  return <>{children}</>;
};

// Tax Filer block: tax_filer role cannot reach payroll / liquidation / cash-advance surfaces; send them to their ledger
const TaxFilerBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === 'tax_filer') {
    return <Navigate to="/finance/tax-ledger" replace />;
  }
  return <>{children}</>;
};

// Redirect legacy /ehs and /ehs/:tab to /utilities/ehs and /utilities/ehs/:tab
const RedirectEhsToUtilities: React.FC = () => {
  const { tab } = useParams<{ tab?: string }>();
  const to = tab ? `/utilities/ehs/${tab}` : '/utilities/ehs';
  return <Navigate to={to} replace />;
};

// Redirect preserving the query string (e.g. /collections?project_id=X → /finance/collections?project_id=X)
const RedirectWithSearch: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

// Redirect any /calcsheet/* URL into the Sales workspace, preserving
// dynamic segments, query string, and hash (RedirectWithSearch only keeps search).
const RedirectCalcsheet: React.FC = () => {
  const location = useLocation();
  const to = location.pathname.replace(/^\/calcsheet/, '/sales/calcsheet') + location.search + location.hash;
  return <Navigate to={to} replace />;
};

// Main App Layout component
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <Sidebar />
        <Box sx={{ 
          flexGrow: 1,
          minWidth: 0,
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 80px)',
          p: 2
        }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

function App() {
  return (
    <AuthProvider>
      <OneDriveAuthProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <ProjectMonitoringApp />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route 
              path="/location-analysis" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectLocationDashboard />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/expense-monitoring" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ExpenseMonitoring />
                  </AppLayout>
                </ProtectedRoute>
              } 
            >
              <Route
                path="liquidation-form"
                element={<TaxFilerBlock><LiquidationFormPage /></TaxFilerBlock>}
              />
              <Route
                path="ca-form"
                element={<TaxFilerBlock><CAFormPage /></TaxFilerBlock>}
              />
              <Route
                path="direct-labor"
                element={<DirectLaborPage />}
              />
            </Route>
            <Route
              path="/clients" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ClientsPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/material-request" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <MaterialRequestFormPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route path="/order-tracker" element={<Navigate to="/material-request?tab=orders" replace />} />
            <Route 
              path="/delivery" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DeliveryPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/suppliers" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <SuppliersPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/purchase-order" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <PurchaseOrderPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/estimates" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <EstimatesPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route
              path="/reports/:tab?"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <ReportsPage />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route path="/ehs" element={<Navigate to="/utilities/ehs" replace />} />
            <Route path="/ehs/:tab" element={<RedirectEhsToUtilities />} />
            <Route 
              path="/utilities" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <UtilitiesPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            >
              <Route index element={<Navigate to="/utilities/ehs" replace />} />
              <Route path="ehs/:tab?" element={<EHSPage />} />
              <Route path="id-generator" element={<IDGeneratorPage />} />
              <Route path="acknowledgement-receipt" element={<AcknowledgementReceiptPage />} />
            </Route>
            <Route path="/id-generator" element={<Navigate to="/utilities/id-generator" replace />} />
            <Route 
              path="/user-approvals" 
              element={
                <ProtectedRoute>
                  <SuperadminRoute>
                    <AppLayout>
                      <UserApprovalsPage />
                    </AppLayout>
                  </SuperadminRoute>
                </ProtectedRoute>
              } 
            />
            <Route
              path="/users"
              element={<Navigate to="/settings/users" replace />}
            />
            <Route
              path="/settings"
              element={<Navigate to="/settings/users" replace />}
            />
            <Route
              path="/settings/users"
              element={
                <ProtectedRoute>
                  <SuperadminRoute>
                    <AppLayout>
                      <UsersPage />
                    </AppLayout>
                  </SuperadminRoute>
                </ProtectedRoute>
              }
            />
            {/* ===== FINANCE WORKSPACE ===== */}
            {/* Legacy finance paths redirect into the workspace, preserving query strings */}
            <Route path="/investment-tracker" element={<RedirectWithSearch to="/finance/investment-tracker" />} />
            <Route path="/payroll" element={<RedirectWithSearch to="/finance/payroll" />} />
            <Route path="/collections" element={<RedirectWithSearch to="/finance/collections" />} />
            <Route
              path="/finance"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <FinanceHomePage />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/collections"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <CollectionsDashboard />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/investment-tracker"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <TaxFilerBlock>
                        <InvestmentTrackerPage />
                      </TaxFilerBlock>
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/payroll"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <TaxFilerBlock>
                        <PayrollGuard>
                          <PayrollDashboard />
                        </PayrollGuard>
                      </TaxFilerBlock>
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            {/* Parallel mount of Expense Monitoring inside the Finance workspace (same components, same data) */}
            <Route
              path="/finance/expense-monitoring"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <ExpenseMonitoring />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            >
              <Route
                path="liquidation-form"
                element={<TaxFilerBlock><LiquidationFormPage /></TaxFilerBlock>}
              />
              <Route
                path="ca-form"
                element={<TaxFilerBlock><CAFormPage /></TaxFilerBlock>}
              />
              <Route
                path="direct-labor"
                element={<DirectLaborPage />}
              />
            </Route>
            <Route
              path="/finance/reimbursements"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <TaxFilerBlock>
                        <ReimbursementDashboard />
                      </TaxFilerBlock>
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/projects/:projectId/expenses"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <ProjectExpenseReport />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/overhead-expenses"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <OverheadExpensesPage />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/pnl"
              element={
                <ProtectedRoute>
                  <SuperadminRoute>
                    <AppLayout>
                      <CompanyPnLPage />
                    </AppLayout>
                  </SuperadminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/tax-ledger"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <TaxFilerLedgerPage />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            {/* ===== SALES WORKSPACE ===== */}
            {/* Legacy calcsheet paths redirect into the workspace, preserving params, query, and hash */}
            <Route path="/calcsheet/*" element={<RedirectCalcsheet />} />
            <Route path="/calcsheet" element={<RedirectCalcsheet />} />
            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <CalcsheetInit>
                        <SalesHomePage />
                      </CalcsheetInit>
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <Navigate to="/sales/calcsheet/projects" replace />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/projects"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetProjects />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/import-legacy"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetLegacyImport />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/projects/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetProjectDetail />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/projects/:id/compare"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetCompareView />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/quotations/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetQuotationEditor />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/clients"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetClients />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/presets"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetPresets />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/pricelists"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <PricelistBrowser />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            {/* Parallel mounts of Clients + Supply Chain inside the Sales workspace (same components, same data) */}
            <Route
              path="/sales/clients"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ClientsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/material-request"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <MaterialRequestFormPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/delivery"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DeliveryPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/suppliers"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <SuppliersPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/purchase-order"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <PurchaseOrderPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/estimates"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <EstimatesPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* ===== EMPLOYEE PORTAL ===== */}
            <Route
              path="/employee"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <EmployeePortalHome />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/dtr"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DTRPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/liquidation-form"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TaxFilerBlock>
                      <LiquidationFormPage />
                    </TaxFilerBlock>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/service-report"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <EmployeeServiceReportPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/payslips"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TaxFilerBlock>
                      <EmployeePayslipPage />
                    </TaxFilerBlock>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/clock"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ClockPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/dashboard" replace />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </ThemeProvider>
      </OneDriveAuthProvider>
    </AuthProvider>
  );
}

export default App;
