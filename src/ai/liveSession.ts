// Real browser wiring for src/ai/liveClient.ts's dependency-injected
// interfaces: microphone capture via AudioWorklet, 24kHz playback scheduling,
// and the actual @google/genai browser Live API connection. This file makes
// real browser/network calls and is intentionally NOT unit-tested (liveClient
// tests inject fakes for all of this). It has not been runtime-verified
// against a live device/API — required before enabling voice in production,
// same caveat as server/aiAssist/geminiClient.js and liveToken.js.

import { GoogleGenAI, Modality } from '@google/genai';
import type { CaptureContextLike, CaptureNodeLike, MediaStreamLike, PlaybackContextLike, AudioSourceLike, LiveSessionLike, LiveServerContentEvent } from './liveClient';
import { requestLiveToken, executeLiveTool } from '../services/aiAssistService';
import { resampleMono } from './audio/pcm';

// Served from public/ai/ (kept byte-identical to src/ai/audio/ — CRA can't
// serve arbitrary src/ files as a fetchable AudioWorklet URL). PUBLIC_URL
// respects a non-root deploy path (e.g. a subpath hosting override).
const CAPTURE_WORKLET_URL = `${process.env.PUBLIC_URL || ''}/ai/ioct-assist-capture.worklet.js`;
const CAPTURE_WORKLET_NAME = 'ioct-assist-capture';

// One hardware-rate context for capture + playback. A second AudioContext at
// 24 kHz (the Live PCM output rate) reconfigures CoreAudio and drops macOS
// Continuity / iPhone-as-mic. CUI keeps a single native-rate graph.
let sharedAudioContext: AudioContext | null = null;

function audioContextCtor(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (audioContextCtor())();
  }
  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

// Bound to the most recent connectSession(); Live tool POSTs must send the
// server-issued id or /api/ai-assist/tools/:name returns 400.
let activeLiveSessionId: string | null = null;

export async function getUserMedia(): Promise<MediaStreamLike> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return stream;
}

export function createCaptureContext(): CaptureContextLike {
  const context = getSharedAudioContext();
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
      // Shared with playback — do not close the hardware graph here.
    },
  };
}

export function createPlaybackContext(): PlaybackContextLike {
  const context = getSharedAudioContext();

  return {
    get currentTime() {
      return context.currentTime;
    },
    createSourceFromPcm16(pcm: Float32Array, sampleRate: number): AudioSourceLike {
      const samples = resampleMono(pcm, sampleRate, context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
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
      // Shared with capture — leave the hardware graph open.
    },
  };
}

export async function connectSession(handlers: {
  onServerContent(content: LiveServerContentEvent): void;
  onToolCall(call: { name: string; args: Record<string, unknown>; id: string }): void;
  onClose(): void;
  onError(): void;
}): Promise<LiveSessionLike> {
  const tokenResponse = await requestLiveToken();
  activeLiveSessionId = tokenResponse.liveSessionId;
  const ai = new GoogleGenAI({
    apiKey: tokenResponse.token,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const session = await ai.live.connect({
    model: tokenResponse.model,
    config: {
      responseModalities: [Modality.AUDIO],
      sessionResumption: {},
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onmessage: (message) => {
        const content = message.serverContent;
        if (content) {
          const audioPart = content.modelTurn?.parts?.find((part) => part.inlineData?.data);
          const textPart = content.modelTurn?.parts?.find((part) => typeof part.text === 'string' && part.text);
          const input = content.inputTranscription || content.interimInputTranscription;
          handlers.onServerContent({
            audioBase64: audioPart?.inlineData?.data,
            interrupted: content.interrupted,
            turnComplete: content.turnComplete,
            inputText: input?.text,
            inputDone: Boolean(content.inputTranscription?.finished),
            outputText: content.outputTranscription?.text || textPart?.text,
            outputDone: Boolean(content.outputTranscription?.finished),
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
    sendClientContent(params: { turns: unknown; turnComplete: boolean }) {
      session.sendClientContent({
        turns: params.turns as never,
        turnComplete: params.turnComplete,
      });
    },
    close() {
      if (activeLiveSessionId === tokenResponse.liveSessionId) {
        activeLiveSessionId = null;
      }
      session.close();
    },
  };
}

export async function executeLiveToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; sources: unknown[] }> {
  if (!activeLiveSessionId) {
    throw new Error('No active live session');
  }
  return executeLiveTool(name, args, activeLiveSessionId);
}
