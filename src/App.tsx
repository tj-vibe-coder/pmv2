import React, { Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OneDriveAuthProvider } from './contexts/OneDriveAuthContext';
import AiAssistHost from './components/ai/AiAssistHost';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import { canOpenProjectMonitoring, isStaffRole } from './utils/projectMonitoringAccess';
import PayrollGuard from './components/payroll/PayrollGuard';
import EmployeePortalHome from './components/employee/EmployeePortalHome';
import DTRPage from './components/employee/DTRPage';
import ClockPage from './components/employee/ClockPage';
import { useQuotationStore } from './store/quotationStore';
import { lazyWithRetry } from './utils/lazyWithRetry';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { saveLastPage, getLastPage } from './utils/lastPage';

// Pages are downloaded when first opened, not all up front — a phone no longer has to fetch the whole app
// before showing the first screen. Kept in the main bundle on purpose: the login page, the layout, and the
// employee home / DTR / clock pages (field crews open those offline; the service worker only has what was
// already downloaded). See src/utils/lazyWithRetry.ts for the after-a-deploy safety net.
const AiAssistPage = lazyWithRetry(() => import('./components/ai/AiAssistPage'));
const AnalyticsStudioPage = lazyWithRetry(() => import('./components/analytics/AnalyticsStudioPage'));
const ProjectActivityPage = lazyWithRetry(() => import('./components/ProjectActivityPage'));
const ProjectMonitoringApp = lazyWithRetry(() => import('./components/ProjectMonitoringApp'));
const ProjectLocationDashboard = lazyWithRetry(() => import('./components/ProjectLocationDashboard'));
const ExpenseMonitoring = lazyWithRetry(() => import('./components/ExpenseMonitoring'));
const LiquidationFormPage = lazyWithRetry(() => import('./components/LiquidationFormPage'));
const CAFormPage = lazyWithRetry(() => import('./components/CAFormPage'));
const ClientsPage = lazyWithRetry(() => import('./components/ClientsPage'));
const MaterialRequestFormPage = lazyWithRetry(() => import('./components/MaterialRequestFormPage'));
const DeliveryPage = lazyWithRetry(() => import('./components/DeliveryPage'));
const SuppliersPage = lazyWithRetry(() => import('./components/SuppliersPage'));
const PurchaseOrderPage = lazyWithRetry(() => import('./components/PurchaseOrderPage'));
const EstimatesPage = lazyWithRetry(() => import('./components/EstimatesPage'));
const ReportsPage = lazyWithRetry(() => import('./components/ReportsPage'));
const UtilitiesPage = lazyWithRetry(() => import('./components/UtilitiesPage'));
const EHSPage = lazyWithRetry(() => import('./components/EHSPage'));
const IDGeneratorPage = lazyWithRetry(() => import('./components/IDGeneratorPage'));
const AcknowledgementReceiptPage = lazyWithRetry(() => import('./components/AcknowledgementReceiptPage'));
const SystemBackupsPage = lazyWithRetry(() => import('./components/SystemBackupsPage'));
const DirectLaborPage = lazyWithRetry(() => import('./components/DirectLaborPage'));
const UserApprovalsPage = lazyWithRetry(() => import('./components/UserApprovalsPage'));
const UsersPage = lazyWithRetry(() => import('./components/UsersPage'));
const InvestmentTrackerPage = lazyWithRetry(() => import('./components/InvestmentTrackerPage'));
const CollectionsDashboard = lazyWithRetry(() => import('./components/CollectionsDashboard'));
const PayrollDashboard = lazyWithRetry(() => import('./components/payroll/PayrollDashboard'));
const FinanceHomePage = lazyWithRetry(() => import('./components/finance/FinanceHomePage'));
const ReimbursementDashboard = lazyWithRetry(() => import('./components/ReimbursementDashboard'));
const ReceiptSearchPage = lazyWithRetry(() => import('./components/finance/ReceiptSearchPage'));
const ProjectExpenseReport = lazyWithRetry(() => import('./components/finance/ProjectExpenseReport'));
const OverheadExpensesPage = lazyWithRetry(() => import('./components/OverheadExpensesPage'));
const CompanyPnLPage = lazyWithRetry(() => import('./components/finance/CompanyPnLPage'));
const TaxFilerLedgerPage = lazyWithRetry(() => import('./components/finance/TaxFilerLedgerPage'));
const SalesEwtRegisterPage = lazyWithRetry(() => import('./components/finance/SalesEwtRegisterPage'));
const SoaDashboardPage = lazyWithRetry(() => import('./components/finance/soa/SoaDashboardPage'));
const BlsPage = lazyWithRetry(() => import('./components/finance/bls/BlsPage'));
const SoaDetailView = lazyWithRetry(() => import('./components/finance/soa/SoaDetailView'));
const SalesHomePage = lazyWithRetry(() => import('./components/sales/SalesHomePage'));
const EmployeePayslipPage = lazyWithRetry(() => import('./components/employee/EmployeePayslipPage'));
const EmployeeServiceReportPage = lazyWithRetry(() => import('./components/employee/EmployeeServiceReportPage'));
const CalcsheetProjects = lazyWithRetry(() => import('./components/calcsheet/CalcsheetProjects'));
const CalcsheetLegacyImport = lazyWithRetry(() => import('./components/calcsheet/CalcsheetLegacyImport'));
const CalcsheetProjectDetail = lazyWithRetry(() => import('./components/calcsheet/CalcsheetProjectDetail'));
const CalcsheetQuotationEditor = lazyWithRetry(() => import('./components/calcsheet/CalcsheetQuotationEditor'));
const CalcsheetCompareView = lazyWithRetry(() => import('./components/calcsheet/CalcsheetCompareView'));
const CalcsheetProjectSchedule = lazyWithRetry(() => import('./components/calcsheet/CalcsheetProjectSchedule'));
const ProjectSchedulePage = lazyWithRetry(() => import('./components/ProjectSchedulePage'));
const CalcsheetClients = lazyWithRetry(() => import('./components/calcsheet/CalcsheetClients'));
const CalcsheetPresets = lazyWithRetry(() => import('./components/calcsheet/CalcsheetPresets'));
const PricelistBrowser = lazyWithRetry(() => import('./components/pricelists/PricelistBrowser'));
const ScanPage = lazyWithRetry(() => import('./components/ScanPage'));

