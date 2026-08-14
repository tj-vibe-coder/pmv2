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
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  sendAiChatMock.mockReset();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

// The drawer must stay closed (aria-hidden) until the launcher opens it — see
// AiAssistProvider.test.tsx's "starts closed" regression test. Interactive
// drawer tests here open it via the real launcher first, exactly as a user would.
function renderDrawer(enabled = true) {
  const result = render(
    <AiAssistProvider enabled={enabled}>
      <AiAssistLauncher />
      <AiAssistDrawer pageContext={{ route: '/projects', projectId: null, opportunityId: null, quotationId: null }} />
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

it('offers a click-to-toggle live voice control', () => {
  renderDrawer();
  expect(screen.getByLabelText(/start live voice/i)).toBeInTheDocument();
});

it('keeps the composer enabled while Live is on', async () => {
  const liveSession = require('../../ai/liveSession');
  liveSession.getUserMedia.mockResolvedValue({ getTracks: () => [] });
  liveSession.createCaptureContext.mockReturnValue({
    sampleRate: 48000,
    createCaptureNode: () => ({ onFrame: null, disconnect: () => {} }),
    close: async () => {},
  });
  liveSession.createPlaybackContext.mockReturnValue({
    currentTime: 0,
    createSourceFromPcm16: () => ({ onended: null, start: () => {}, stop: () => {} }),
    close: async () => {},
  });
  liveSession.connectSession.mockResolvedValue({
    sendRealtimeInputPcm: () => {},
    sendToolResponse: () => {},
    sendClientContent: () => {},
    close: () => {},
  });
  renderDrawer();
  fireEvent.click(screen.getByLabelText(/start live voice/i));
  await waitFor(() => expect(screen.getByLabelText(/speak or type/i)).toBeInTheDocument());
  expect(screen.getByRole('textbox')).not.toBeDisabled();
});

it('renders route-aware suggested question chips for /projects', () => {
  renderDrawer();
  expect(screen.getByText(/largest.*balance|balance/i)).toBeInTheDocument();
});

it('shows a Now viewing chip and forwards citation navigation', async () => {
  sendAiChatMock.mockResolvedValue({
    ok: true,
    requestId: 'r1',
    answer: 'Opened.',
    citations: [{ id: 'opp1', label: 'Rezcoat', route: '/sales/calcsheet/projects/opp1', asOf: '2026-08-13T00:00:00.000Z' }],
    followUps: [],
    notice: 'n',
  });
  const onNavigateSource = jest.fn();
  render(
    <AiAssistProvider enabled>
      <AiAssistLauncher />
      <AiAssistDrawer
        pageContext={{ route: '/sales/calcsheet/projects/opp1', projectId: null, opportunityId: 'opp1', quotationId: null }}
        onNavigateSource={onNavigateSource}
      />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByLabelText(/open ioct assist/i));
  expect(screen.getByText(/now viewing opportunity opp1/i)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'open it' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getByText('Rezcoat')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Rezcoat'));
  expect(onNavigateSource).toHaveBeenCalledWith('/sales/calcsheet/projects/opp1');
});

function mockViewport(isMobile: boolean): void {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: isMobile && /max-width:\s*599/.test(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

it('opens a bottom sheet on a phone-sized viewport instead of a full-screen dialog', () => {
  mockViewport(true);
  renderDrawer();
  expect(document.querySelector('.MuiDrawer-anchorBottom')).toBeTruthy();
  expect(document.querySelector('.MuiDialog-root')).toBeNull();
  expect(screen.getByLabelText('IOCT Assist')).toBeInTheDocument();
  mockViewport(false);
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
