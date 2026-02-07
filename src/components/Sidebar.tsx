import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  AccountBalanceWallet as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  People as ClientsIcon,
  Assignment as MaterialRequestIcon,
  LocalShipping as OrderTrackerIcon,
  ReceiptLong as DeliveryIcon,
  Storefront as SuppliersIcon,
  ShoppingCart as PurchaseOrderIcon,
  Inventory2 as SupplyChainIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';

const SIDEBAR_WIDTH = 280;

const SUPPLY_CHAIN_PATHS = ['/material-request', '/order-tracker', '/delivery', '/suppliers', '/purchase-order'];

const Sidebar: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [supplyChainOpen, setSupplyChainOpen] = useState(() =>
    SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)
  );

  useEffect(() => {
    if (SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)) {
      setSupplyChainOpen(true);
    }
  }, [location.pathname]);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          top: '80px', // Account for header height
          height: 'calc(100vh - 80px)',
          backgroundColor: theme.palette.primary.main,
          color: 'white',
          borderRight: 'none',
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
        },
      }}
    >
      <Box sx={{ p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'white' }}>
              Project Monitoring
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              Dashboard
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', mx: 2 }} />

      <Box sx={{ flexGrow: 1, mt: 1 }}>
        {/* Main Navigation */}
        <List sx={{ px: 1 }}>
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/dashboard'}
              onClick={() => navigate('/dashboard')}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <DashboardIcon />
              </ListItemIcon>
              <ListItemText
                primary="Project List"
                secondary="View and manage projects"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/location-analysis'}
              onClick={() => navigate('/location-analysis')}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <AnalyticsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Dashboard"
                secondary="Project insights and analytics"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/expense-monitoring'}
              onClick={() => navigate('/expense-monitoring')}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <ReceiptIcon />
              </ListItemIcon>
              <ListItemText
                primary="Expense Monitoring"
                secondary="Track project expenses"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/forecasting'}
              onClick={() => navigate('/forecasting')}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <TrendingUpIcon />
              </ListItemIcon>
              <ListItemText
                primary="Forecasting"
                secondary="Business analytics & predictions"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/clients'}
              onClick={() => navigate('/clients')}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <ClientsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Clients"
                secondary="Manage client database"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>

          {/* Supply Chain (collapsible parent) */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => setSupplyChainOpen((open) => !open)}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 56,
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <SupplyChainIcon />
              </ListItemIcon>
              <ListItemText
                primary="Supply Chain"
                secondary="Material request, orders, delivery"
                secondaryTypographyProps={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.75rem',
                }}
                sx={{ color: 'white' }}
              />
              {supplyChainOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
            </ListItemButton>
          </ListItem>
          <Collapse in={supplyChainOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/material-request'}
                  onClick={() => navigate('/material-request')}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    minHeight: 48,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                    <MaterialRequestIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Material Request"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/order-tracker'}
                  onClick={() => navigate('/order-tracker')}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    minHeight: 48,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                    <OrderTrackerIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Order Tracker"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === '/delivery'}
                  onClick={() => navigate('/delivery')}
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    minHeight: 48,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
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
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    minHeight: 48,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
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
                  sx={{
                    borderRadius: 2,
                    mx: 1,
                    minHeight: 48,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                    <PurchaseOrderIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Purchase Order"
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                    sx={{ color: 'white' }}
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </Collapse>
        </List>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', mx: 2 }} />

      <Box sx={{ p: 2 }}>
        <List sx={{ px: 0 }}>
          <ListItem disablePadding>
            <ListItemButton
              sx={{
                borderRadius: 2,
                minHeight: 48,
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'rgba(255,255,255,0.8)', minWidth: 40 }}>
                <NotificationsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Notifications"
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton
              sx={{
                borderRadius: 2,
                minHeight: 48,
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'rgba(255,255,255,0.8)', minWidth: 40 }}>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Settings"
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  );
};

export { SIDEBAR_WIDTH };
export default Sidebar;