// Phones (below MUI's sm breakpoint). Used by the theme-wide mobile overrides below.
const PHONE = '@media (max-width:599.95px)';

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
      [PHONE]: { fontSize: '1.6rem' },
    },
    h4: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
      [PHONE]: { fontSize: '1.6rem' },
    },
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.005em',
      [PHONE]: { fontSize: '1.25rem' },
    },
    h6: {
      fontWeight: 500,
      letterSpacing: '-0.005em',
      [PHONE]: { fontSize: '1.05rem' },
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
  // Mobile: tab bars scroll instead of clipping, dialogs keep a small margin,
  // tables and pagination get tighter padding so more fits on a phone.
  components: {
    MuiTabs: {
      defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { [PHONE]: { margin: 8, width: 'calc(100% - 16px)', maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)' } },
        paperFullScreen: { [PHONE]: { margin: 0, width: '100%', maxWidth: '100%', maxHeight: '100%' } },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { [PHONE]: { padding: '12px 16px' } } } },
    MuiDialogContent: { styleOverrides: { root: { [PHONE]: { paddingLeft: 16, paddingRight: 16 } } } },
    MuiDialogActions: { styleOverrides: { root: { [PHONE]: { flexWrap: 'wrap', gap: 8, padding: '8px 16px 12px' } } } },
    MuiTableCell: {
      styleOverrides: {
        root: { [PHONE]: { '&:not(.MuiTableCell-paddingCheckbox):not(.MuiTableCell-paddingNone)': { padding: '6px 8px' } } },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: { [PHONE]: { flexWrap: 'wrap', justifyContent: 'flex-end', paddingLeft: 8, paddingRight: 8 } },
        spacer: { [PHONE]: { display: 'none' } },
        actions: { [PHONE]: { marginLeft: 8 } },
      },
    },
  },
});

