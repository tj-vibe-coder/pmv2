import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import type { AiCitation, AiMessage, AiPageContext } from '../../types/AiAssist';
import { sendAiChat, AiAssistError } from '../../services/aiAssistService';
import { createLiveClient, LivePhase, LiveTranscriptEvent, mergeTranscript } from '../../ai/liveClient';
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
  const abortRef = useRef<AbortController | null>(null);
  const liveClientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const voiceUserIdRef = useRef<string | null>(null);
  const voiceAssistantIdRef = useRef<string | null>(null);
  const pendingVoiceCitationsRef = useRef<AiCitation[]>([]);
  const pageContextRef = useRef<AiPageContext | null>(pageContext);
  const onNavigateRouteRef = useRef(onNavigateRoute);
  pageContextRef.current = pageContext;
  onNavigateRouteRef.current = onNavigateRoute;

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
          const dest = navigationRouteFromToolResult(name, result);
          if (dest) onNavigateRouteRef.current?.(dest);
          return result;
        },
        onPhaseChange: (phase) => {
          setLivePhase(phase);
          if (phase === 'idle' || phase === 'error') setMicLevel(0);
        },
        onTranscript: applyVoiceTranscript,
        onMicLevel: setMicLevel,
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
    voiceUserIdRef.current = null;
    voiceAssistantIdRef.current = null;
    pendingVoiceCitationsRef.current = [];
  }, [abortActive]);

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
      const answer = await sendAiChat(toHistory(historyMessages), pageContext, controller.signal);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: answer.answer, citations: answer.citations, notice: answer.notice },
      ]);
      if (answer.navigateTo?.route) {
        const dest = resolveAiNavigatePath(answer.navigateTo.route);
        if (dest) onNavigateRouteRef.current?.(dest);
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
    if (!trimmed || isLoading) return;
    stopVoice();
    const userMessage: AiMessage = { id: nextId(), role: 'user', text: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    await performSend(nextMessages, pageContext);
  }, [isLoading, messages, performSend, stopVoice]);

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
  };

  return <AiAssistContext.Provider value={value}>{children}</AiAssistContext.Provider>;
}
