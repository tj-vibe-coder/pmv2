import { createLiveClient, LivePhase, mergeTranscript } from './liveClient';

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
  const ended: Array<() => void> = [];
  return {
    getTracks: () => [{
      stop: () => stopped.push(true),
      addEventListener: (type: string, fn: () => void) => {
        if (type === 'ended') ended.push(fn);
      },
    }],
    _stopped: stopped,
    _ended: ended,
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
  let session: { closed: boolean; sendRealtimeInputPcm: jest.Mock; sendToolResponse: jest.Mock; sendClientContent: jest.Mock; close: () => void } | null = null;

  const deps = {
    getUserMedia: jest.fn(async () => stream),
    createCaptureContext: jest.fn(() => captureContext),
    createPlaybackContext: jest.fn(() => playbackContext),
    connectSession: jest.fn(async () => {
      session = {
        closed: false,
        sendRealtimeInputPcm: jest.fn(),
        sendToolResponse: jest.fn(),
        sendClientContent: jest.fn(),
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

it('an unexpected track-ended event tears down into the error phase', async () => {
  const stream = makeFakeStream();
  const { deps } = makeDeps({ getUserMedia: jest.fn(async () => stream) as any });
  const client = createLiveClient(deps as any);
  await client.start();
  stream._ended.forEach((fn) => fn());
  expect(client.getPhase()).toBe('error');
});

it('start() acquires the mic, connects, and reaches the listening phase', async () => {
  const { deps, phases } = makeDeps();
  const client = createLiveClient(deps as any);
  await client.start();
  expect(phases).toEqual(['connecting', 'listening']);
  expect(client.getPhase()).toBe('listening');
  const captureOrder = (deps.createCaptureContext as jest.Mock).mock.invocationCallOrder[0];
  const micOrder = (deps.getUserMedia as jest.Mock).mock.invocationCallOrder[0];
  expect(captureOrder).toBeLessThan(micOrder);
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

it('mergeTranscript treats both cumulative and delta updates as one string', () => {
  expect(mergeTranscript('', 'Which')).toBe('Which');
  expect(mergeTranscript('Which', 'Which open')).toBe('Which open');
  expect(mergeTranscript('Which open', ' projects')).toBe('Which open projects');
  expect(mergeTranscript('Which open projects', 'Which')).toBe('Which open projects');
});

it('forwards input and output transcripts into onTranscript and finalizes on turnComplete', async () => {
  const events: { role: string; text: string; done: boolean }[] = [];
  const { deps } = makeDeps({
    onTranscript: (event) => events.push(event),
  });
  const client = createLiveClient(deps as any);
  await client.start();
  const handlers = (deps.connectSession as jest.Mock).mock.calls[0][0];

  handlers.onServerContent({ inputText: 'Which open', inputDone: false });
  handlers.onServerContent({ inputText: 'Which open projects', inputDone: true });
  handlers.onServerContent({ outputText: 'Clarktel', outputDone: false });
  handlers.onServerContent({ outputText: ' has the largest balance.', outputDone: true, turnComplete: true });

  expect(events).toEqual([
    { role: 'user', text: 'Which open', done: false },
    { role: 'user', text: 'Which open projects', done: true },
    { role: 'assistant', text: 'Clarktel', done: false },
    { role: 'assistant', text: 'Clarktel has the largest balance.', done: true },
  ]);
});

it('reports a mic level from capture frames and zeros it on stop', async () => {
  const levels: number[] = [];
  const { deps, captureContext } = makeDeps({
    onMicLevel: (level) => levels.push(level),
  });
  const client = createLiveClient(deps as any);
  await client.start();
  const loud = new Float32Array(128).fill(0.4);
  captureContext._nodes[0].onFrame!(loud);
  expect(levels[0]).toBeGreaterThan(0.5);
  client.stop();
  expect(levels[levels.length - 1]).toBe(0);
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

it('sendPageContext writes an incomplete turn so Live does not start speaking', async () => {
  const { deps, getSession } = makeDeps();
  const client = createLiveClient(deps as any);
  client.sendPageContext('Now viewing: /dashboard');
  expect(getSession()).toBeNull();

  await client.start();
  client.sendPageContext('Now viewing: opportunity opp1');
  expect(getSession()!.sendClientContent).toHaveBeenCalledWith({
    turns: [{ role: 'user', parts: [{ text: 'Now viewing: opportunity opp1' }] }],
    turnComplete: false,
  });
});
