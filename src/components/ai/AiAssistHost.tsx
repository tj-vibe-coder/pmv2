import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { parseAiPageContext } from '../../ai/pageContext';
import { applyAiNavigation } from '../../ai/navigate';
import { AiAssistProvider } from './AiAssistProvider';
import AiAssistDrawer from './AiAssistDrawer';
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
      {children}
      {enabled && (
        <>
          <AiAssistLauncher />
          <AiAssistDrawer
            pageContext={pageContext}
            enabled={enabled}
            onNavigateSource={onNavigateRoute}
          />
        </>
      )}
    </AiAssistProvider>
  );
}
