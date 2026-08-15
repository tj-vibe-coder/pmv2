import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiAssistProvider, useAiAssist } from './AiAssistProvider';
import { sendAiChat, confirmAiProposal } from '../../services/aiAssistService';
import * as liveSession from '../../ai/liveSession';

jest.mock('../../ai/liveSession', () => ({
  getUserMedia: jest.fn(),
  createCaptureContext: jest.fn(),
  createPlaybackContext: jest.fn(),
  connectSession: jest.fn(),
  executeLiveToolCall: jest.fn(),
}));

jest.mock('../../services/aiAssistService', () => ({
  sendAiChat: jest.fn(),
  confirmAiProposal: jest.fn(),
  rejectAiProposal: jest.fn(),
  AiAssistError: class AiAssistError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const sendAiChatMock = sendAiChat as jest.Mock;

function Harness({ enabled }: { enabled: boolean }): React.ReactElement {
  const ai = useAiAssist();
  return (
    <div>
      <div data-testid="open">{String(ai.isOpen)}</div>
      <div data-testid="loading">{String(ai.isLoading)}</div>
      <div data-testid="messages">{JSON.stringify(ai.messages)}</div>
      <button onClick={() => ai.open()}>open</button>
      <button onClick={() => ai.send('hello', null)}>send</button>
      <button onClick={() => ai.stop()}>stop</button>
      <button onClick={() => ai.retry(null)}>retry</button>
      <button onClick={() => ai.clear()}>clear</button>
      <button onClick={() => { void ai.startVoice(); }}>start-voice</button>
      <button onClick={() => { void ai.send('apply that change', null); }}>send-apply</button>
      <div data-testid="proposal">{ai.pendingProposal ? ai.pendingProposal.proposalId : ''}</div>
    </div>
  );
}

function renderHarness(enabled = true) {
  return render(
    <AiAssistProvider enabled={enabled}>
      <Harness enabled={enabled} />
    </AiAssistProvider>,
  );
}

beforeEach(() => {
  sendAiChatMock.mockReset();
});

it('starts closed — the drawer must never auto-open on mount, only via the launcher', () => {
  renderHarness();
  expect(screen.getByTestId('open').textContent).toBe('false');
});

function mockLiveSession(session: Record<string, unknown> = {}) {
  (liveSession.getUserMedia as jest.Mock).mockResolvedValue({ getTracks: () => [] });
  (liveSession.createCaptureContext as jest.Mock).mockReturnValue({
    sampleRate: 48000,
    createCaptureNode: () => ({ onFrame: null, disconnect: () => {} }),
    close: async () => {},
  });
  (liveSession.createPlaybackContext as jest.Mock).mockReturnValue({
    currentTime: 0,
    createSourceFromPcm16: () => ({ onended: null, start: () => {}, stop: () => {} }),
    close: async () => {},
  });
  const close = jest.fn();
  const sendClientContent = jest.fn();
  (liveSession.connectSession as jest.Mock).mockResolvedValue({
    sendRealtimeInputPcm: () => {},
    sendToolResponse: () => {},
    sendClientContent,
    close,
    ...session,
  });
  return { close, sendClientContent };
}

it('keeps Live alive and sends a typed line into the live session', async () => {
  const { close, sendClientContent } = mockLiveSession();

  function TypedSend(): React.ReactElement {
    const ai = useAiAssist();
    return (
      <div>
        <button onClick={() => { void ai.startVoice(); }}>start-voice</button>
        <button onClick={() => { void ai.send('i mean rezcoat', null); }}>typed-send</button>
      </div>
    );
  }

  render(
    <AiAssistProvider enabled>
      <TypedSend />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => expect(liveSession.connectSession).toHaveBeenCalled());
  fireEvent.click(screen.getByText('typed-send'));
  await waitFor(() => expect(sendClientContent).toHaveBeenCalledWith({
    turns: [{ role: 'user', parts: [{ text: 'i mean rezcoat' }] }],
    turnComplete: true,
  }));
  expect(close).not.toHaveBeenCalled();
  expect(sendAiChatMock).not.toHaveBeenCalled();
});

it('packs Live tool results into the next typed chat after Live ends', async () => {
  mockLiveSession();
  let handlers: { onToolCall: (call: { name: string; args: Record<string, unknown>; id: string }) => Promise<void> } | undefined;
  (liveSession.connectSession as jest.Mock).mockImplementation(async (nextHandlers) => {
    handlers = nextHandlers;
    return { sendRealtimeInputPcm: () => {}, sendToolResponse: () => {}, sendClientContent: () => {}, close: () => {} };
  });
  (liveSession.executeLiveToolCall as jest.Mock).mockResolvedValue({
    result: { action: 'navigate', route: '/sales/calcsheet/projects/opp1', label: 'Rezcoat' },
    sources: [],
  });
  sendAiChatMock.mockResolvedValue({
    ok: true, requestId: 'r1', answer: 'Two quotations.', citations: [], followUps: [], notice: 'n',
  });

  function TypedSend(): React.ReactElement {
    const ai = useAiAssist();
    return (
      <div>
        <button onClick={() => { void ai.startVoice(); }}>start-voice</button>
        <button onClick={() => { ai.stopVoice(); }}>stop-voice</button>
        <button onClick={() => { void ai.send('how many quotations?', null); }}>typed-send</button>
      </div>
    );
  }

  render(
    <AiAssistProvider enabled>
      <TypedSend />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    await handlers!.onToolCall({ name: 'navigate_to_record', args: { search: 'rezcoat' }, id: 'c1' });
  });
  fireEvent.click(screen.getByText('stop-voice'));
  fireEvent.click(screen.getByText('typed-send'));
  await waitFor(() => expect(sendAiChatMock).toHaveBeenCalled());
  const prior = sendAiChatMock.mock.calls[0][3];
  expect(prior).toEqual([
    { name: 'navigate_to_record', data: { action: 'navigate', route: '/sales/calcsheet/projects/opp1', label: 'Rezcoat' } },
  ]);
});

it('sends a message and appends the assistant answer with citations', async () => {
  sendAiChatMock.mockResolvedValue({
    ok: true,
    requestId: 'r1',
    answer: 'The answer.',
    citations: [{ id: 'project:p1', label: 'P1', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }],
    followUps: [],
    notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
  });
  renderHarness();

  fireEvent.click(screen.getByText('send'));

  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].text).toBe('The answer.');
  });
});

