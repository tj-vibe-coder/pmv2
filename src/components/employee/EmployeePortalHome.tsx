import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Paper, Button } from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0', accent1: '#4f7bc8' };

const EmployeePortalHome: React.FC = () => {
  const navigate = useNavigate();

  const modules = [
    {
      title: 'Daily Time Record',
      description: 'Log your daily hours, overtime, and attendance.',
      icon: <CalendarIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 28 }} />,
      path: '/employee/dtr',
    },
    {
      title: 'Expense Liquidation',
      description: 'Submit expense liquidation forms and receipts.',
      icon: <ReceiptIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 28 }} />,
      path: '/employee/liquidation-form',
    },
  ];

  return (
    <Box sx={{ height: '100%' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 3 }}>
        Employee Portal
      </Typography>
      <Grid container spacing={2}>
        {modules.map((m) => (
          <Grid key={m.path} size={{ xs: 12, sm: 6, md: 4 }}>
            <Paper
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                border: '1px solid #e2e8f0',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {m.icon}
                <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                  {m.title}
                </Typography>
              </Box>
              <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">{m.description}</Typography>
                <Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(m.path)}
                    sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                  >
                    Open
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default EmployeePortalHome;
