import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  QueryStats as QueryStatsIcon,
  Calculate as CalculateIcon,
  People as ClientsIcon,
  Assignment as MaterialRequestIcon,
  ReceiptLong as DeliveryIcon,
  Storefront as SuppliersIcon,
  ShoppingCart as PurchaseOrderIcon,
  Inventory2 as SupplyChainIcon,
  RequestQuote as EstimateIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';

const SALES_SUPPLY_CHAIN_PATHS = [
  '/sales/material-request',
  '/sales/delivery',
  '/sales/suppliers',
  '/sales/purchase-order',
  '/sales/estimates',
];

interface SalesNavListProps {
  isExpanded: boolean;
  navBtnSx: (selected: boolean, isSubItem?: boolean) => object;
  iconSx: (small?: boolean) => object;
}

const SalesNavList: React.FC<SalesNavListProps> = ({ isExpanded, navBtnSx, iconSx }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [supplyChainOpen, setSupplyChainOpen] = useState(() =>
    SALES_SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)
  );

  useEffect(() => {
    if (SALES_SUPPLY_CHAIN_PATHS.some((p) => location.pathname === p)) {
      setSupplyChainOpen(true);
    }
  }, [location.pathname]);

  return (
    <List sx={{ px: 1 }}>

      {/* Sales Home */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Sales Home'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/sales'}
            onClick={() => navigate('/sales')}
            sx={navBtnSx(location.pathname === '/sales')}
          >
            <ListItemIcon sx={iconSx()}>
              <QueryStatsIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Sales Home"
                secondary="Pipeline overview & key figures"
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
            selected={location.pathname.startsWith('/sales/calcsheet')}
            onClick={() => navigate('/sales/calcsheet/projects')}
            sx={navBtnSx(location.pathname.startsWith('/sales/calcsheet'))}
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

      {/* Clients */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Clients'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/sales/clients'}
            onClick={() => navigate('/sales/clients')}
            sx={navBtnSx(location.pathname === '/sales/clients')}
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
              selected={location.pathname === '/sales/material-request'}
              onClick={() => navigate('/sales/material-request')}
              sx={navBtnSx(location.pathname === '/sales/material-request', true)}
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
              selected={location.pathname === '/sales/delivery'}
              onClick={() => navigate('/sales/delivery')}
              sx={navBtnSx(location.pathname === '/sales/delivery', true)}
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
              selected={location.pathname === '/sales/suppliers'}
              onClick={() => navigate('/sales/suppliers')}
              sx={navBtnSx(location.pathname === '/sales/suppliers', true)}
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
              selected={location.pathname === '/sales/purchase-order'}
              onClick={() => navigate('/sales/purchase-order')}
              sx={navBtnSx(location.pathname === '/sales/purchase-order', true)}
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
              selected={location.pathname === '/sales/estimates'}
              onClick={() => navigate('/sales/estimates')}
              sx={navBtnSx(location.pathname === '/sales/estimates', true)}
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

    </List>
  );
};

export default SalesNavList;
