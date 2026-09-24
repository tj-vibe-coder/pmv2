import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  SwipeableDrawer,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import type { AiHealthResponse, AiPageContext } from '../../types/AiAssist';
import { describeAiPage } from '../../ai/pageContext';
import { fetchAiHealth } from '../../services/aiAssistService';
import { useAiAssist } from './AiAssistProvider';
import AiComposer from './AiComposer';
import AiLiveStatus from './AiLiveStatus';
import AiMessageList from './AiMessageList';
import AiProposalCard from './AiProposalCard';

export const AI_ASSIST_DESKTOP_WIDTH_PX = 420;

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
  const {
    isOpen, open, close, messages, isLoading, send, stop, retry, clear,
    livePhase, micLevel, startVoice, stopVoice,
    pendingProposal, proposalBusy, confirmProposal, rejectProposal,
  } = useAiAssist();
  const isVoiceActive = livePhase !== 'idle' && livePhase !== 'error';
  const [health, setHealth] = useState<AiHealthResponse | null>(null);

  useEffect(() => {
    if (!isOpen || !enabled) return;
    let cancelled = false;
    fetchAiHealth()
      .then((next) => {
        if (!cancelled) setHealth(next);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => { cancelled = true; };
  }, [isOpen, enabled]);

  // Click-to-toggle. Press-and-hold used to stop on pointerup/leave, which
  // called MediaStreamTrack.stop() and tore down Continuity / iPhone-as-mic
  // the moment the cursor left the tiny mic button.
  const handleVoiceClick = () => {
    if (isVoiceActive) stopVoice();
    else void startVoice();
  };
  const theme = useTheme();
  const navigate = useNavigate();
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
      {isMobile && (
        <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
          <Box sx={{ bgcolor: 'grey.400', borderRadius: 2, height: 4, width: 36 }} />
        </Box>
      )}
      <Stack alignItems="center" direction="row" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
          <Typography component="h2" variant="h6">IOCT Assist</Typography>
          <Chip label="Read only" size="small" />
          {health ? (
            <Chip label={`${health.chatProvider} · ${health.chatModel}`} size="small" variant="outlined" />
          ) : null}
          {viewing ? <Chip label={`Now viewing ${viewing}`} size="small" variant="outlined" /> : null}
          {isVoiceActive && <Chip color="primary" label="Always on" size="small" />}
        </Stack>
        <Stack direction="row">
          <IconButton aria-label="Open full view" onClick={() => navigate('/assist')}>
            <OpenInFullIcon fontSize="small" />
          </IconButton>
          <IconButton aria-label="Close IOCT Assist" onClick={close}>
            <CloseIcon />
          </IconButton>
        </Stack>
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
            {pendingProposal ? (
              <AiProposalCard
                busy={proposalBusy}
                onConfirm={() => { void confirmProposal(); }}
                onReject={() => { void rejectProposal(); }}
                proposal={pendingProposal}
              />
            ) : null}
            <AiMessageList
              messages={messages}
              onFollowUp={(question) => send(question, pageContext)}
              onNavigateSource={onNavigateSource}
              onOpenStudio={(chart) => {
                close();
                const target = chart.tool === 'get_expense_summary' ? '/finance/analytics' : '/projects/analytics';
                navigate(target, { state: { chart } });
              }}
            />
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
            disabled={isLoading && !isVoiceActive}
            liveMode={isVoiceActive}
            onSend={(text) => send(text, pageContext)}
          />
        </Box>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        disableDiscovery
        disableSwipeToOpen
        keepMounted
        onClose={close}
        onOpen={open}
        open={isOpen}
        ModalProps={{
          keepMounted: true,
          hideBackdrop: true,
          disableScrollLock: true,
          disableEnforceFocus: true,
          disableAutoFocus: true,
        }}
        PaperProps={{
          'aria-label': 'IOCT Assist',
          role: 'dialog',
          sx: {
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            boxShadow: 8,
            height: 'min(56dvh, 560px)',
            maxHeight: '56vh',
            pb: 'env(safe-area-inset-bottom)',
          },
        }}
      >
        {content}
      </SwipeableDrawer>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      variant="persistent"
      PaperProps={{
        'aria-label': 'IOCT Assist',
        sx: {
          borderLeft: 1,
          borderColor: 'divider',
          width: AI_ASSIST_DESKTOP_WIDTH_PX,
        },
      }}
    >
      {content}
    </Drawer>
  );
}