it('appends an error bubble on failure without throwing', async () => {
  sendAiChatMock.mockRejectedValue(new Error('boom'));
  renderHarness();

  fireEvent.click(screen.getByText('send'));

  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages[messages.length - 1].role).toBe('error');
  });
});

it('retry drops the trailing error bubble and does not duplicate the user message', async () => {
  sendAiChatMock.mockRejectedValueOnce(new Error('boom'));
  renderHarness();
  fireEvent.click(screen.getByText('send'));
  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('error');
  });

  sendAiChatMock.mockResolvedValueOnce({
    ok: true, requestId: 'r2', answer: 'Recovered.', citations: [], followUps: [], notice: 'n',
  });
  fireEvent.click(screen.getByText('retry'));

  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].text).toBe('Recovered.');
  });
});

it('clear resets messages and stop aborts an in-flight request', async () => {
  let capturedSignal: AbortSignal | undefined;
  sendAiChatMock.mockImplementation((_h: unknown, _p: unknown, signal: AbortSignal) => {
    capturedSignal = signal;
    return new Promise(() => {}); // never resolves
  });
  renderHarness();

  fireEvent.click(screen.getByText('send'));
  await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('true'));

  fireEvent.click(screen.getByText('stop'));
  expect(capturedSignal?.aborted).toBe(true);
  await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

  fireEvent.click(screen.getByText('clear'));
  await waitFor(() => {
    expect(screen.getByTestId('messages').textContent).toBe('[]');
  });
});

it('appends voice transcripts to the same in-memory conversation', async () => {
  let handlers: { onServerContent: (content: Record<string, unknown>) => void } | undefined;
  (liveSession.getUserMedia as jest.Mock).mockResolvedValue({ getTracks: () => [] });
  (liveSession.createCaptureContext as jest.Mock).mockReturnValue({
    sampleRate: 48000,
    createCaptureNode: () => ({ onFrame: null, disconnect: () => {} }),
    close: async () => {},
  });
  (liveSession.createPlaybackContext as jest.Mock).mockReturnValue({
    currentTime: 0,
    createSourceFromPcm16: () => ({ onended: null, start: () => {}, stop: () => {} }),
    close: async () => {},
  });
  (liveSession.connectSession as jest.Mock).mockImplementation(async (nextHandlers) => {
    handlers = nextHandlers;
    return { sendRealtimeInputPcm: () => {}, sendToolResponse: () => {}, close: () => {} };
  });

  renderHarness();
  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => expect(handlers).toBeDefined());

  act(() => {
    handlers!.onServerContent({ inputText: 'Status of Clarktel?', inputDone: true });
    handlers!.onServerContent({ outputText: 'It is ongoing.', outputDone: true });
  });

  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'Status of Clarktel?' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'It is ongoing.' });
    expect(messages[1].notice).toMatch(/verify/i);
  });
});

it('does not duplicate a voice turn when Gemini repeats the finished transcript', async () => {
  let handlers: { onServerContent: (content: Record<string, unknown>) => void } | undefined;
  (liveSession.getUserMedia as jest.Mock).mockResolvedValue({ getTracks: () => [] });
  (liveSession.createCaptureContext as jest.Mock).mockReturnValue({
    sampleRate: 48000,
    createCaptureNode: () => ({ onFrame: null, disconnect: () => {} }),
    close: async () => {},
  });
  (liveSession.createPlaybackContext as jest.Mock).mockReturnValue({
    currentTime: 0,
    createSourceFromPcm16: () => ({ onended: null, start: () => {}, stop: () => {} }),
    close: async () => {},
  });
  (liveSession.connectSession as jest.Mock).mockImplementation(async (nextHandlers) => {
    handlers = nextHandlers;
    return { sendRealtimeInputPcm: () => {}, sendToolResponse: () => {}, close: () => {} };
  });

  renderHarness();
  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => expect(handlers).toBeDefined());

  act(() => {
    handlers!.onServerContent({ inputText: 'Hello.', inputDone: true });
    handlers!.onServerContent({ outputText: 'How can I help?', outputDone: true });
    handlers!.onServerContent({ inputText: 'Hello.', inputDone: true });
    handlers!.onServerContent({ outputText: 'How can I help?', outputDone: true, turnComplete: true });
  });

  await waitFor(() => {
    const messages = JSON.parse(screen.getByTestId('messages').textContent || '[]');
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('Hello.');
    expect(messages[1].text).toBe('How can I help?');
  });
});

