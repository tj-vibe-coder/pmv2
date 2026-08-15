import { float32ToPcm16Le, pcm16LeToFloat32, downsampleMono, arrayBufferToBase64, base64ToArrayBuffer, rmsLevel } from './audio/pcm';

const MIC_LEVEL_INTERVAL_MS = 50;

export type LivePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error';

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

/** Minimal surfaces this module depends on — real browser/SDK objects satisfy
 *  these structurally; tests inject fakes. Kept deliberately narrow so the
 *  state-machine logic (race guards, interruption, scheduling) is fully
 *  unit-testable without a real AudioContext/WebSocket (neither exists in
 *  jsdom). The actual `connectSession` wiring against @google/genai's
 *  browser `ai.live.connect(...)` is NOT unit-tested here — see the
 *  server-side geminiClient.js/liveToken.js precedent for why: it needs
 *  manual runtime verification, tracked as a required gate before enabling
 *  voice in production. */
export interface MediaStreamLike {
  getTracks(): { stop(): void }[];
}

export interface CaptureNodeLike {
  onFrame: ((frame: Float32Array) => void) | null;
  disconnect(): void;
}

export interface CaptureContextLike {
  sampleRate: number;
  createCaptureNode(stream: MediaStreamLike): CaptureNodeLike;
  close(): Promise<void>;
}

export interface AudioSourceLike {
  onended: (() => void) | null;
  start(when: number): void;
  stop(): void;
}

export interface PlaybackContextLike {
  readonly currentTime: number;
  createSourceFromPcm16(pcm: Float32Array, sampleRate: number): AudioSourceLike;
  close(): Promise<void>;
}

export interface LiveSessionLike {
  sendRealtimeInputPcm(base64Pcm: string): void;
  sendToolResponse(callId: string, name: string, response: unknown): void;
  sendClientContent?(params: { turns: unknown; turnComplete: boolean }): void;
  close(): void;
}

export interface LiveTranscriptEvent {
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
}

export interface LiveServerContentEvent {
  audioBase64?: string;
  interrupted?: boolean;
  turnComplete?: boolean;
  inputText?: string;
  inputDone?: boolean;
  outputText?: string;
  outputDone?: boolean;
}

/** Merge a Live transcription update into the text shown so far.
 *  Gemini may send either a cumulative string or a delta. */
export function mergeTranscript(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return previous + incoming;
}

const SPOKEN_STOP_PHRASES = [
  'stop listening',
  "that's all",
  'thats all',
  'stop assist',
  'end voice',
  'cancel voice',
];

const SPOKEN_CONFIRM_PHRASES = [
  'apply that',
  'apply that change',
  'yes apply',
  'confirm change',
  'save that',
];

const SPOKEN_REJECT_PHRASES = [
  "don't apply",
  'dont apply',
  'do not apply',
  'reject that',
  'cancel that change',
  'never mind',
  'nevermind',
];

