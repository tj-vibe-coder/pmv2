import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  useTheme,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  AccountBalanceWallet as ReceiptIcon,
  People as ClientsIcon,
  Assignment as MaterialRequestIcon,
  ReceiptLong as DeliveryIcon,
  Storefront as SuppliersIcon,
  ShoppingCart as PurchaseOrderIcon,
  Inventory2 as SupplyChainIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Description as ReportsIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Cloud as CloudIcon,
  RequestQuote as EstimateIcon,
  Calculate as CalculateIcon,
  HowToReg as HowToRegIcon,
  AccountBalance as AccountBalanceIcon,
  Badge as BadgeIcon,
  Build as BuildIcon,
  TrendingUp as TrendingUpIcon,
  Payments as PaymentsIcon,
  Paid as PaidIcon,
} from '@mui/icons-material';
import { isPayrollAuthorized } from '../config/payrollAccess';

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 68;

const SUPPLY_CHAIN_PATHS = ['/material-request', '/delivery', '/suppliers', '/purchase-order', '/estimates'];
const EXPENSE_MONITORING_PATHS = ['/expense-monitoring', '/expense-monitoring/ca-form', '/expense-monitoring/liquidation-form', '/expense-monitoring/direct-labor', '/investment-tracker', '/payroll'];
const REPORTS_PATHS = ['/reports/progress', '/reports/service', '/reports/completion', '/reports/attachments'];
const UTILITIES_PATHS = ['/utilities', '/utilities/ehs', '/utilities/ehs/safety-certificate', '/utilities/ehs/safety-manual', '/utilities/ehs/osh-program', '/utilities/id-generator', '/utilities/acknowledgement-receipt'];