it('executes an allowlisted navigate_to_record result from a Live tool call', async () => {
  const onNavigateRoute = jest.fn();
  let handlers: { onToolCall: (call: { name: string; args: Record<string, unknown>; id: string }) => Promise<void> } | undefined;
  (liveSession.getUserMedia as jest.Mock).mockResolvedValue({ getTracks: () => [] });
  (liveSession.createCaptureContext as jest.Mock).mockReturnValue({
    sampleRate: 48000,
    createCaptureNode: () => ({ onFrame: null, disconnect: () => {} }),
    close: async () => {},
  });
  (liveSession.createPlaybackContext as jest.Mock).mockReturnValue({
    currentTime: 0,
    createSourceFromPcm16: () => ({ onended: null, start: () => {}, stop: () => {} }),
    close: async () => {},
  });
  (liveSession.connectSession as jest.Mock).mockImplementation(async (nextHandlers) => {
    handlers = nextHandlers;
    return { sendRealtimeInputPcm: () => {}, sendToolResponse: () => {}, sendClientContent: () => {}, close: () => {} };
  });
  (liveSession.executeLiveToolCall as jest.Mock).mockResolvedValue({
    result: { action: 'navigate', route: '/sales/calcsheet/projects/opp1', label: 'Rezcoat' },
    sources: [{ id: 'opp1', label: 'Rezcoat', route: '/sales/calcsheet/projects/opp1', asOf: 'x' }],
  });

  render(
    <AiAssistProvider enabled onNavigateRoute={onNavigateRoute}>
      <Harness enabled />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    await handlers!.onToolCall({ name: 'navigate_to_record', args: { search: 'rezcoat' }, id: 'c1' });
  });
  expect(onNavigateRoute).toHaveBeenCalledWith('/sales/calcsheet/projects/opp1');
});

it('applies navigateTo from a typed chat answer', async () => {
  const onNavigateRoute = jest.fn();
  sendAiChatMock.mockResolvedValue({
    ok: true,
    requestId: 'r1',
    answer: 'Opening Rezcoat.',
    citations: [],
    followUps: [],
    notice: 'n',
    navigateTo: { route: '/projects/p1', label: 'P1' },
  });
  render(
    <AiAssistProvider enabled onNavigateRoute={onNavigateRoute}>
      <Harness enabled />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByText('send'));
  await waitFor(() => expect(onNavigateRoute).toHaveBeenCalledWith('/projects/p1'));
});

it('typed apply that change confirms a pending proposal without another chat call', async () => {
  const confirmMock = confirmAiProposal as jest.Mock;
  confirmMock.mockResolvedValue({
    applied: true,
    proposalId: 'p1',
    kind: 'opportunity',
    recordId: 'opp1',
    label: 'Rezcoat',
    field: 'opportunityGrade',
    currentValue: 'B',
    proposedValue: 'A',
    reason: '',
  });
  sendAiChatMock.mockResolvedValue({
    ok: true,
    requestId: 'r1',
    answer: 'Draft ready.',
    citations: [],
    followUps: [],
    notice: 'n',
    proposal: {
      proposalId: 'p1',
      kind: 'opportunity',
      recordId: 'opp1',
      label: 'Rezcoat',
      field: 'opportunityGrade',
      currentValue: 'B',
      proposedValue: 'A',
      reason: '',
    },
  });
  renderHarness();
  fireEvent.click(screen.getByText('send'));
  await waitFor(() => expect(screen.getByTestId('proposal').textContent).toBe('p1'));
  sendAiChatMock.mockClear();
  fireEvent.click(screen.getByText('send-apply'));
  await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('p1'));
  expect(sendAiChatMock).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId('proposal').textContent).toBe(''));
});

it('disabling the feature (e.g. logout) clears history and closes the drawer', async () => {
  const { rerender } = renderHarness(true);
  fireEvent.click(screen.getByText('open'));
  expect(screen.getByTestId('open').textContent).toBe('true');

  act(() => {
    rerender(
      <AiAssistProvider enabled={false}>
        <Harness enabled={false} />
      </AiAssistProvider>,
    );
  });

  await waitFor(() => {
    expect(screen.getByTestId('open').textContent).toBe('false');
    expect(screen.getByTestId('messages').textContent).toBe('[]');
  });
});
