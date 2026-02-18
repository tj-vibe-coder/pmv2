import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Chip
} from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
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
      <Toolbar sx={{ minHeight: '80px', px: 3 }}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            flexGrow: 1
          }}
        >
          <Typography
            variant="h5"
            component="div"
            sx={{
              fontWeight: 600,
              color: '#2c5aa0',
              letterSpacing: '0.5px'
            }}
          >
            Project Monitoring System
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isAuthenticated ? (
            <>
              <Chip
                label={user?.role.toUpperCase()}
                size="small"
                sx={{
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