// Hydrates the Calcsheet store from the API once on mount
const CalcsheetInit: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const init = useQuotationStore((s) => s.init);
  const { user } = useAuth();
  React.useEffect(() => {
    if (user?.role !== 'tax_filer') {
      init();
    }
  }, [init, user?.role]);
  if (user?.role === 'tax_filer') {
    return <Navigate to="/finance/tax-ledger" replace />;
  }
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

// Admin & Superadmin route: redirect to dashboard if neither admin nor superadmin
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role !== 'superadmin' && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Employee guard: redirect user/viewer roles to the employee portal. With
// allowProjectMonitoring, staff ticked for Project Monitoring may stay.
const EmployeeGuard: React.FC<{ children: React.ReactNode; allowProjectMonitoring?: boolean }> = ({ children, allowProjectMonitoring }) => {
  const { user } = useAuth();
  if (user && isStaffRole(user) && !(allowProjectMonitoring && canOpenProjectMonitoring(user))) {
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

// Records the current route to localStorage on every navigation so the app
// can resume here next time (root "/" and post-login land on it instead of
// always defaulting to the Dashboard). Renders nothing.
const LastPageTracker: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  React.useEffect(() => {
    if (!isAuthenticated) return;
    saveLastPage(location.pathname + location.search + location.hash);
  }, [isAuthenticated, location.pathname, location.search, location.hash]);
  return null;
};

// Root "/" lands on whatever page the user last had open, falling back to
// the role default when nothing is saved yet (first visit, or after logout).
const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  const defaultPage = (user?.role === 'user' || user?.role === 'viewer')
    ? '/employee'
    : (user?.role === 'tax_filer' ? '/finance/tax-ledger' : '/dashboard');
  return <Navigate to={getLastPage() ?? defaultPage} replace />;
};

// Shown in place of a page while its code downloads.
const PageLoading: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }} role="status" aria-label="Loading page">
    <CircularProgress />
  </Box>
);

