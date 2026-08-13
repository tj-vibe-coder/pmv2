// Real browser wiring for src/ai/liveClient.ts's dependency-injected
// interfaces: microphone capture via AudioWorklet, 24kHz playback scheduling,
// and the actual @google/genai browser Live API connection. This file makes
// real browser/network calls and is intentionally NOT unit-tested (liveClient
// tests inject fakes for all of this). It has not been runtime-verified
// against a live device/API — required before enabling voice in production,
// same caveat as server/aiAssist/geminiClient.js and liveToken.js.

import { GoogleGenAI } from '@google/genai';
import type { CaptureContextLike, CaptureNodeLike, MediaStreamLike, PlaybackContextLike, AudioSourceLike, LiveSessionLike } from './liveClient';
import { requestLiveToken, executeLiveTool } from '../services/aiAssistService';

// Served from public/ai/ (kept byte-identical to src/ai/audio/ — CRA can't
// serve arbitrary src/ files as a fetchable AudioWorklet URL). PUBLIC_URL
// respects a non-root deploy path (e.g. a subpath hosting override).
const CAPTURE_WORKLET_URL = `${process.env.PUBLIC_URL || ''}/ai/ioct-assist-capture.worklet.js`;
const CAPTURE_WORKLET_NAME = 'ioct-assist-capture';

export async function getUserMedia(): Promise<MediaStreamLike> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return stream;
}

export function createCaptureContext(): CaptureContextLike {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor();
  let workletReadyPromise: Promise<void> | null = null;

  return {
    sampleRate: context.sampleRate,
    createCaptureNode(stream: MediaStreamLike): CaptureNodeLike {
      const source = context.createMediaStreamSource(stream as unknown as MediaStream);
      workletReadyPromise = workletReadyPromise || context.audioWorklet.addModule(CAPTURE_WORKLET_URL);
      const holder: { node: AudioWorkletNode | null; onFrame: ((frame: Float32Array) => void) | null } = { node: null, onFrame: null };
      workletReadyPromise
        .then(() => {
          const node = new AudioWorkletNode(context, CAPTURE_WORKLET_NAME);
          node.port.onmessage = (event: MessageEvent<Float32Array>) => holder.onFrame?.(event.data);
          source.connect(node);
          holder.node = node;
        })
        .catch(() => {
          // AudioWorklet unsupported/blocked — capture silently stays inert;
          // the composer surfaces a generic "voice unavailable" state.
        });
      return {
        get onFrame() {
          return holder.onFrame;
        },
        set onFrame(fn) {
          holder.onFrame = fn;
        },
        disconnect() {
          holder.node?.disconnect();
          source.disconnect();
        },
      } as CaptureNodeLike;
    },
    async close() {
      await context.close();
    },
  };
}

export function createPlaybackContext(): PlaybackContextLike {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor({ sampleRate: 24000 });

  return {
    get currentTime() {
      return context.currentTime;
    },
    createSourceFromPcm16(pcm: Float32Array, sampleRate: number): AudioSourceLike {
      const buffer = context.createBuffer(1, pcm.length, sampleRate);
      buffer.copyToChannel(pcm, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      return {
        set onended(fn: (() => void) | null) {
          source.onended = fn;
        },
        start(when: number) {
          source.start(when);
        },
        stop() {
          try {
            source.stop();
          } catch {
            // Already stopped — ignore.
          }
        },
      } as AudioSourceLike;
    },
    async close() {
      await context.close();
    },
  };
}

export async function connectSession(handlers: {
  onServerContent(content: { audioBase64?: string; interrupted?: boolean; turnComplete?: boolean }): void;
  onToolCall(call: { name: string; args: Record<string, unknown>; id: string }): void;
  onClose(): void;
  onError(): void;
}): Promise<LiveSessionLike> {
  const tokenResponse = await requestLiveToken();
  const ai = new GoogleGenAI({ apiKey: tokenResponse.token });

  const session = await ai.live.connect({
    model: tokenResponse.model,
    callbacks: {
      onmessage: (message) => {
        const content = message.serverContent;
        if (content) {
          const audioPart = content.modelTurn?.parts?.find((part) => part.inlineData?.data);
          handlers.onServerContent({
            audioBase64: audioPart?.inlineData?.data,
            interrupted: content.interrupted,
            turnComplete: content.turnComplete,
          });
        }
        const toolCall = (message as unknown as { toolCall?: { functionCalls?: { name: string; args: Record<string, unknown>; id: string }[] } }).toolCall;
        if (toolCall?.functionCalls) {
          for (const call of toolCall.functionCalls) {
            handlers.onToolCall(call);
          }
        }
      },
      onerror: () => handlers.onError(),
      onclose: () => handlers.onClose(),
    },
  });

  return {
    sendRealtimeInputPcm(base64Pcm: string) {
      session.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
    },
    sendToolResponse(callId: string, name: string, response: unknown) {
      session.sendToolResponse({
        functionResponses: [{ id: callId, name, response: { result: response } }],
      });
    },
    close() {
      session.close();
    },
  };
}

export async function executeLiveToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { result } = await executeLiveTool(name, args);
  return result;
}
