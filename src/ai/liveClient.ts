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
}

export function createLiveClient(deps: LiveClientDeps) {
  let operationId = 0;
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

  async function start(): Promise<void> {
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
      newSession = await deps.connectSession({
        onServerContent: (content) => handleServerContent(myOperation, content),
        onToolCall: (call) => handleToolCall(myOperation, call),
        onClose: () => {
          if (myOperation === operationId) setPhase('idle');
        },
        onError: () => {
          if (myOperation === operationId) setPhase('error');
        },
      });
    } catch {
      if (myOperation === operationId) {
        node.disconnect();
        await capture.close();
        setPhase('error');
      }
      return;
    }
    if (myOperation !== operationId) {
      newSession.close();
      node.disconnect();
      await capture.close();
      return;
    }
    session = newSession;
    nextPlayTime = playbackContext.currentTime;

    node.onFrame = (frame) => {
      if (myOperation !== operationId || !session) return;
      emitMicLevel(rmsLevel(frame));
      const downsampled = downsampleMono(frame, capture.sampleRate, CAPTURE_SAMPLE_RATE);
      const base64 = arrayBufferToBase64(float32ToPcm16Le(downsampled));
      session.sendRealtimeInputPcm(base64);
    };

    setPhase('listening');
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
    setPhase(nextPhase);
  }

  function getPhase(): LivePhase {
    return phase;
  }

  function sendPageContext(text: string): void {
    if (!session || !text) return;
    session.sendClientContent?.({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: false,
    });
  }

  return { start, stop, getPhase, sendPageContext };
}
