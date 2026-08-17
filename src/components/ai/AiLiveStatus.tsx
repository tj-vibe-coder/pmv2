import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import type { LivePhase } from '../../ai/liveClient';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  success: '#00b894',
  info: '#74b9ff',
};

const PHASE_LABEL: Record<LivePhase, string> = {
  idle: '',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  interrupted: 'Interrupted',
  reconnecting: 'Reconnecting…',
  error: 'Voice unavailable',
};

const BAR_COUNT = 12;

interface AiLiveStatusProps {
  phase: LivePhase;
  micLevel: number;
}

export default function AiLiveStatus({ phase, micLevel }: AiLiveStatusProps): React.ReactElement | null {
  if (phase === 'idle') return null;

  const clamped = Math.max(0, Math.min(1, micLevel));
  const activeBars = Math.round(clamped * BAR_COUNT);

  return (
    <Box
      aria-live="polite"
      sx={{
        bgcolor: 'rgba(44, 90, 160, 0.06)',
        border: '1px solid',
        borderColor: 'rgba(44, 90, 160, 0.18)',
        borderRadius: 1,
        mb: 2,
        px: 1.5,
        py: 1.25,
      }}
    >
      <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={1}>
        <Stack alignItems="center" direction="row" spacing={1}>
          <Box
            aria-hidden
            sx={{
              bgcolor: phase === 'listening' ? NET_PACIFIC_COLORS.success : NET_PACIFIC_COLORS.primary,
              borderRadius: '50%',
              boxShadow: `0 0 0 4px ${phase === 'listening' ? 'rgba(0,184,148,0.18)' : 'rgba(44,90,160,0.15)'}`,
              height: 8,
              width: 8,
            }}
          />
          <Chip color="primary" label="Always on" size="small" />
          <Typography variant="body2">{PHASE_LABEL[phase]}</Typography>
        </Stack>
        <Box
          aria-label={`Microphone level ${Math.round(clamped * 100)} percent`}
          sx={{ alignItems: 'flex-end', display: 'flex', gap: '2px', height: 22 }}
        >
          {Array.from({ length: BAR_COUNT }, (_, index) => {
            const on = index < activeBars;
            return (
              <Box
                key={index}
                sx={{
                  bgcolor: on ? NET_PACIFIC_COLORS.info : 'rgba(44, 90, 160, 0.15)',
                  borderRadius: 0.25,
                  height: `${30 + (index / (BAR_COUNT - 1)) * 70}%`,
                  width: 3,
                }}
              />
            );
          })}
        </Box>
      </Stack>
    </Box>
  );
}
