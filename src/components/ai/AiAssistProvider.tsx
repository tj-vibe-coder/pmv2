import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import type { AiMessage, AiPageContext } from '../../types/AiAssist';
import { sendAiChat, AiAssistError } from '../../services/aiAssistService';
import { createLiveClient, LivePhase } from '../../ai/liveClient';
import * as liveSession from '../../ai/liveSession';

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
  startVoice: () => Promise<void>;
  stopVoice: () => void;
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
}

export function AiAssistProvider({ children, enabled }: AiAssistProviderProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const liveClientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);

  const getLiveClient = useCallback(() => {
    if (!liveClientRef.current) {
      liveClientRef.current = createLiveClient({
        getUserMedia: liveSession.getUserMedia,
        createCaptureContext: liveSession.createCaptureContext,
        createPlaybackContext: liveSession.createPlaybackContext,
        connectSession: liveSession.connectSession,
        onExecuteTool: liveSession.executeLiveToolCall,
        onPhaseChange: setLivePhase,
      });
    }
    return liveClientRef.current;
  }, []);

  const startVoice = useCallback(async () => {
    await getLiveClient().start();
  }, [getLiveClient]);

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
    const userMessage: AiMessage = { id: nextId(), role: 'user', text: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    await performSend(nextMessages, pageContext);
  }, [isLoading, messages, performSend]);

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
    startVoice,
    stopVoice,
  };

  return <AiAssistContext.Provider value={value}>{children}</AiAssistContext.Provider>;
}
