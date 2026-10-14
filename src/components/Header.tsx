import React, { useEffect, useState } from 'react';
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
  Badge,
  Chip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  AccessTime as AccessTimeIcon,
  Person as PersonIcon,
  Menu as MenuIcon,
  StickyNote2 as StickyNote2Icon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import WhiteboardDialog from './WhiteboardDialog';
import { useWhiteboardStore } from '../store/whiteboardStore';

// Shown once per browser tab session, right after login — sessionStorage
// clears itself when the tab/window closes, so it naturally re-shows on the
// next login without needing any server-side "seen" tracking. The button
// below reopens it any time regardless of this flag.
const WHITEBOARD_SEEN_KEY = 'pmv2_whiteboard_shown';

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
  const isAdminUser = user?.role === 'superadmin' || user?.role === 'admin';
  const workspace = isEmployeeWorkspace ? 'employee' : isFinanceWorkspace ? 'finance' : isSalesWorkspace ? 'sales' : 'projects';
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  // Pending "General updates" — shown as a badge on the Whiteboard button so
  // the team always sees there's an open item, even with the board closed.
  const fetchWhiteboard = useWhiteboardStore((s) => s.fetchItems);
  const generalPending = useWhiteboardStore((s) => s.items.filter((i) => (i.visibility === 'general' || i.visibility === 'public') && !i.done).length);
  useEffect(() => {
    if (isAuthenticated) fetchWhiteboard().catch(() => {});
  }, [isAuthenticated, fetchWhiteboard]);

  // Auto-popup once per login session (see WHITEBOARD_SEEN_KEY above) — not on
  // every route change, since this effect only re-runs when isAuthenticated
  // itself flips (its only dependency), not on navigation.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (sessionStorage.getItem(WHITEBOARD_SEEN_KEY)) return;
    sessionStorage.setItem(WHITEBOARD_SEEN_KEY, '1');
    setWhiteboardOpen(true);
  }, [isAuthenticated]);

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
      <Toolbar sx={{ minHeight: '80px', pl: { xs: 'calc(12px + env(safe-area-inset-left))', md: 'calc(24px + env(safe-area-inset-left))' }, pr: { xs: 'calc(12px + env(safe-area-inset-right))', md: 'calc(24px + env(safe-area-inset-right))' }, '@media (max-height: 600px)': { minHeight: '56px' } }}>
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
            src="/logo-ioct-only.svg?v=10"
            alt="IOCT Logo"
            sx={{ height: { xs: 36, md: 48 }, mr: { xs: 1, md: 2 }, flexShrink: 0, '@media (max-height: 600px)': { height: 36 } }}
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
              {user?.role !== 'tax_filer' && (!isEmployeeWorkspace || isAdminUser) && (
              <ToggleButtonGroup
                value={workspace}
                exclusive
                size="small"
                onChange={(_, value) => {
                  if (!value || value === workspace) return;
                  if (value === 'projects') navigate('/dashboard');
                  if (value === 'sales') navigate('/sales');
                  if (value === 'finance') navigate('/finance');
                  if (value === 'employee') navigate('/employee');
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
                {isAdminUser && <ToggleButton value="employee">Employee</ToggleButton>}
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
                onClick={() => setWhiteboardOpen(true)}
                title={generalPending ? `Whiteboard — ${generalPending} pending general update${generalPending === 1 ? '' : 's'}` : 'Whiteboard — notes, to-dos & updates'}
                sx={{ color: '#2c5aa0' }}
              >
                <Badge badgeContent={generalPending} color="warning" max={99}>
                  <StickyNote2Icon />
                </Badge>
              </IconButton>

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
    {isAuthenticated && (
      <WhiteboardDialog open={whiteboardOpen} onClose={() => setWhiteboardOpen(false)} />
    )}
    </>
  );
};

export default Header;