import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import ProjectMonitoringApp from './components/ProjectMonitoringApp';
import ProjectLocationDashboard from './components/ProjectLocationDashboard';
import ExpenseMonitoring from './components/ExpenseMonitoring';
import Forecasting from './components/Forecasting';
import ClientsPage from './components/ClientsPage';
import MaterialRequestFormPage from './components/MaterialRequestFormPage';
import OrderTrackerPage from './components/OrderTrackerPage';
import DeliveryPage from './components/DeliveryPage';
import SuppliersPage from './components/SuppliersPage';
import PurchaseOrderPage from './components/PurchaseOrderPage';

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
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectMonitoringApp />
                  </AppLayout>
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
            />
            <Route 
              path="/forecasting" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Forecasting />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
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
            <Route 
              path="/order-tracker" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <OrderTrackerPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
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
    </AuthProvider>
  );
}

export default App;
