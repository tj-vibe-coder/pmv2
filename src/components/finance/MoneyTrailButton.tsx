import React, { useState } from 'react';
import { Badge, Button, Tooltip } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import type {
  FinanceTraceOrigin,
  FinanceTraceResolutionResponse,
} from '../../types/FinanceTrace';
import MoneyTrailDrawer from './MoneyTrailDrawer';

interface MoneyTrailButtonProps {
  origin: FinanceTraceOrigin;
  confirmedCount?: number;
  compact?: boolean;
  onResolved?: (response: FinanceTraceResolutionResponse) => void;
}

const MoneyTrailButton: React.FC<MoneyTrailButtonProps> = ({
  origin,
  confirmedCount = 0,
  compact = false,
  onResolved,
}) => {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      size="small"
      variant="text"
      startIcon={(
        <Badge badgeContent={confirmedCount} color="primary" invisible={!confirmedCount}>
          <AccountTreeOutlinedIcon fontSize="small" />
        </Badge>
      )}
      onClick={() => setOpen(true)}
      aria-label="View money trail"
    >
      {compact ? 'Trail' : 'View trail'}
    </Button>
  );
  return (
    <>
      {compact ? <Tooltip title="View money trail"><span>{button}</span></Tooltip> : button}
      <MoneyTrailDrawer
        open={open}
        origin={origin}
        onClose={() => setOpen(false)}
        onResolved={onResolved}
      />
    </>
  );
};

export default MoneyTrailButton;
