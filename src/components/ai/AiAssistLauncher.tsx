import React from 'react';
import { Fab } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useAiAssist } from './AiAssistProvider';

export default function AiAssistLauncher(): React.ReactElement | null {
  const { open } = useAiAssist();

  return (
    <Fab
      aria-label="Open IOCT Assist"
      color="primary"
      onClick={open}
      sx={{ bottom: 24, position: 'fixed', right: 24 }}
    >
      <AutoAwesomeIcon />
    </Fab>
  );
}
