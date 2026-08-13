import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiAssistProvider, useAiAssist } from './AiAssistProvider';
import { sendAiChat } from '../../services/aiAssistService';

jest.mock('../../ai/liveSession', () => ({
  getUserMedia: jest.fn(),
  createCaptureContext: jest.fn(),
  createPlaybackContext: jest.fn(),
  connectSession: jest.fn(),
  executeLiveToolCall: jest.fn(),
}));

jest.mock('../../services/aiAssistService', () => ({
  sendAiChat: jest.fn(),
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
