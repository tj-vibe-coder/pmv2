import React from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import { useTheme } from '@mui/material/styles';
import type { AiPageContext } from '../../types/AiAssist';
import { useAiAssist } from './AiAssistProvider';
import AiComposer from './AiComposer';
import AiMessageList from './AiMessageList';

const LIVE_PHASE_LABEL: Record<string, string> = {
  idle: '',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  interrupted: 'Interrupted',
  reconnecting: 'Reconnecting…',
  error: 'Voice unavailable',
};

interface AiAssistDrawerProps {
  pageContext: AiPageContext | null;
  enabled?: boolean;
  onNavigateSource?: (route: string) => void;
}

const SUGGESTIONS: Record<string, string[]> = {
  '/projects': ['Which open projects have the largest remaining balance?'],
  '/sales': ['Which opportunities need review?'],
};

const noOp = (): void => {};

export default function AiAssistDrawer({
  pageContext,
  enabled = true,
  onNavigateSource = noOp,
}: AiAssistDrawerProps): React.ReactElement {
  const { isOpen, close, messages, isLoading, send, stop, retry, clear, livePhase, startVoice, stopVoice } = useAiAssist();
  const isVoiceActive = livePhase !== 'idle' && livePhase !== 'error';

  // Push-to-talk: mouse/touch get real press-and-hold via pointer events.
  // Keyboard activation (Enter/Space on a focused button) only ever fires a
  // 'click' — never pointerdown/up — so keyboard users get toggle-on-press
  // instead, which doubles as the "explicit click fallback" for assistive
  // tech that can't hold a pointer down. `event.detail === 0` reliably
  // distinguishes a keyboard/programmatic click (detail 0) from a real mouse
  // click (detail >= 1) — mouse clicks are ignored here since pointerdown/up
  // already handled that same interaction; without this check the trailing
  // click after a press-and-hold would immediately restart the session.
  const handleVoicePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    if (!isVoiceActive) void startVoice();
  };
  const handleVoicePointerUp = () => {
    if (isVoiceActive) stopVoice();
  };
  const handleVoiceClick = (event: React.MouseEvent) => {
    if (event.detail !== 0) return;
    if (isVoiceActive) stopVoice();
    else void startVoice();
  };
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // The provider currently does not expose its feature flag. A missing page context
  // is therefore treated as unavailable too, preventing a request without scope.
  const isAvailable = enabled && pageContext !== null;
  const suggestions = pageContext ? SUGGESTIONS[pageContext.route] || [] : [];
  const lastMessage = messages[messages.length - 1];

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Stack alignItems="center" direction="row" spacing={1}>
          <Typography component="h2" variant="h6">IOCT Assist</Typography>
          <Chip label="Read only" size="small" />
        </Stack>
        <IconButton aria-label="Close IOCT Assist" onClick={close}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
        {!isAvailable ? (
          <Typography color="text.secondary">IOCT Assist is not available right now.</Typography>
        ) : (
          <>
            {messages.length === 0 && suggestions.length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                {suggestions.map((suggestion) => (
                  <Chip key={suggestion} label={suggestion} onClick={() => send(suggestion, pageContext)} />
                ))}
              </Stack>
            )}
            <AiMessageList messages={messages} onNavigateSource={onNavigateSource} />
            {lastMessage?.role === 'error' && (
              <Button onClick={() => retry(pageContext)} sx={{ mt: 1 }}>Retry</Button>
            )}
          </>
        )}
      </Box>
      {isAvailable && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
          <Stack alignItems="center" direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Button onClick={clear}>New conversation</Button>
            <Stack alignItems="center" direction="row" spacing={1}>
              {LIVE_PHASE_LABEL[livePhase] && (
                <Typography color="text.secondary" variant="caption">{LIVE_PHASE_LABEL[livePhase]}</Typography>
              )}
              <IconButton
                aria-label={isVoiceActive ? 'Stop voice session' : 'Hold to talk to IOCT Assist'}
                color={isVoiceActive ? 'primary' : 'default'}
                disabled={isLoading}
                onClick={handleVoiceClick}
                onPointerDown={handleVoicePointerDown}
                onPointerLeave={handleVoicePointerUp}
                onPointerUp={handleVoicePointerUp}
              >
                <MicIcon />
              </IconButton>
              {isLoading && <Button onClick={stop}>Stop</Button>}
            </Stack>
          </Stack>
          <AiComposer disabled={isLoading} onSend={(text) => send(text, pageContext)} />
        </Box>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Dialog fullScreen keepMounted onClose={close} open={isOpen}>
        {content}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="right"
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
      open={isOpen}
      onClose={close}
    >
      {content}
    </Drawer>
  );
}
