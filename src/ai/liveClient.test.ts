import { createLiveClient, LivePhase } from './liveClient';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFakeStream() {
  const stopped: boolean[] = [];
  return {
    getTracks: () => [{ stop: () => stopped.push(true) }],
    _stopped: stopped,
  };
}

function makeFakeCaptureContext() {
  const nodes: { disconnected: boolean; onFrame: ((f: Float32Array) => void) | null }[] = [];
  return {
    sampleRate: 48000,
    createCaptureNode: () => {
      const node = { onFrame: null as ((f: Float32Array) => void) | null, disconnected: false, disconnect() { this.disconnected = true; } };
      nodes.push(node);
      return node;
    },
    close: async () => {},
    _nodes: nodes,
  };
}

function makeFakePlaybackContext(startTime = 0) {
  const sources: { startedAt: number; stopped: boolean; onended: (() => void) | null }[] = [];
  const ctx = {
    currentTime: startTime,
    createSourceFromPcm16: () => {
      const source = {
        startedAt: -1,
        stopped: false,
        onended: null as (() => void) | null,
        start(when: number) {
          this.startedAt = when;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
    close: async () => {},
    _sources: sources,
  };
  return ctx;
}

function makeDeps(overrides: Partial<Parameters<typeof createLiveClient>[0]> = {}) {
  const phases: LivePhase[] = [];
  const stream = makeFakeStream();
  const captureContext = makeFakeCaptureContext();
  const playbackContext = makeFakePlaybackContext();
  let session: { closed: boolean; sendRealtimeInputPcm: jest.Mock; sendToolResponse: jest.Mock; close: () => void } | null = null;

  const deps = {
    getUserMedia: jest.fn(async () => stream),
    createCaptureContext: jest.fn(() => captureContext),
    createPlaybackContext: jest.fn(() => playbackContext),
    connectSession: jest.fn(async () => {
      session = {
        closed: false,
        sendRealtimeInputPcm: jest.fn(),
        sendToolResponse: jest.fn(),
        close: () => { session!.closed = true; },
      };
      return session;
    }),
    onExecuteTool: jest.fn(async () => ({ ok: true })),
    onPhaseChange: (p: LivePhase) => phases.push(p),
    ...overrides,
  };
  return { deps, phases, stream, captureContext, playbackContext, getSession: () => session };
}

it('start() acquires the mic, connects, and reaches the listening phase', async () => {
  const { deps, phases } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();
  expect(phases).toEqual(['connecting', 'listening']);
  expect(client.getPhase()).toBe('listening');
});

it('a stale start operation releases its acquired mic stream when stop() races the mic-permission await', async () => {
  const micGate = deferred<ReturnType<typeof makeFakeStream>>();
  const stream = makeFakeStream();
  const { deps } = makeDeps({ getUserMedia: jest.fn(() => micGate.promise) as any });
  const client = createLiveClient(deps as any);

  const startPromise = client.start();
  client.stop(); // races the in-flight getUserMedia()
  micGate.resolve(stream);
  await startPromise;

  expect(stream._stopped).toEqual([true]);
  expect(deps.connectSession).not.toHaveBeenCalled();
  expect(client.getPhase()).toBe('idle');
});

it('schedules playback chunks at a continuous, non-overlapping timeline', async () => {
  const { deps, playbackContext } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();

  const handlers = (deps.connectSession as jest.Mock).mock.calls[0][0];
  const chunkSamples = 2400; // 100ms at 24kHz
  const base64 = Buffer.from(new ArrayBuffer(chunkSamples * 2)).toString('base64');

  handlers.onServerContent({ audioBase64: base64 });
  handlers.onServerContent({ audioBase64: base64 });

  expect(playbackContext._sources).toHaveLength(2);
  const [first, second] = playbackContext._sources;
  expect(first.startedAt).toBe(0);
  expect(second.startedAt).toBeCloseTo(0.1, 5); // first chunk's duration
});

it('an interruption stops every active source and resets the scheduling cursor', async () => {
  const { deps, playbackContext } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();
  const handlers = (deps.connectSession as jest.Mock).mock.calls[0][0];

  const base64 = Buffer.from(new ArrayBuffer(4800 * 2)).toString('base64');
  handlers.onServerContent({ audioBase64: base64 });
  handlers.onServerContent({ audioBase64: base64 });
  expect(playbackContext._sources.every((s) => !s.stopped)).toBe(true);

  handlers.onServerContent({ interrupted: true });

  expect(playbackContext._sources.every((s) => s.stopped)).toBe(true);
  expect(client.getPhase()).toBe('interrupted');
});

it('stop() tears down everything: closes the session, disconnects capture, releases the mic, and stops all sources', async () => {
  const { deps, stream, captureContext, playbackContext, getSession } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();
  const handlers = (deps.connectSession as jest.Mock).mock.calls[0][0];
  const base64 = Buffer.from(new ArrayBuffer(4800 * 2)).toString('base64');
  handlers.onServerContent({ audioBase64: base64 });

  client.stop();

  expect(getSession()!.closed).toBe(true);
  expect(captureContext._nodes[0].disconnected).toBe(true);
  expect(stream._stopped).toEqual([true]);
  expect(playbackContext._sources.every((s) => s.stopped)).toBe(true);
  expect(client.getPhase()).toBe('idle');
});

it('a tool call while connected calls onExecuteTool and sends the result back through the session', async () => {
  const { deps, getSession } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();
  const handlers = (deps.connectSession as jest.Mock).mock.calls[0][0];

  await handlers.onToolCall({ name: 'search_projects', args: { search: 'plant' }, id: 'call-1' });

  expect(deps.onExecuteTool).toHaveBeenCalledWith('search_projects', { search: 'plant' });
  expect(getSession()!.sendToolResponse).toHaveBeenCalledWith('call-1', 'search_projects', { ok: true });
});
