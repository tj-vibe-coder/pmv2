import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import type { AiCitation, AiMessage, AiPageContext, AiPriorToolResult, AiProposal } from '../../types/AiAssist';
import { parseAiProposal } from '../../types/AiAssist';
import { sendAiChat, confirmAiProposal, rejectAiProposal, AiAssistError } from '../../services/aiAssistService';
import { createLiveClient, LivePhase, LiveTranscriptEvent, mergeTranscript, isSpokenStop, isSpokenConfirm, isSpokenReject } from '../../ai/liveClient';
import * as liveSession from '../../ai/liveSession';
import { formatPageContextNote } from '../../ai/pageContext';
import { resolveAiNavigatePath } from '../../ai/navigate';

const VOICE_NOTICE = 'AI-generated summary from IOCT records. Verify before making decisions.';

function asCitations(sources: unknown[]): AiCitation[] {
  return sources.filter((source): source is AiCitation => {
    if (!source || typeof source !== 'object') return false;
    const value = source as Partial<AiCitation>;
    return typeof value.id === 'string'
      && typeof value.label === 'string'
      && typeof value.route === 'string'
      && typeof value.asOf === 'string';
  });
}

interface AiAssistContextType {
  enabled: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  messages: AiMessage[];
  isLoading: boolean;
  send: (text: string, pageContext: AiPageContext | null) => Promise<void>;
  stop: () => void;
  retry: (pageContext: AiPageContext | null) => Promise<void>;
  clear: () => void;
  /** Push-to-talk voice state — 'idle' unless a voice session is active.
   *  startVoice()/stopVoice() are the press/release handlers; see
   *  src/ai/liveClient.ts for the full lifecycle (interruption, race guards,
   *  teardown). Not runtime-verified against a live device/API yet. */
  livePhase: LivePhase;
  micLevel: number;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  sendPageContext: (pageContext: AiPageContext | null) => void;
  pendingProposal: AiProposal | null;
  proposalBusy: boolean;
  confirmProposal: () => Promise<void>;
  rejectProposal: () => Promise<void>;
}

const AiAssistContext = createContext<AiAssistContextType | undefined>(undefined);

