import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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
  AccountBalance as AccountBalanceIcon,
  AccountBalanceWallet as ReceiptIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  Payments as PaymentsIcon,
  Paid as PaidIcon,
  Build as BuildIcon,
  RequestQuote as OverheadIcon,
  Summarize as PnLIcon,
} from '@mui/icons-material';
import { isPayrollAuthorized } from '../../config/payrollAccess';

const FINANCE_EXPENSE_PATHS = [
  '/finance/expense-monitoring',
  '/finance/expense-monitoring/ca-form',
  '/finance/expense-monitoring/liquidation-form',
  '/finance/expense-monitoring/direct-labor',
];

interface FinanceNavListProps {
  isExpanded: boolean;
  navBtnSx: (selected: boolean, isSubItem?: boolean) => object;
  iconSx: (small?: boolean) => object;
}

const FinanceNavList: React.FC<FinanceNavListProps> = ({ isExpanded, navBtnSx, iconSx }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [expenseOpen, setExpenseOpen] = useState(() =>
    FINANCE_EXPENSE_PATHS.some((p) => location.pathname === p)
  );

  useEffect(() => {
    if (FINANCE_EXPENSE_PATHS.some((p) => location.pathname === p)) {
      setExpenseOpen(true);
    }
  }, [location.pathname]);

  return (
    <List sx={{ px: 1 }}>

      {/* Finance Home */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Finance Home'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance'}
            onClick={() => navigate('/finance')}
            sx={navBtnSx(location.pathname === '/finance')}
          >
            <ListItemIcon sx={iconSx()}>
              <AccountBalanceIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Finance Home"
                secondary="Overview and key figures"
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
            selected={location.pathname === '/finance/collections'}
            onClick={() => navigate('/finance/collections')}
            sx={navBtnSx(location.pathname === '/finance/collections')}
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
            onClick={() => setExpenseOpen((open) => !open)}
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
                {expenseOpen ? <ExpandLessIcon sx={{ color: 'white' }} /> : <ExpandMoreIcon sx={{ color: 'white' }} />}
              </>
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
      <Collapse in={expenseOpen && isExpanded} timeout="auto" unmountOnExit>
        <List component="div" disablePadding sx={{ pl: 2 }}>
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/finance/expense-monitoring'}
              onClick={() => navigate('/finance/expense-monitoring')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring', true)}
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
              selected={location.pathname === '/finance/expense-monitoring/ca-form'}
              onClick={() => navigate('/finance/expense-monitoring/ca-form')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/ca-form', true)}
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
              selected={location.pathname === '/finance/expense-monitoring/liquidation-form'}
              onClick={() => navigate('/finance/expense-monitoring/liquidation-form')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/liquidation-form', true)}
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
              selected={location.pathname === '/finance/expense-monitoring/direct-labor'}
              onClick={() => navigate('/finance/expense-monitoring/direct-labor')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/direct-labor', true)}
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
        </List>
      </Collapse>

      {/* Investment Tracker */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Investment Tracker'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/investment-tracker'}
            onClick={() => navigate('/finance/investment-tracker')}
            sx={navBtnSx(location.pathname === '/finance/investment-tracker')}
          >
            <ListItemIcon sx={iconSx()}>
              <TrendingUpIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Investment Tracker"
                secondary="Capital and contributions"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      {/* Overhead Expenses */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Overhead Expenses'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/overhead-expenses'}
            onClick={() => navigate('/finance/overhead-expenses')}
            sx={navBtnSx(location.pathname === '/finance/overhead-expenses')}
          >
            <ListItemIcon sx={iconSx()}>
              <OverheadIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Overhead Expenses"
                secondary="Non-project company expenses"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      {/* Profit & Loss — superadmin only */}
      {user?.role === 'superadmin' && (
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Profit & Loss'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/pnl'}
            onClick={() => navigate('/finance/pnl')}
            sx={navBtnSx(location.pathname === '/finance/pnl')}
          >
            <ListItemIcon sx={iconSx()}>
              <PnLIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Profit & Loss"
                secondary="Company income statement"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
      )}

      {/* Payroll — only visible to authorized users */}
      {isPayrollAuthorized(user?.username) && (
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <Tooltip title={isExpanded ? '' : 'Payroll'} placement="right" arrow>
            <ListItemButton
              selected={location.pathname === '/finance/payroll'}
              onClick={() => navigate('/finance/payroll')}
              sx={navBtnSx(location.pathname === '/finance/payroll')}
            >
              <ListItemIcon sx={iconSx()}>
                <PaymentsIcon />
              </ListItemIcon>
              {isExpanded && (
                <ListItemText
                  primary="Payroll"
                  secondary="Employees, runs, payslips"
                  secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                  sx={{ color: 'white' }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      )}

    </List>
  );
};

export default FinanceNavList;
