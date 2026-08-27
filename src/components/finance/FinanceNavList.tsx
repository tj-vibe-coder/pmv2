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
  Typography,
  Divider,
  Box,
} from '@mui/material';
import {
  AccountBalance as AccountBalanceIcon,
  AccountBalanceWallet as ExpenseWalletIcon,
  Receipt as ExpenseRegisterIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  Payments as PaymentsIcon,
  Paid as PaidIcon,
  Engineering as LaborIcon,
  Summarize as PnLIcon,
  MenuBook as TaxLedgerIcon,
  AutoAwesome as AutoAwesomeIcon,
  PriceCheck as ReimbursementIcon,
  AssignmentTurnedIn as LiquidationIcon,
  RequestQuote as CaIcon,
  Description as SoaIcon,
  FactCheck as EwtIcon,
  ShoppingCart as PoIcon,
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

  const renderSectionHeader = (title: string) => {
    if (!isExpanded) {
      return <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 1 }} />;
    }
    return (
      <Box sx={{ pt: 1.5, pb: 0.5, px: 1.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.68rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.6)',
            display: 'block',
          }}
        >
          {title}
        </Typography>
      </Box>
    );
  };

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  return (
    <List sx={{ px: 1 }}>

      {/* Overview & Intelligence */}
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

      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Finance Analytics'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/analytics' || location.pathname === '/analytics/finance'}
            onClick={() => navigate('/finance/analytics')}
            sx={navBtnSx(location.pathname === '/finance/analytics' || location.pathname === '/analytics/finance')}
          >
            <ListItemIcon sx={iconSx()}>
              <AutoAwesomeIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Finance Analytics"
                secondary="Expense forecasting & formulation"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      {/* --- INFLOW & RECEIVABLES --- */}
      {renderSectionHeader('Inflow & Receivables')}

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
                secondary="Invoices, aging, settlement"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Statements of Account'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/soa' || location.pathname.startsWith('/finance/soa/')}
            onClick={() => navigate('/finance/soa')}
            sx={navBtnSx(location.pathname === '/finance/soa' || location.pathname.startsWith('/finance/soa/'))}
          >
            <ListItemIcon sx={iconSx()}>
              <SoaIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Statements of Account"
                secondary="Partner (ACTI) & client SOAs"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>



      {/* --- OUTFLOW & EXPENSES --- */}
      {renderSectionHeader('Outflow & Expenses')}

      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Expense Monitoring'} placement="right" arrow>
          <ListItemButton
            onClick={() => setExpenseOpen((open) => !open)}
            sx={navBtnSx(false)}
          >
            <ListItemIcon sx={iconSx()}>
              <ExpenseWalletIcon />
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
                <ExpenseRegisterIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Expense Register"
                primaryTypographyProps={{ fontSize: '0.875rem' }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>
          {user?.role !== 'tax_filer' && (
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/finance/expense-monitoring/ca-form'}
              onClick={() => navigate('/finance/expense-monitoring/ca-form')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/ca-form', true)}
            >
              <ListItemIcon sx={iconSx(true)}>
                <CaIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Cash Advances (CA)"
                primaryTypographyProps={{ fontSize: '0.875rem' }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>
          )}
          {user?.role !== 'tax_filer' && (
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/finance/expense-monitoring/liquidation-form'}
              onClick={() => navigate('/finance/expense-monitoring/liquidation-form')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/liquidation-form', true)}
            >
              <ListItemIcon sx={iconSx(true)}>
                <LiquidationIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Liquidation Form"
                primaryTypographyProps={{ fontSize: '0.875rem' }}
                sx={{ color: 'white' }}
              />
            </ListItemButton>
          </ListItem>
          )}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/finance/expense-monitoring/direct-labor'}
              onClick={() => navigate('/finance/expense-monitoring/direct-labor')}
              sx={navBtnSx(location.pathname === '/finance/expense-monitoring/direct-labor', true)}
            >
              <ListItemIcon sx={iconSx(true)}>
                <LaborIcon fontSize="small" />
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

      {/* Purchase Orders */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Purchase Orders'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/purchase-order'}
            onClick={() => navigate('/finance/purchase-order')}
            sx={navBtnSx(location.pathname === '/finance/purchase-order')}
          >
            <ListItemIcon sx={iconSx()}>
              <PoIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Purchase Orders"
                secondary="Supplier POs & procurement"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      {/* Reimbursements — admin / superadmin */}
      {isAdmin && (
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <Tooltip title={isExpanded ? '' : 'Reimbursements'} placement="right" arrow>
            <ListItemButton
              selected={location.pathname === '/finance/reimbursements'}
              onClick={() => navigate('/finance/reimbursements')}
              sx={navBtnSx(location.pathname === '/finance/reimbursements')}
            >
              <ListItemIcon sx={iconSx()}>
                <ReimbursementIcon />
              </ListItemIcon>
              {isExpanded && (
                <ListItemText
                  primary="Reimbursements"
                  secondary="Review & payout claims"
                  secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                  sx={{ color: 'white' }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      )}

      {/* --- COMPLIANCE & ACCOUNTING --- */}
      {renderSectionHeader('Compliance & Accounting')}

      {/* Tax Filer Ledger */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Tax Filer Ledger'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/tax-ledger'}
            onClick={() => navigate('/finance/tax-ledger')}
            sx={navBtnSx(location.pathname === '/finance/tax-ledger')}
          >
            <ListItemIcon sx={iconSx()}>
              <TaxLedgerIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Tax Filer Ledger"
                secondary="BIR expense & payroll audit"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      {/* Sales EWT / 2307 — BIR withholding tax credits */}
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <Tooltip title={isExpanded ? '' : 'Sales EWT / 2307'} placement="right" arrow>
          <ListItemButton
            selected={location.pathname === '/finance/ewt-2307'}
            onClick={() => navigate('/finance/ewt-2307')}
            sx={navBtnSx(location.pathname === '/finance/ewt-2307')}
          >
            <ListItemIcon sx={iconSx()}>
              <EwtIcon />
            </ListItemIcon>
            {isExpanded && (
              <ListItemText
                primary="Sales EWT / 2307"
                secondary="Customer withholding tax credits"
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

      {/* Investment Tracker — hidden from tax_filer */}
      {user?.role !== 'tax_filer' && (
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
                secondary="Capital contributions & equity"
                secondaryTypographyProps={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
                sx={{ color: 'white' }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
      )}

      {/* Payroll — only visible to authorized users */}
      {isPayrollAuthorized(user?.role) && (
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
