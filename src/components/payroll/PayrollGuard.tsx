import React from 'react';
import { Box, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../../contexts/AuthContext';
import { isPayrollAuthorized } from '../../config/payrollAccess';

const PayrollGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  if (!isPayrollAuthorized(user?.username)) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 2 }}>
        <LockOutlinedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h6" color="text.secondary">Access Restricted</Typography>
        <Typography variant="body2" color="text.disabled">
          You don't have permission to view Payroll.
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};

export default PayrollGuard;
