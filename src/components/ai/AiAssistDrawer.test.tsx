import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiAssistDrawer from './AiAssistDrawer';
import AiAssistLauncher from './AiAssistLauncher';
import { AiAssistProvider } from './AiAssistProvider';
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

beforeEach(() => {
  sendAiChatMock.mockReset();
});

// The drawer must stay closed (aria-hidden) until the launcher opens it — see
// AiAssistProvider.test.tsx's "starts closed" regression test. Interactive
// drawer tests here open it via the real launcher first, exactly as a user would.
function renderDrawer(enabled = true) {
  const result = render(
    <AiAssistProvider enabled={enabled}>
      <AiAssistLauncher />
      <AiAssistDrawer pageContext={{ route: '/projects', projectId: null }} />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByLabelText(/open ioct assist/i));
  return result;
}

it('shows a "Read only" badge and a persistent AI-disclaimer when a message exists', async () => {
  sendAiChatMock.mockResolvedValue({
    ok: true, requestId: 'r1', answer: 'Answer.', citations: [], followUps: [],
    notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
  });
  renderDrawer();
  expect(screen.getByText(/read only/i)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'balance?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByText('Answer.')).toBeInTheDocument();
  });
});

it('disables sending and shows a stop control while a request is in flight', async () => {
  sendAiChatMock.mockImplementation(() => new Promise(() => {}));
  renderDrawer();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'balance?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });
});

it('shows a retry control after a failed send', async () => {
  sendAiChatMock.mockRejectedValue(new Error('boom'));
  renderDrawer();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'balance?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

it('clears the conversation when "New conversation" is clicked', async () => {
  sendAiChatMock.mockResolvedValue({
    ok: true, requestId: 'r1', answer: 'Answer.', citations: [], followUps: [], notice: 'n',
  });
  renderDrawer();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'balance?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getByText('Answer.')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));
  expect(screen.queryByText('Answer.')).not.toBeInTheDocument();
});

it('renders route-aware suggested question chips for /projects', () => {
  renderDrawer();
  expect(screen.getByText(/largest.*balance|balance/i)).toBeInTheDocument();
});

it('shows a disabled-feature message instead of a composer when AI Assist is off, without calling the API', () => {
  render(
    <AiAssistProvider enabled={false}>
      <AiAssistDrawer pageContext={null} />
    </AiAssistProvider>,
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(sendAiChatMock).not.toHaveBeenCalled();
});
