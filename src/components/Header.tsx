import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Chip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  AccessTime as AccessTimeIcon,
  Person as PersonIcon,
  Menu as MenuIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  /** Mobile: toggle the navigation drawer. */
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isEmployeeWorkspace = location.pathname === '/employee' || location.pathname.startsWith('/employee/');
  const isFinanceWorkspace = location.pathname === '/finance' || location.pathname.startsWith('/finance/');
  const isSalesWorkspace = location.pathname === '/sales' || location.pathname.startsWith('/sales/');
  const workspace = isFinanceWorkspace ? 'finance' : isSalesWorkspace ? 'sales' : 'projects';
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const handleUserMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
    navigate('/login');
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin': return '#8e44ad';
      case 'admin': return '#e74c3c';
      case 'user': return '#3498db';
      case 'viewer': return '#95a5a6';
      case 'tax_filer': return '#16a085';
      default: return '#95a5a6';
    }
  };

  return (
    <>
    <AppBar 
      position="sticky" 
      sx={{ 
        backgroundColor: '#ffffff',
        color: '#333333',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        borderBottom: '1px solid #e0e0e0'
      }}
    >
      <Toolbar sx={{ minHeight: '80px', px: { xs: 1.5, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, minWidth: 0 }}>
          {isAuthenticated && (
            <IconButton
              onClick={onMenuClick}
              aria-label="Open navigation menu"
              edge="start"
              sx={{ mr: 1, display: { xs: 'inline-flex', md: 'none' }, color: '#2c5aa0' }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box
            component="img"
            src="/logo-ioct-only.svg"
            alt="IOCT Logo"
            sx={{ height: { xs: 36, md: 48 }, mr: { xs: 1, md: 2 }, flexShrink: 0 }}
          />
          <Typography
            variant="h5"
            component="div"
            sx={{
              fontWeight: 600,
              color: '#2c5aa0',
              letterSpacing: '0.5px',
              fontSize: { xs: '1.05rem', md: '1.5rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isEmployeeWorkspace ? 'Employee Portal' : isFinanceWorkspace ? 'Finance' : isSalesWorkspace ? 'Sales' : 'Project Monitoring System'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexShrink: 0 }}>
          {isAuthenticated ? (
            <>
              {!isEmployeeWorkspace && (
              <ToggleButtonGroup
                value={workspace}
                exclusive
                size="small"
                onChange={(_, value) => {
                  if (!value || value === workspace) return;
                  if (value === 'projects') navigate('/dashboard');
                  if (value === 'sales') navigate('/sales');
                  if (value === 'finance') navigate('/finance');
                }}
                sx={{
                  display: { xs: 'none', md: 'inline-flex' },
                  '& .MuiToggleButton-root': {
                    textTransform: 'none',
                    fontSize: '0.8125rem',
                    px: 1.5,
                    py: 0.4,
                    color: '#2c5aa0',
                    borderColor: 'rgba(44,90,160,0.4)',
                    '&.Mui-selected': {
                      backgroundColor: '#2c5aa0',
                      color: 'white',
                      '&:hover': { backgroundColor: '#1e4a72' },
                    },
                    '&:hover': { backgroundColor: 'rgba(44,90,160,0.08)' },
                  },
                }}
              >
                <ToggleButton value="projects">Projects</ToggleButton>
                <ToggleButton value="sales">Sales</ToggleButton>
                <ToggleButton value="finance">Finance</ToggleButton>
              </ToggleButtonGroup>
              )}

              <Chip
                label={user?.role.toUpperCase()}
                size="small"
                sx={{
                  display: { xs: 'none', sm: 'inline-flex' },
                  backgroundColor: getRoleColor(user?.role || ''),
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.75rem'
                }}
              />
              
              <IconButton
                onClick={handleUserMenuClick}
                sx={{ p: 0.5 }}
              >
                <Avatar sx={{ width: 32, height: 32, backgroundColor: '#2c5aa0' }}>
                  <PersonIcon fontSize="small" sx={{ color: 'white' }} />
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={handleUserMenuClose}
                PaperProps={{
                  sx: {
                    mt: 1,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                    borderRadius: 2,
                    minWidth: 200
                  }
                }}
              >
                <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e0e0e0' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#333' }}>
                    {user?.username}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {user?.email}
                  </Typography>
                </Box>
                <MenuItem onClick={() => { handleUserMenuClose(); navigate('/employee'); }}>
                  <ListItemIcon>
                    <AccessTimeIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Employee Portal (DTR)" />
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Logout" />
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              startIcon={<LoginIcon />}
              onClick={() => navigate('/login')}
              sx={{
                backgroundColor: '#2c5aa0',
                color: 'white',
                '&:hover': {
                  backgroundColor: '#1e4a72'
                }
              }}
            >
              Login
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
    </>
  );
};

export default Header;