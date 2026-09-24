import React from 'react';
import { Box, Fab } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useAiAssist } from './AiAssistProvider';

const LIVE_GREEN = '#00b894';
const LIVE_METER = '#74b9ff';

export default function AiAssistLauncher(): React.ReactElement | null {
  const { open, isOpen, livePhase, micLevel } = useAiAssist();
  const isLive = livePhase !== 'idle' && livePhase !== 'error';
  const meterDeg = Math.round(Math.max(0, Math.min(1, micLevel)) * 360);

  if (isOpen) return null;

  return (
    <Box sx={{ bottom: 24, position: 'fixed', right: 24, zIndex: 1300 }}>
      {isLive && (
        <Box
          aria-hidden
          sx={{
            background: `conic-gradient(${LIVE_METER} ${meterDeg}deg, rgba(116,185,255,0.18) 0deg)`,
            borderRadius: '50%',
            inset: -7,
            pointerEvents: 'none',
            position: 'absolute',
          }}
        />
      )}
      <Fab
        aria-label={isLive ? `Open IOCT Assist — live, ${livePhase}` : 'Open IOCT Assist'}
        color="primary"
        onClick={open}
        sx={{
          boxShadow: isLive ? `0 0 0 3px ${LIVE_GREEN}` : undefined,
          position: 'relative',
        }}
      >
        <AutoAwesomeIcon />
      </Fab>
      {isLive && (
        <Box
          sx={{
            bgcolor: LIVE_GREEN,
            borderRadius: 0.75,
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            lineHeight: 1.4,
            position: 'absolute',
            px: 0.6,
            right: -4,
            top: -8,
          }}
        >
          LIVE
        </Box>
      )}
    </Box>
  );
}
