import React from 'react';
import { Divider, List, ListItemButton, ListItemIcon, ListItemText, Paper } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface HubModule {
  title: string;
  description?: string;
  icon: React.ReactNode;
  path: string;
}

interface Props {
  items: HubModule[];
  onOpen: (path: string) => void;
}

// Phone version of the "module tiles" on the hub pages (Finance Hub, Employee Portal):
// one outlined card of tappable rows — icon, title, a two-line description and a chevron.
const HubModuleList: React.FC<Props> = ({ items, onOpen }) => (
  <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
    <List disablePadding>
      {items.map((m, i) => (
        <React.Fragment key={m.path}>
          {i > 0 && <Divider component="li" />}
          <ListItemButton onClick={() => onOpen(m.path)} sx={{ py: 1.25, minHeight: 56, alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 40, mt: 0.25 }}>{m.icon}</ListItemIcon>
            <ListItemText
              primary={m.title}
              secondary={m.description}
              slotProps={{
                primary: { variant: 'body2', sx: { fontWeight: 600 } },
                secondary: {
                  variant: 'caption',
                  sx: { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' },
                },
              }}
            />
            <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled', alignSelf: 'center', ml: 0.5 }} />
          </ListItemButton>
        </React.Fragment>
      ))}
    </List>
  </Paper>
);

export default HubModuleList;