function cleanSpoken(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSpokenStop(text: string): boolean {
  const cleaned = cleanSpoken(text);
  if (!cleaned) return false;
  return SPOKEN_STOP_PHRASES.some((phrase) => cleaned.includes(phrase));
}

export function isSpokenConfirm(text: string): boolean {
  const cleaned = cleanSpoken(text);
  if (!cleaned) return false;
  return SPOKEN_CONFIRM_PHRASES.some((phrase) => cleaned.includes(phrase));
}

export function isSpokenReject(text: string): boolean {
  const cleaned = cleanSpoken(text);
  if (!cleaned) return false;
  return SPOKEN_REJECT_PHRASES.some((phrase) => cleaned.includes(phrase));
}

export interface LiveClientDeps {
  getUserMedia(): Promise<MediaStreamLike>;
  createCaptureContext(): CaptureContextLike;
  createPlaybackContext(): PlaybackContextLike;
  connectSession(handlers: {
    onServerContent(content: LiveServerContentEvent): void;
    onToolCall(call: { name: string; args: Record<string, unknown>; id: string }): void;
    onClose(): void;
    onError(): void;
  }): Promise<LiveSessionLike>;
  onExecuteTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  onPhaseChange(phase: LivePhase): void;
  onTranscript?(event: LiveTranscriptEvent): void;
  onMicLevel?(level: number): void;
  maxSessionMs?: number;
  onSessionExpired?: () => void;
}

export function createLiveClient(deps: LiveClientDeps) {
  let operationId = 0;
  let userStopped = false;
  let reconnectsUsed = 0;
  let reconnecting = false;
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  let mediaStream: MediaStreamLike | null = null;
  let captureContext: CaptureContextLike | null = null;
  let captureNode: CaptureNodeLike | null = null;
  let playbackContext: PlaybackContextLike | null = null;
  let session: LiveSessionLike | null = null;
  let activeSources: AudioSourceLike[] = [];
  let nextPlayTime = 0;
  let phase: LivePhase = 'idle';
  let userTranscript = '';
  let assistantTranscript = '';
  let lastMicLevelAt = 0;
  let pendingUserTexts: string[] = [];

  function setPhase(next: LivePhase) {
    phase = next;
    deps.onPhaseChange(next);
  }

  let lastTranscript: { role: 'user' | 'assistant'; text: string } | null = null;

  function emitTranscript(role: 'user' | 'assistant', text: string, done: boolean) {
    const trimmed = text.trim();
    if (!trimmed && !done) return;
    if (!trimmed) return;
    if (lastTranscript && lastTranscript.role === role && lastTranscript.text === trimmed) return;
    lastTranscript = { role, text: trimmed };
    deps.onTranscript?.({ role, text: trimmed, done });
  }

  function resetTranscripts() {
    userTranscript = '';
    assistantTranscript = '';
    lastTranscript = null;
  }

  function emitMicLevel(level: number, force = false) {
    const now = Date.now();
    if (!force && now - lastMicLevelAt < MIC_LEVEL_INTERVAL_MS) return;
    lastMicLevelAt = now;
    deps.onMicLevel?.(level);
  }

  function releaseStream(stream: MediaStreamLike | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function watchTracks(stream: MediaStreamLike, myOperation: number) {
    stream.getTracks().forEach((track) => {
      const listener = track as { addEventListener?: (type: string, fn: () => void) => void };
      listener.addEventListener?.('ended', () => {
        if (myOperation !== operationId) return;
        stop('error');
      });
    });
  }

  function stopAllSources() {
    for (const source of activeSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Already stopped/ended — ignore.
      }
    }
    activeSources = [];
  }

  function attachCapture(myOperation: number) {
    if (!captureNode || !captureContext) return;
    const capture = captureContext;
    captureNode.onFrame = (frame) => {
      if (myOperation !== operationId || !session) return;
      emitMicLevel(rmsLevel(frame));
      const downsampled = downsampleMono(frame, capture.sampleRate, CAPTURE_SAMPLE_RATE);
      const base64 = arrayBufferToBase64(float32ToPcm16Le(downsampled));
      session.sendRealtimeInputPcm(base64);
    };
  }

  function createSessionHandlers(myOperation: number) {
    return {
      onServerContent: (content: LiveServerContentEvent) => handleServerContent(myOperation, content),
      onToolCall: (call: { name: string; args: Record<string, unknown>; id: string }) => handleToolCall(myOperation, call),
      onClose: () => {
        if (myOperation !== operationId) return;
        if (reconnecting) return;
        if (!userStopped) {
          void attemptReconnect(myOperation);
        } else {
          setPhase('idle');
        }
      },
      onError: () => {
        if (myOperation === operationId) setPhase('error');
      },
    };
  }

  async function attemptReconnect(myOperation: number): Promise<void> {
    if (myOperation !== operationId || userStopped) return;
    if (reconnectsUsed >= 1) {
      stop('error');
      return;
    }
    reconnectsUsed += 1;
    reconnecting = true;
    setPhase('reconnecting');

    session?.close();
    session = null;
    if (captureNode) {
      captureNode.onFrame = null;
    }

    let newSession: LiveSessionLike;
    try {
      newSession = await deps.connectSession(createSessionHandlers(myOperation));
    } catch {
      reconnecting = false;
      if (myOperation === operationId && !userStopped) {
        stop('error');
      }
      return;
    }

    if (myOperation !== operationId || userStopped) {
      reconnecting = false;
      newSession.close();
      return;
    }

    session = newSession;
    reconnecting = false;
    if (playbackContext) {
      nextPlayTime = playbackContext.currentTime;
    }
    attachCapture(myOperation);
    flushPendingUserTexts();
    setPhase('listening');
  }

  function armSessionTimer() {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    const maxMs = deps.maxSessionMs ?? 600000;
    if (maxMs > 0 && maxMs !== Infinity) {
      sessionTimer = setTimeout(() => {
        stop('idle');
        deps.onSessionExpired?.();
      }, maxMs);
    }
  }

  async function start(): Promise<void> {
    userStopped = false;
    reconnectsUsed = 0;
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    operationId += 1;
    const myOperation = operationId;
    resetTranscripts();
    setPhase('connecting');

    // Open audio contexts inside the originating user gesture. Awaiting
    // getUserMedia() (permission prompt) first leaves them suspended.
    const capture = deps.createCaptureContext();
    playbackContext = playbackContext || deps.createPlaybackContext();

    let stream: MediaStreamLike;
    try {
      stream = await deps.getUserMedia();
    } catch {
      await capture.close();
      if (myOperation === operationId) setPhase('error');
      return;
    }
    if (myOperation !== operationId) {
      // A stop()/start() raced us while awaiting mic permission — release
      // the stream we just acquired and go no further.
      await capture.close();
      releaseStream(stream);
      return;
    }
    mediaStream = stream;
    watchTracks(stream, myOperation);

    const node = capture.createCaptureNode(stream);
    if (myOperation !== operationId) {
      node.disconnect();
      await capture.close();
      releaseStream(stream);
      return;
    }
    captureContext = capture;
    captureNode = node;

    let newSession: LiveSessionLike;
    try {
      newSession = await deps.connectSession(createSessionHandlers(myOperation));
    } catch {
      if (myOperation === operationId) {
        node.disconnect();
        await capture.close();
        releaseStream(stream);
        setPhase('error');
      }
      return;
    }
    if (myOperation !== operationId) {
      newSession.close();
      node.disconnect();
      await capture.close();
      releaseStream(stream);
      return;
    }
    session = newSession;
    nextPlayTime = playbackContext.currentTime;
    flushPendingUserTexts();
    attachCapture(myOperation);

    setPhase('listening');
    armSessionTimer();
  }

  function handleServerContent(
    myOperation: number,
    content: LiveServerContentEvent,
  ) {
    if (myOperation !== operationId) return;
    if (content.interrupted) {
      stopAllSources();
      if (playbackContext) nextPlayTime = playbackContext.currentTime;
      setPhase('interrupted');
      return;
    }
    if (content.inputText) {
      userTranscript = mergeTranscript(userTranscript, content.inputText);
      emitTranscript('user', userTranscript, Boolean(content.inputDone));
      if (content.inputDone) userTranscript = '';
    }
    if (content.outputText) {
      assistantTranscript = mergeTranscript(assistantTranscript, content.outputText);
      emitTranscript('assistant', assistantTranscript, Boolean(content.outputDone));
      if (content.outputDone) assistantTranscript = '';
    }
    if (content.audioBase64 && playbackContext) {
      const pcmFloat = pcm16LeToFloat32(base64ToArrayBuffer(content.audioBase64));
      const source = playbackContext.createSourceFromPcm16(pcmFloat, PLAYBACK_SAMPLE_RATE);
      const startAt = Math.max(nextPlayTime, playbackContext.currentTime);
      const durationSeconds = pcmFloat.length / PLAYBACK_SAMPLE_RATE;
      source.onended = () => {
        activeSources = activeSources.filter((s) => s !== source);
      };
      source.start(startAt);
      activeSources.push(source);
      nextPlayTime = startAt + durationSeconds;
      setPhase('speaking');
    }
    if (content.turnComplete) {
      if (userTranscript) {
        emitTranscript('user', userTranscript, true);
        userTranscript = '';
      }
      if (assistantTranscript) {
        emitTranscript('assistant', assistantTranscript, true);
        assistantTranscript = '';
      }
      setPhase('listening');
    }
  }

  async function handleToolCall(myOperation: number, call: { name: string; args: Record<string, unknown>; id: string }) {
    if (myOperation !== operationId || !session) return;
    setPhase('thinking');
    let result: unknown;
    try {
      result = await deps.onExecuteTool(call.name, call.args);
    } catch {
      result = { error: 'tool_error' };
    }
    if (myOperation !== operationId || !session) return;
    session.sendToolResponse(call.id, call.name, result);
  }

  function stop(nextPhase: LivePhase = 'idle'): void {
    userStopped = true;
    reconnecting = false;
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    operationId += 1; // invalidates any in-flight start()
    stopAllSources();
    session?.close();
    session = null;
    captureNode?.disconnect();
    captureNode = null;
    void captureContext?.close();
    captureContext = null;
    releaseStream(mediaStream);
    mediaStream = null;
    nextPlayTime = playbackContext ? playbackContext.currentTime : 0;
    if (userTranscript) emitTranscript('user', userTranscript, true);
    if (assistantTranscript) emitTranscript('assistant', assistantTranscript, true);
    resetTranscripts();
    emitMicLevel(0, true);
    pendingUserTexts = [];
    setPhase(nextPhase);
  }

  function getPhase(): LivePhase {
    return phase;
  }

  function sendClientTurn(text: string, turnComplete: boolean): void {
    session?.sendClientContent?.({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete,
    });
  }

  function flushPendingUserTexts(): void {
    if (!session || pendingUserTexts.length === 0) return;
    const queued = pendingUserTexts;
    pendingUserTexts = [];
    for (const text of queued) sendClientTurn(text, true);
  }

  function sendPageContext(text: string): void {
    if (!session || !text) return;
    sendClientTurn(text, false);
  }

  function sendUserText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!session) {
      pendingUserTexts.push(trimmed);
      return;
    }
    sendClientTurn(trimmed, true);
  }

  return { start, stop, getPhase, sendPageContext, sendUserText };
}
