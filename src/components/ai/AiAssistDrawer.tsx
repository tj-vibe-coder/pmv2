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
import { describeAiPage } from '../../ai/pageContext';
import { useAiAssist } from './AiAssistProvider';
import AiComposer from './AiComposer';
import AiLiveStatus from './AiLiveStatus';
import AiMessageList from './AiMessageList';

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
  const { isOpen, close, messages, isLoading, send, stop, retry, clear, livePhase, micLevel, startVoice, stopVoice } = useAiAssist();
  const isVoiceActive = livePhase !== 'idle' && livePhase !== 'error';

  // Click-to-toggle. Press-and-hold used to stop on pointerup/leave, which
  // called MediaStreamTrack.stop() and tore down Continuity / iPhone-as-mic
  // the moment the cursor left the tiny mic button.
  const handleVoiceClick = () => {
    if (isVoiceActive) stopVoice();
    else void startVoice();
  };
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // The provider currently does not expose its feature flag. A missing page context
  // is therefore treated as unavailable too, preventing a request without scope.
  const isAvailable = enabled && pageContext !== null;
  const suggestions = pageContext
    ? SUGGESTIONS[pageContext.route]
      || (pageContext.route === '/dashboard' || pageContext.route.startsWith('/projects')
        ? SUGGESTIONS['/projects']
        : pageContext.route.startsWith('/sales')
          ? SUGGESTIONS['/sales']
          : [])
    : [];
  const viewing = describeAiPage(pageContext);
  const lastMessage = messages[messages.length - 1];

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Stack alignItems="center" direction="row" spacing={1}>
          <Typography component="h2" variant="h6">IOCT Assist</Typography>
          <Chip label="Read only" size="small" />
          {viewing ? <Chip label={`Now viewing ${viewing}`} size="small" variant="outlined" /> : null}
          {isVoiceActive && <Chip color="primary" label="Live" size="small" />}
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
            <AiLiveStatus micLevel={micLevel} phase={livePhase} />
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
              <IconButton
                aria-label={isVoiceActive ? 'Stop live session' : 'Start live voice'}
                color={isVoiceActive ? 'primary' : 'default'}
                disabled={isLoading}
                onClick={handleVoiceClick}
              >
                <MicIcon />
              </IconButton>
              {isLoading && <Button onClick={stop}>Stop</Button>}
            </Stack>
          </Stack>
          <AiComposer
            disabled={isLoading || isVoiceActive}
            liveMode={isVoiceActive}
            onSend={(text) => send(text, pageContext)}
          />
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
