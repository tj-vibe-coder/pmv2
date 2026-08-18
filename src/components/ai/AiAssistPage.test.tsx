import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiAssistPage from './AiAssistPage';
import { AiAssistProvider } from './AiAssistProvider';
import { fetchAiHealth } from '../../services/aiAssistService';

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
  fetchAiHealth: jest.fn(),
  AiAssistError: class AiAssistError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const fetchAiHealthMock = fetchAiHealth as jest.Mock;

beforeEach(() => {
  fetchAiHealthMock.mockReset();
  fetchAiHealthMock.mockReturnValue(new Promise(() => {}));
});

function renderPage(enabled: boolean) {
  return render(
    <MemoryRouter initialEntries={['/assist']}>
      <AiAssistProvider enabled={enabled}>
        <AiAssistPage />
      </AiAssistProvider>
    </MemoryRouter>,
  );
}

it('renders the full-page conversation and composer when enabled', () => {
  renderPage(true);
  expect(screen.getByRole('heading', { level: 1, name: 'IOCT Assist' })).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  expect(screen.getByText(/ask a comparison question/i)).toBeInTheDocument();
});

it('shows an unavailable message instead of the composer when not enabled', () => {
  renderPage(false);
  expect(screen.getByText('IOCT Assist is not available for this account.')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
