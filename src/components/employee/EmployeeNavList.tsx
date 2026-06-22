import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Home as HomeIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
  QrCode2 as QrCodeIcon,
} from '@mui/icons-material';

interface EmployeeNavListProps {
  isExpanded: boolean;
  navBtnSx: (selected: boolean, isSubItem?: boolean) => object;
  iconSx: (small?: boolean) => object;
}

const EmployeeNavList: React.FC<EmployeeNavListProps> = ({ isExpanded, navBtnSx, iconSx }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const items = [
    { label: 'Home', icon: <HomeIcon />, path: '/employee', exact: true },
    { label: 'Clock In/Out', icon: <QrCodeIcon />, path: '/employee/clock' },
    { label: 'Daily Time Record', icon: <CalendarIcon />, path: '/employee/dtr' },
    { label: 'Liquidation', icon: <ReceiptIcon />, path: '/employee/liquidation-form' },
  ];

  return (
    <List sx={{ px: 1 }}>
      {items.map((item) => {
        const selected = item.exact
          ? location.pathname === item.path
          : location.pathname.startsWith(item.path);
        return (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : item.label} placement="right" arrow>
              <ListItemButton
                selected={selected}
                onClick={() => navigate(item.path)}
                sx={navBtnSx(selected)}
              >
                <ListItemIcon sx={iconSx()}>{item.icon}</ListItemIcon>
                {isExpanded && (
                  <ListItemText primary={item.label} sx={{ color: 'white' }} />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        );
      })}
    </List>
  );
};

export default EmployeeNavList;