// Wraps every route (including ones outside AppLayout, like /scan) so a page that fails to download or crashes
// shows a "Reload" message instead of a blank screen, and the error clears when you navigate.
const RoutesShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', '@supports (height: 100dvh)': { minHeight: '100dvh' } }}>
      <Header onMenuClick={() => setMobileNavOpen((o) => !o)} />
      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <Box sx={{
          flexGrow: 1,
          minWidth: 0,
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 80px)',
          '@supports (height: 100dvh)': { minHeight: 'calc(100dvh - 80px)' },
          '@media (max-height: 600px)': { minHeight: 'calc(100vh - 56px)' },
          p: { xs: 1, md: 2 },
          pl: { xs: 'calc(8px + env(safe-area-inset-left))', md: 2 },
          pr: { xs: 'calc(8px + env(safe-area-inset-right))', md: 'calc(16px + env(safe-area-inset-right))' },
          pb: { xs: 'calc(8px + env(safe-area-inset-bottom))', md: 2 }
        }}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoading />}>{children}</Suspense>
          </RouteErrorBoundary>
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
          <LastPageTracker />
          <AiAssistHost>
          <RoutesShell>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route
              path="/assist"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <AiAssistPage />
                    </AppLayout>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route path="/analytics" element={<Navigate to="/projects/analytics" replace />} />
            <Route path="/analytics/studio" element={<Navigate to="/projects/analytics" replace />} />
            <Route path="/analytics/projects" element={<Navigate to="/projects/analytics" replace />} />
            <Route path="/analytics/sales" element={<Navigate to="/sales/analytics" replace />} />
            <Route path="/analytics/finance" element={<Navigate to="/finance/analytics" replace />} />
            <Route
              path="/projects/analytics"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <AnalyticsStudioPage domainScope="projects" />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/activity"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ProjectActivityPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/analytics"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <AnalyticsStudioPage domainScope="sales" />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/analytics"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <AnalyticsStudioPage domainScope="finance" />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <EmployeeGuard allowProjectMonitoring>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ProjectMonitoringApp />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <EmployeeGuard allowProjectMonitoring>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ProjectMonitoringApp />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route 
              path="/location-analysis" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <ProjectLocationDashboard />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/expense-monitoring" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <ExpenseMonitoring />
                    </AppLayout>
                  </TaxFilerBlock>
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
                  <TaxFilerBlock>
                    <AppLayout>
                      <ClientsPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/material-request" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <MaterialRequestFormPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route path="/order-tracker" element={<Navigate to="/material-request?tab=orders" replace />} />
            <Route 
              path="/delivery" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <DeliveryPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/suppliers" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <SuppliersPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/purchase-order" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <PurchaseOrderPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/estimates" 
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <EstimatesPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              } 
            />
            <Route
              path="/reports/:tab?"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ReportsPage />
                      </AppLayout>
                    </TaxFilerBlock>
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
              <Route path="backups" element={<AdminRoute><SystemBackupsPage /></AdminRoute>} />
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
            <Route path="/soa" element={<RedirectWithSearch to="/finance/soa" />} />
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
              path="/finance/soa"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <SoaDashboardPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/bls"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <BlsPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/soa/:id"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <SoaDetailView />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/investment-tracker"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <InvestmentTrackerPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/payroll"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <PayrollGuard>
                        <AppLayout>
                          <PayrollDashboard />
                        </AppLayout>
                      </PayrollGuard>
                    </TaxFilerBlock>
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
                    <TaxFilerBlock>
                      <AppLayout>
                        <ExpenseMonitoring />
                      </AppLayout>
                    </TaxFilerBlock>
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
              path="/finance/receipt-search"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ReceiptSearchPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/reimbursements"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ReimbursementDashboard />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/projects/:projectId/expenses"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <ProjectExpenseReport />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/purchase-order"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <PurchaseOrderPage />
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/overhead-expenses"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <TaxFilerBlock>
                      <AppLayout>
                        <OverheadExpensesPage />
                      </AppLayout>
                    </TaxFilerBlock>
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
            <Route
              path="/finance/ewt-2307"
              element={
                <ProtectedRoute>
                  <EmployeeGuard>
                    <AppLayout>
                      <SalesEwtRegisterPage />
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
                    <TaxFilerBlock>
                      <AppLayout>
                        <CalcsheetInit>
                          <SalesHomePage />
                        </CalcsheetInit>
                      </AppLayout>
                    </TaxFilerBlock>
                  </EmployeeGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <CalcsheetInit>
                        <Navigate to="/sales/calcsheet/projects" replace />
                      </CalcsheetInit>
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/calcsheet/projects"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <CalcsheetInit>
                        <CalcsheetProjects />
                      </CalcsheetInit>
                    </AppLayout>
                  </TaxFilerBlock>
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
              path="/sales/calcsheet/projects/:id/schedule"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CalcsheetInit>
                      <CalcsheetProjectSchedule />
                    </CalcsheetInit>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id/schedule"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectSchedulePage />
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
                  <TaxFilerBlock>
                    <AppLayout>
                      <PricelistBrowser />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            {/* Parallel mounts of Clients + Supply Chain inside the Sales workspace (same components, same data) */}
            <Route
              path="/sales/clients"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <ClientsPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/material-request"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <MaterialRequestFormPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/delivery"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <DeliveryPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/suppliers"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <SuppliersPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/purchase-order"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <PurchaseOrderPage />
                    </AppLayout>
                  </TaxFilerBlock>
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/estimates"
              element={
                <ProtectedRoute>
                  <TaxFilerBlock>
                    <AppLayout>
                      <EstimatesPage />
                    </AppLayout>
                  </TaxFilerBlock>
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
              path="/employee/ca-form"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TaxFilerBlock>
                      <CAFormPage />
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
                  <RootRedirect />
                </ProtectedRoute>
              }
            />
          </Routes>
          </RoutesShell>
          </AiAssistHost>
        </Router>
      </ThemeProvider>
      </OneDriveAuthProvider>
    </AuthProvider>
  );
}

export default App;
