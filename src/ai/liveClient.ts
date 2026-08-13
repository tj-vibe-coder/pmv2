import { float32ToPcm16Le, pcm16LeToFloat32, downsampleMono, arrayBufferToBase64, base64ToArrayBuffer } from './audio/pcm';

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
  close(): void;
}

export interface LiveClientDeps {
  getUserMedia(): Promise<MediaStreamLike>;
  createCaptureContext(): CaptureContextLike;
  createPlaybackContext(): PlaybackContextLike;
  connectSession(handlers: {
    onServerContent(content: { audioBase64?: string; interrupted?: boolean; turnComplete?: boolean }): void;
    onToolCall(call: { name: string; args: Record<string, unknown>; id: string }): void;
    onClose(): void;
    onError(): void;
  }): Promise<LiveSessionLike>;
  onExecuteTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  onPhaseChange(phase: LivePhase): void;
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

  function setPhase(next: LivePhase) {
    phase = next;
    deps.onPhaseChange(next);
  }

  function releaseStream(stream: MediaStreamLike | null) {
    stream?.getTracks().forEach((track) => track.stop());
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
    setPhase('connecting');

    let stream: MediaStreamLike;
    try {
      stream = await deps.getUserMedia();
    } catch {
      if (myOperation === operationId) setPhase('error');
      return;
    }
    if (myOperation !== operationId) {
      // A stop()/start() raced us while awaiting mic permission — release
      // the stream we just acquired and go no further.
      releaseStream(stream);
      return;
    }
    mediaStream = stream;

    const capture = deps.createCaptureContext();
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
        setPhase('error');
      }
      return;
    }
    if (myOperation !== operationId) {
      newSession.close();
      node.disconnect();
      return;
    }
    session = newSession;
    playbackContext = playbackContext || deps.createPlaybackContext();
    nextPlayTime = playbackContext.currentTime;

    node.onFrame = (frame) => {
      if (myOperation !== operationId || !session) return;
      const downsampled = downsampleMono(frame, capture.sampleRate, CAPTURE_SAMPLE_RATE);
      const base64 = arrayBufferToBase64(float32ToPcm16Le(downsampled));
      session.sendRealtimeInputPcm(base64);
    };

    setPhase('listening');
  }

  function handleServerContent(
    myOperation: number,
    content: { audioBase64?: string; interrupted?: boolean; turnComplete?: boolean },
  ) {
    if (myOperation !== operationId) return;
    if (content.interrupted) {
      stopAllSources();
      if (playbackContext) nextPlayTime = playbackContext.currentTime;
      setPhase('interrupted');
      return;
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

  function stop(): void {
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
    setPhase('idle');
  }

  function getPhase(): LivePhase {
    return phase;
  }

  return { start, stop, getPhase };
}
