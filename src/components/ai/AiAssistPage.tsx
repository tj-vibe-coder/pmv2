import React, { useEffect, useMemo } from 'react';
import { Box, Button, Chip, Divider, IconButton, Stack, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseAiPageContext } from '../../ai/pageContext';
import { applyAiNavigation } from '../../ai/navigate';
import { useAiAssist } from './AiAssistProvider';
import AiComposer from './AiComposer';
import AiLiveStatus from './AiLiveStatus';
import AiMessageList from './AiMessageList';
import AiProposalCard from './AiProposalCard';
import AiChartPanel from './AiChartPanel';

const CONVERSATION_WIDTH_PX = 420;

export default function AiAssistPage(): React.ReactElement {
  const {
    enabled, messages, isLoading, send, stop, retry, clear, close,
    livePhase, micLevel, startVoice, stopVoice,
    pendingProposal, proposalBusy, confirmProposal, rejectProposal,
  } = useAiAssist();
  const isVoiceActive = livePhase !== 'idle' && livePhase !== 'error';
  const location = useLocation();
  const navigate = useNavigate();
  const pageContext = useMemo(() => parseAiPageContext(location.pathname), [location.pathname]);
  const onNavigateSource = (route: string) => { applyAiNavigation(navigate, route); };

  // This page shows the same conversation full-width — the docked side
  // drawer would otherwise sit open behind it, duplicating the chat.
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close's identity changes every provider render; only run once on mount
  }, []);

  const handleVoiceClick = () => {
    if (isVoiceActive) stopVoice();
    else void startVoice();
  };

  const lastMessage = messages[messages.length - 1];
  const lastChart = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role === 'assistant' && message.chart) return message.chart;
    }
    return null;
  }, [messages]);

  if (!enabled) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">IOCT Assist is not available for this account.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" sx={{ px: 3, py: 2 }}>
        <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 600 }}>IOCT Assist</Typography>
          <Chip label="Read only" size="small" />
          {isVoiceActive && <Chip color="primary" label="Always on" size="small" />}
        </Stack>
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
          <Button onClick={clear}>New conversation</Button>
        </Stack>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
        <Box
          sx={{
            width: { xs: '100%', md: CONVERSATION_WIDTH_PX },
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: { md: '1px solid' },
            borderColor: { md: 'divider' },
            minHeight: 0,
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
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
                const target = chart.tool === 'get_expense_summary' ? '/finance/analytics' : '/projects/analytics';
                navigate(target, { state: { chart } });
              }}
            />
            {lastMessage?.role === 'error' && (
              <Button onClick={() => retry(pageContext)} sx={{ mt: 1 }}>Retry</Button>
            )}
          </Box>
          <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
            <AiComposer
              disabled={isLoading && !isVoiceActive}
              liveMode={isVoiceActive}
              onSend={(text) => send(text, pageContext)}
            />
          </Box>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3 }}>
          {lastChart ? (
            <AiChartPanel
              chart={lastChart}
              onOpenStudio={(chart) => {
                const target = chart.tool === 'get_expense_summary' ? '/finance/analytics' : '/projects/analytics';
                navigate(target, { state: { chart } });
              }}
            />
          ) : (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">
                Ask a comparison question (e.g. "compare project balances by status") to see a chart here.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
