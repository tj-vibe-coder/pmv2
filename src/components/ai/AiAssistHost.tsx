import React, { useCallback, useMemo } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { parseAiPageContext } from '../../ai/pageContext';
import { applyAiNavigation } from '../../ai/navigate';
import { AiAssistProvider, useAiAssist } from './AiAssistProvider';
import AiAssistDrawer, { AI_ASSIST_DESKTOP_WIDTH_PX } from './AiAssistDrawer';
import AiAssistLauncher from './AiAssistLauncher';

// UI gate only — the server independently re-checks the RJR/TJC allowlist on
// every AI Assist request, so a stale/incorrect client-side list here can
// only hide or show the launcher, never grant real access.
const AI_ASSIST_ALLOWED_USERNAMES = ['RJR', 'TJC'];

interface AiAssistHostProps {
  children: React.ReactNode;
}

export default function AiAssistHost({ children }: AiAssistHostProps): React.ReactElement {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = !!user && AI_ASSIST_ALLOWED_USERNAMES.includes(String(user.username || '').toUpperCase());
  const pageContext = useMemo(() => parseAiPageContext(location.pathname), [location.pathname]);
  const onNavigateRoute = useCallback((route: string) => {
    applyAiNavigation(navigate, route);
  }, [navigate]);

  return (
    <AiAssistProvider enabled={enabled} pageContext={pageContext} onNavigateRoute={onNavigateRoute}>
      <AssistChrome enabled={enabled} onNavigateSource={onNavigateRoute} pageContext={pageContext}>
        {children}
      </AssistChrome>
    </AiAssistProvider>
  );
}

function AssistChrome({
  children,
  enabled,
  pageContext,
  onNavigateSource,
}: {
  children: React.ReactNode;
  enabled: boolean;
  pageContext: ReturnType<typeof parseAiPageContext>;
  onNavigateSource: (route: string) => void;
}): React.ReactElement {
  const { isOpen } = useAiAssist();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const docked = enabled && isOpen && !isMobile;

  return (
    <>
      <Box
        sx={{
          minHeight: '100%',
          pr: docked ? `${AI_ASSIST_DESKTOP_WIDTH_PX}px` : 0,
          transition: theme.transitions.create('padding-right', {
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {children}
      </Box>
      {enabled && (
        <>
          <AiAssistLauncher />
          <AiAssistDrawer
            pageContext={pageContext}
            enabled={enabled}
            onNavigateSource={onNavigateSource}
          />
        </>
      )}
    </>
  );
}