const Sidebar: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [supplyChainOpen, setSupplyChainOpen] = useState(() =>
    SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)
  );
  const [reportsOpen, setReportsOpen] = useState(() =>
    REPORTS_PATHS.some((p) => location.pathname.startsWith(p))
  );
  const [expenseMonitoringOpen, setExpenseMonitoringOpen] = useState(() =>
    EXPENSE_MONITORING_PATHS.some((p) => location.pathname === p)
  );
  const [utilitiesOpen, setUtilitiesOpen] = useState(() =>
    UTILITIES_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p))
  );

  useEffect(() => {
    if (SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)) {
      setSupplyChainOpen(true);
    }
    if (REPORTS_PATHS.some((p) => location.pathname.startsWith(p))) {
      setReportsOpen(true);
    }
    if (EXPENSE_MONITORING_PATHS.some((p) => location.pathname === p)) {
      setExpenseMonitoringOpen(true);
    }
    if (UTILITIES_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p))) {
      setUtilitiesOpen(true);
    }
  }, [location.pathname]);

  const navBtnSx = (selected: boolean, isSubItem = false) => ({
    borderRadius: 2,
    mx: 1,
    minHeight: isSubItem ? 48 : 56,
    justifyContent: isExpanded ? 'initial' : 'center',
    px: isExpanded ? 2 : 1.5,
    '&.Mui-selected': {
      backgroundColor: 'rgba(255,255,255,0.15)',
      color: 'white',
      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
    },
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
    transition: 'all 0.2s ease-in-out',
  });

  const iconSx = (small = false) => ({
    color: 'inherit',
    minWidth: isExpanded ? (small ? 36 : 40) : 'auto',
    justifyContent: 'center',
  });

  return (
    <Drawer
      variant="permanent"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      sx={{
        width: isExpanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
        '& .MuiDrawer-paper': {
          width: isExpanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          overflowX: 'hidden',
          top: '80px',
          height: 'calc(100vh - 80px)',
          backgroundColor: theme.palette.primary.main,
          color: 'white',
          borderRight: 'none',
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
        },
      }}
    >
      <Box
        sx={{
          px: isExpanded ? 3 : 1,
          pt: 3,
          pb: 2,
          overflow: 'hidden',
          transition: 'padding 0.2s ease-in-out',
          minHeight: 72,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {isExpanded && (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'white' }}>
              Project Monitoring
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              Dashboard
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', mx: isExpanded ? 2 : 1 }} />

      <Box sx={{ flexGrow: 1, mt: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <List sx={{ px: 1 }}>

          {/* Project List */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Project List'} placement="right" arrow>
              <ListItemButton
                selected={location.pathname === '/dashboard'}
                onClick={() => navigate('/dashboard')}
                sx={navBtnSx(location.pathname === '/dashboard')}
              >
                <ListItemIcon sx={iconSx()}>
                  <DashboardIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Project List"
                    secondary="View and manage projects"
                    secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                    sx={{ color: 'white' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>

          {/* Dashboard */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Dashboard'} placement="right" arrow>
              <ListItemButton
                selected={location.pathname === '/location-analysis'}
                onClick={() => navigate('/location-analysis')}
                sx={navBtnSx(location.pathname === '/location-analysis')}
              >
                <ListItemIcon sx={iconSx()}>
                  <AnalyticsIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Dashboard"
                    secondary="Project insights and analytics"
                    secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                    sx={{ color: 'white' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>

          {/* Collections & AR */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Collections & AR'} placement="right" arrow>
              <ListItemButton
                selected={location.pathname === '/collections'}
                onClick={() => navigate('/collections')}
                sx={navBtnSx(location.pathname === '/collections')}
              >
                <ListItemIcon sx={iconSx()}>
                  <PaidIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Collections & AR"
                    secondary="Invoices, due dates, collections"
                    secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                    sx={{ color: 'white' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>

          {/* Expense Monitoring (collapsible) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Expense Monitoring'} placement="right" arrow>
              <ListItemButton
                onClick={() => setExpenseMonitoringOpen((open) => !open)}
                sx={navBtnSx(false)}
              >
                <ListItemIcon sx={iconSx()}>
                  <ReceiptIcon />
                </ListItemIcon>
                {isExpanded && (
                  <>
                    <ListItemText
                      primary="Expense Monitoring"
                      secondary="Expenses, CA, liquidation, labor"
                      secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                      sx={{ color: 'white' }}
                    />
                    {expenseMonitoringOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
          <Collapse in={expenseMonitoringOpen && isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={
                    location.pathname === '/expense-monitoring' &&
                    !location.pathname.includes('/ca-form') &&
                    !location.pathname.includes('/liquidation-form') &&
                    !location.pathname.includes('/direct-labor')
                  }
                  onClick={() => navigate('/expense-monitoring')}
                  sx={navBtnSx(location.pathname === '/expense-monitoring', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <ReceiptIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Expense Monitoring"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/expense-monitoring/ca-form'}
                  onClick={() => navigate('/expense-monitoring/ca-form')}
                  sx={navBtnSx(location.pathname === '/expense-monitoring/ca-form', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <AccountBalanceIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="CA Form"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/expense-monitoring/liquidation-form'}
                  onClick={() => navigate('/expense-monitoring/liquidation-form')}
                  sx={navBtnSx(location.pathname === '/expense-monitoring/liquidation-form', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <ReceiptIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Liquidation Form"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/expense-monitoring/direct-labor'}
                  onClick={() => navigate('/expense-monitoring/direct-labor')}
                  sx={navBtnSx(location.pathname === '/expense-monitoring/direct-labor', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <BuildIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Direct Labor"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              {/* Investment Tracker */}
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/investment-tracker'}
                  onClick={() => navigate('/investment-tracker')}
                  sx={navBtnSx(location.pathname === '/investment-tracker', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <TrendingUpIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Investment Tracker"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              {/* Payroll — only visible to authorized users */}
              {isPayrollAuthorized(user?.username) && (
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={location.pathname === '/payroll'}
                    onClick={() => navigate('/payroll')}
                    sx={navBtnSx(location.pathname === '/payroll', true)}
                  >
                    <ListItemIcon sx={iconSx(true)}>
                      <PaymentsIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Payroll"
                      primaryTypographyProps={{ fontSize: '0.875rem' }}
                      sx={{ color: 'white' }}
                    />
                  </ListItemButton>
                </ListItem>
              )}
            </List>
          </Collapse>

          {/* Clients */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Clients'} placement="right" arrow>
              <ListItemButton
                selected={location.pathname === '/clients'}
                onClick={() => navigate('/clients')}
                sx={navBtnSx(location.pathname === '/clients')}
              >
                <ListItemIcon sx={iconSx()}>
                  <ClientsIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Clients"
                    secondary="Manage client database"
                    secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                    sx={{ color: 'white' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>



          {/* Calcsheet */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Calcsheet'} placement="right" arrow>
              <ListItemButton
                selected={location.pathname.startsWith('/calcsheet')}
                onClick={() => navigate('/calcsheet/projects')}
                sx={navBtnSx(location.pathname.startsWith('/calcsheet'))}
              >
                <ListItemIcon sx={iconSx()}>
                  <CalculateIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Calcsheet"
                    secondary="Quotations & estimates"
                    secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                    sx={{ color: 'white' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>

          {/* Supply Chain (collapsible) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Supply Chain'} placement="right" arrow>
              <ListItemButton
                onClick={() => setSupplyChainOpen((open) => !open)}
                sx={navBtnSx(false)}
              >
                <ListItemIcon sx={iconSx()}>
                  <SupplyChainIcon />
                </ListItemIcon>
                {isExpanded && (
                  <>
                    <ListItemText
                      primary="Supply Chain"
                      secondary="Material request, orders, delivery"
                      secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                      sx={{ color: 'white' }}
                    />
                    {supplyChainOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
          <Collapse in={supplyChainOpen && isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/material-request'}
                  onClick={() => navigate('/material-request')}
                  sx={navBtnSx(location.pathname === '/material-request', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <MaterialRequestIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Requests & Orders"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/delivery'}
                  onClick={() => navigate('/delivery')}
                  sx={navBtnSx(location.pathname === '/delivery', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <DeliveryIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Delivery Receipt"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/suppliers'}
                  onClick={() => navigate('/suppliers')}
                  sx={navBtnSx(location.pathname === '/suppliers', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <SuppliersIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Suppliers"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/purchase-order'}
                  onClick={() => navigate('/purchase-order')}
                  sx={navBtnSx(location.pathname === '/purchase-order', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <PurchaseOrderIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Purchase Order"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/estimates'}
                  onClick={() => navigate('/estimates')}
                  sx={navBtnSx(location.pathname === '/estimates', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <EstimateIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Estimates"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>

          {/* Reports (collapsible) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Reports'} placement="right" arrow>
              <ListItemButton
                onClick={() => setReportsOpen((open) => !open)}
                sx={navBtnSx(false)}
              >
                <ListItemIcon sx={iconSx()}>
                  <ReportsIcon />
                </ListItemIcon>
                {isExpanded && (
                  <>
                    <ListItemText
                      primary="Reports"
                      secondary="Progress, service, completion"
                      secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                      sx={{ color: 'white' }}
                    />
                    {reportsOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
          <Collapse in={reportsOpen && isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={
                    location.pathname === '/reports/progress' ||
                    location.pathname === '/reports' ||
                    location.pathname === '/reports/'
                  }
                  onClick={() => navigate('/reports/progress')}
                  sx={navBtnSx(location.pathname === '/reports/progress', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <PictureAsPdfIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Progress Report"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname.startsWith('/reports/service')}
                  onClick={() => navigate('/reports/service')}
                  sx={navBtnSx(location.pathname.startsWith('/reports/service'), true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <PictureAsPdfIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Service Report"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname.startsWith('/reports/completion')}
                  onClick={() => navigate('/reports/completion')}
                  sx={navBtnSx(location.pathname.startsWith('/reports/completion'), true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <PictureAsPdfIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Certificate of Completion"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname.startsWith('/reports/attachments')}
                  onClick={() => navigate('/reports/attachments')}
                  sx={navBtnSx(location.pathname.startsWith('/reports/attachments'), true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <CloudIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Attachments"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>

          {/* Utilities (collapsible) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : 'Utilities'} placement="right" arrow>
              <ListItemButton
                onClick={() => setUtilitiesOpen((open) => !open)}
                sx={navBtnSx(false)}
              >
                <ListItemIcon sx={iconSx()}>
                  <BuildIcon />
                </ListItemIcon>
                {isExpanded && (
                  <>
                    <ListItemText
                      primary="Utilities"
                      secondary="EHS, ID cards & tools"
                      secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                      sx={{ color: 'white' }}
                    />
                    {utilitiesOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
          <Collapse in={utilitiesOpen && isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={
                    location.pathname === '/utilities/ehs/safety-certificate' ||
                    location.pathname === '/utilities/ehs' ||
                    location.pathname === '/utilities/ehs/'
                  }
                  onClick={() => navigate('/utilities/ehs/safety-certificate')}
                  sx={{ ...navBtnSx(false, true), minHeight: 40, pl: 3 }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 32, justifyContent: 'center' }}>
                    <PictureAsPdfIcon sx={{ fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Safety Certificate"
                    primaryTypographyProps={{ fontSize: '0.8125rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/utilities/ehs/safety-manual'}
                  onClick={() => navigate('/utilities/ehs/safety-manual')}
                  sx={{ ...navBtnSx(false, true), minHeight: 40, pl: 3 }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 32, justifyContent: 'center' }}>
                    <PictureAsPdfIcon sx={{ fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Safety Manual"
                    primaryTypographyProps={{ fontSize: '0.8125rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/utilities/ehs/osh-program'}
                  onClick={() => navigate('/utilities/ehs/osh-program')}
                  sx={{ ...navBtnSx(false, true), minHeight: 40, pl: 3 }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 32, justifyContent: 'center' }}>
                    <PictureAsPdfIcon sx={{ fontSize: 18 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="OSH Program"
                    primaryTypographyProps={{ fontSize: '0.8125rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/utilities/id-generator'}
                  onClick={() => navigate('/utilities/id-generator')}
                  sx={navBtnSx(location.pathname === '/utilities/id-generator', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <BadgeIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="ID Generator"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/utilities/acknowledgement-receipt'}
                  onClick={() => navigate('/utilities/acknowledgement-receipt')}
                  sx={navBtnSx(location.pathname === '/utilities/acknowledgement-receipt', true)}
                >
                  <ListItemIcon sx={iconSx(true)}>
                    <ReceiptIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Acknowledgement Receipt"
                    primaryTypographyProps={{ fontSize: '0.8125rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>

        </List>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', mx: isExpanded ? 2 : 1 }} />

      <Box sx={{ p: 2 }}>
        <List sx={{ px: 0 }}>
          {user?.role === 'superadmin' && (
            <ListItem disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={isExpanded ? '' : 'User Approvals'} placement="right" arrow>
                <ListItemButton
                  selected={location.pathname === '/user-approvals'}
                  onClick={() => navigate('/user-approvals')}
                  sx={{
                    borderRadius: 2,
                    minHeight: 48,
                    justifyContent: isExpanded ? 'initial' : 'center',
                    px: isExpanded ? 2 : 1.5,
                    '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: isExpanded ? 40 : 'auto', justifyContent: 'center' }}>
                    <HowToRegIcon />
                  </ListItemIcon>
                  {isExpanded && (
                    <ListItemText
                      primary="User approvals"
                      primaryTypographyProps={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          )}
          <ListItem disablePadding>
            <Tooltip title={isExpanded ? '' : 'Notifications'} placement="right" arrow>
              <ListItemButton
                sx={{
                  borderRadius: 2,
                  minHeight: 48,
                  justifyContent: isExpanded ? 'initial' : 'center',
                  px: isExpanded ? 2 : 1.5,
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <ListItemIcon sx={{ color: 'rgba(255,255,255,0.8)', minWidth: isExpanded ? 40 : 'auto', justifyContent: 'center' }}>
                  <NotificationsIcon />
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary="Notifications"
                    primaryTypographyProps={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
          {user?.role === 'superadmin' && (
            <ListItem disablePadding>
              <Tooltip title={isExpanded ? '' : 'User Management'} placement="right" arrow>
                <ListItemButton
                  selected={location.pathname.startsWith('/settings')}
                  onClick={() => navigate('/settings/users')}
                  sx={{
                    borderRadius: 2,
                    minHeight: 48,
                    justifyContent: isExpanded ? 'initial' : 'center',
                    px: isExpanded ? 2 : 1.5,
                    '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: isExpanded ? 40 : 'auto', justifyContent: 'center' }}>
                    <SettingsIcon />
                  </ListItemIcon>
                  {isExpanded && (
                    <ListItemText
                      primary="User Management"
                      secondary="Settings"
                      primaryTypographyProps={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}
                      secondaryTypographyProps={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.62)' }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          )}
        </List>
      </Box>
    </Drawer>
  );
};

export { SIDEBAR_WIDTH };
export default Sidebar;