export function useAiAssist(): AiAssistContextType {
  const ctx = useContext(AiAssistContext);
  if (!ctx) throw new Error('useAiAssist must be used within an AiAssistProvider');
  return ctx;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ai-msg-${idCounter}`;
}

function toHistory(messages: AiMessage[]): { role: 'user' | 'assistant'; text: string }[] {
  return messages
    .filter((m): m is Extract<AiMessage, { role: 'user' | 'assistant' }> => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, text: m.text }));
}

interface AiAssistProviderProps {
  children: ReactNode;
  /** UI gate only — whether to keep AI Assist state alive at all for this session.
   *  The server independently re-checks authorization on every request; this
   *  flag existing as `true` never grants access on its own. */
  enabled: boolean;
  pageContext?: AiPageContext | null;
  onNavigateRoute?: (route: string) => void;
}

function navigationRouteFromToolResult(name: string, result: unknown): string | null {
  if (name !== 'navigate_to_record' || !result || typeof result !== 'object') return null;
  const value = result as { action?: unknown; route?: unknown };
  if (value.action !== 'navigate' || typeof value.route !== 'string') return null;
  return resolveAiNavigatePath(value.route);
}

function isLiveActive(phase: LivePhase): boolean {
  return phase !== 'idle' && phase !== 'error';
}

const MAX_PRIOR_TOOLS = 8;

function rememberToolResult(list: AiPriorToolResult[], name: string, result: unknown): AiPriorToolResult[] {
  const data = (result && typeof result === 'object') ? result : { value: result };
  return [...list, { name, data }].slice(-MAX_PRIOR_TOOLS);
}

export function AiAssistProvider({
  children,
  enabled,
  pageContext = null,
  onNavigateRoute,
}: AiAssistProviderProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [pendingProposal, setPendingProposal] = useState<AiProposal | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveClientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const voiceUserIdRef = useRef<string | null>(null);
  const voiceAssistantIdRef = useRef<string | null>(null);
  const pendingVoiceCitationsRef = useRef<AiCitation[]>([]);
  const pageContextRef = useRef<AiPageContext | null>(pageContext);
  const onNavigateRouteRef = useRef(onNavigateRoute);
  const livePhaseRef = useRef(livePhase);
  const priorToolResultsRef = useRef<AiPriorToolResult[]>([]);
  const pendingProposalRef = useRef<AiProposal | null>(null);
  const spokenCommandRef = useRef<(text: string) => void>(() => {});
  pageContextRef.current = pageContext;
  onNavigateRouteRef.current = onNavigateRoute;
  livePhaseRef.current = livePhase;

  const applyVoiceTranscript = useCallback((event: LiveTranscriptEvent) => {
    setMessages((prev) => {
      const lastSameRole = [...prev].reverse().find((message) => message.role === event.role);
      const sameUtterance = lastSameRole
        && (lastSameRole.text === event.text
          || lastSameRole.text.startsWith(event.text)
          || event.text.startsWith(lastSameRole.text));

      if (sameUtterance && lastSameRole) {
        const merged = mergeTranscript(lastSameRole.text, event.text);
        if (lastSameRole.role === 'assistant') {
          const citations = pendingVoiceCitationsRef.current;
          if (event.done) pendingVoiceCitationsRef.current = [];
          if (merged === lastSameRole.text && citations.length === 0) return prev;
          return prev.map((message) => (
            message.id === lastSameRole.id
              ? { ...lastSameRole, text: merged, citations: citations.length ? citations : lastSameRole.citations }
              : message
          ));
        }
        if (merged === lastSameRole.text) return prev;
        return prev.map((message) => (
          message.id === lastSameRole.id ? { ...lastSameRole, text: merged } : message
        ));
      }

      if (event.role === 'user') {
        voiceAssistantIdRef.current = null;
        const id = nextId();
        voiceUserIdRef.current = id;
        return [...prev, { id, role: 'user', text: event.text }];
      }

      voiceUserIdRef.current = null;
      const id = nextId();
      voiceAssistantIdRef.current = id;
      const citations = pendingVoiceCitationsRef.current;
      if (event.done) pendingVoiceCitationsRef.current = [];
      return [...prev, {
        id,
        role: 'assistant',
        text: event.text,
        citations,
        notice: VOICE_NOTICE,
        followUps: [],
        chart: null,
      }];
    });
  }, []);

  const getLiveClient = useCallback(() => {
    if (!liveClientRef.current) {
      liveClientRef.current = createLiveClient({
        getUserMedia: liveSession.getUserMedia,
        createCaptureContext: liveSession.createCaptureContext,
        createPlaybackContext: liveSession.createPlaybackContext,
        connectSession: liveSession.connectSession,
        onExecuteTool: async (name, args) => {
          const { result, sources } = await liveSession.executeLiveToolCall(name, args);
          pendingVoiceCitationsRef.current = [
            ...pendingVoiceCitationsRef.current,
            ...asCitations(sources),
          ];
          priorToolResultsRef.current = rememberToolResult(priorToolResultsRef.current, name, result);
          const dest = navigationRouteFromToolResult(name, result);
          if (dest) onNavigateRouteRef.current?.(dest);
          const drafted = parseAiProposal(result);
          if (drafted) {
            pendingProposalRef.current = drafted;
            setPendingProposal(drafted);
          }
          return result;
        },
        onPhaseChange: (phase) => {
          livePhaseRef.current = phase;
          setLivePhase(phase);
          if (phase === 'idle' || phase === 'error') setMicLevel(0);
        },
        onTranscript: (event) => {
          applyVoiceTranscript(event);
          if (event.role === 'user' && event.done) {
            spokenCommandRef.current(event.text);
          }
        },
        onMicLevel: setMicLevel,
        onSessionExpired: () => {
          setMessages((prev) => [...prev, {
            id: nextId(),
            role: 'error',
            text: 'Voice session timed out after 10 minutes. Tap the mic to start again.',
          }]);
        },
      });
    }
    return liveClientRef.current;
  }, [applyVoiceTranscript]);

  const sendPageContext = useCallback((next: AiPageContext | null) => {
    liveClientRef.current?.sendPageContext(formatPageContextNote(next));
  }, []);

  const startVoice = useCallback(async () => {
    const client = getLiveClient();
    await client.start();
    client.sendPageContext(formatPageContextNote(pageContextRef.current));
  }, [getLiveClient]);

  useEffect(() => {
    sendPageContext(pageContext);
  }, [pageContext, sendPageContext]);

  const stopVoice = useCallback(() => {
    liveClientRef.current?.stop();
  }, []);

  const abortActive = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    abortActive();
    setMessages([]);
    setIsLoading(false);
    setPendingProposal(null);
    pendingProposalRef.current = null;
    setProposalBusy(false);
    voiceUserIdRef.current = null;
    voiceAssistantIdRef.current = null;
    pendingVoiceCitationsRef.current = [];
    priorToolResultsRef.current = [];
  }, [abortActive]);

  const confirmProposal = useCallback(async () => {
    const draft = pendingProposalRef.current;
    if (!draft || proposalBusy) return;
    setProposalBusy(true);
    try {
      await confirmAiProposal(draft.proposalId);
      pendingProposalRef.current = null;
      setPendingProposal(null);
      setMessages((prev) => [...prev, {
        id: nextId(),
        role: 'assistant',
        text: `Applied ${draft.field} on ${draft.label || 'the opportunity'}.`,
        citations: [],
        notice: VOICE_NOTICE,
        followUps: [],
        chart: null,
      }]);
    } catch (error) {
      const message = error instanceof AiAssistError ? error.message : 'Could not apply that draft.';
      setMessages((prev) => [...prev, { id: nextId(), role: 'error', text: message }]);
    } finally {
      setProposalBusy(false);
    }
  }, [proposalBusy]);

  const rejectProposal = useCallback(async () => {
    const draft = pendingProposalRef.current;
    if (!draft || proposalBusy) return;
    setProposalBusy(true);
    try {
      await rejectAiProposal(draft.proposalId);
    } catch {
      // Discard locally even if the server draft already expired.
    }
    pendingProposalRef.current = null;
    setPendingProposal(null);
    setProposalBusy(false);
    setMessages((prev) => [...prev, {
      id: nextId(),
      role: 'assistant',
      text: 'Draft discarded. Nothing was saved.',
      citations: [],
      notice: VOICE_NOTICE,
      followUps: [],
      chart: null,
    }]);
  }, [proposalBusy]);

  const handleSpokenCommand = useCallback((text: string) => {
    if (isSpokenStop(text)) {
      stopVoice();
      return true;
    }
    if (pendingProposalRef.current && isSpokenConfirm(text)) {
      void confirmProposal();
      return true;
    }
    if (pendingProposalRef.current && isSpokenReject(text)) {
      void rejectProposal();
      return true;
    }
    return false;
  }, [confirmProposal, rejectProposal, stopVoice]);
  spokenCommandRef.current = handleSpokenCommand;

  useEffect(() => {
    // Chat history is memory-only in v1 and never persisted — dropping it
    // whenever the feature stops being enabled (e.g. logout) is the whole
    // retention policy. A live voice session must also be torn down here —
    // mic/audio resources must never survive a logout.
    if (!enabled) {
      clear();
      setIsOpen(false);
      stopVoice();
    }
  }, [enabled, clear, stopVoice]);

  useEffect(() => () => {
    abortActive();
    stopVoice();
  }, [abortActive, stopVoice]);

  const performSend = useCallback(async (historyMessages: AiMessage[], pageContext: AiPageContext | null) => {
    abortActive();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const answer = await sendAiChat(
        toHistory(historyMessages),
        pageContext,
        controller.signal,
        priorToolResultsRef.current,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: answer.answer,
          citations: answer.citations,
          notice: answer.notice,
          followUps: answer.followUps,
          chart: answer.chart ?? null,
        },
      ]);
      if (answer.navigateTo?.route) {
        const dest = resolveAiNavigatePath(answer.navigateTo.route);
        if (dest) onNavigateRouteRef.current?.(dest);
      }
      if (answer.proposal) {
        pendingProposalRef.current = answer.proposal;
        setPendingProposal(answer.proposal);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof AiAssistError ? error.message : 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, { id: nextId(), role: 'error', text: message }]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsLoading(false);
    }
  }, [abortActive]);

  const send = useCallback(async (text: string, pageContext: AiPageContext | null) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (handleSpokenCommand(trimmed)) {
      const userMessage: AiMessage = { id: nextId(), role: 'user', text: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      return;
    }
    if (isLiveActive(livePhaseRef.current)) {
      const userMessage: AiMessage = { id: nextId(), role: 'user', text: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      getLiveClient().sendUserText(trimmed);
      return;
    }
    if (isLoading) return;
    const userMessage: AiMessage = { id: nextId(), role: 'user', text: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    await performSend(nextMessages, pageContext);
  }, [getLiveClient, handleSpokenCommand, isLoading, messages, performSend]);

  const stop = useCallback(() => {
    abortActive();
    setIsLoading(false);
  }, [abortActive]);

  const retry = useCallback(async (pageContext: AiPageContext | null) => {
    if (isLoading) return;
    // Drop a trailing error bubble (if any) so a repeated failure doesn't pile
    // up, but resend the SAME history — retry must not add a new user bubble.
    const base = messages.length && messages[messages.length - 1].role === 'error'
      ? messages.slice(0, -1)
      : messages;
    if (!base.some((m) => m.role === 'user')) return;
    setMessages(base);
    await performSend(base, pageContext);
  }, [isLoading, messages, performSend]);

  const value: AiAssistContextType = {
    enabled,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    messages,
    isLoading,
    send,
    stop,
    retry,
    clear,
    livePhase,
    micLevel,
    startVoice,
    stopVoice,
    sendPageContext,
    pendingProposal,
    proposalBusy,
    confirmProposal,
    rejectProposal,
  };

  return <AiAssistContext.Provider value={value}>{children}</AiAssistContext.Provider>;
}
