import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AiAssistHost from './AiAssistHost';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'RJR' } }),
}));

jest.mock('../../ai/liveSession', () => ({
  getUserMedia: jest.fn(),
  createCaptureContext: jest.fn(),
  createPlaybackContext: jest.fn(),
  connectSession: jest.fn(),
  executeLiveToolCall: jest.fn(),
}));

it('mounts the launcher once and shows Now viewing for the current route', () => {
  render(
    <MemoryRouter initialEntries={['/sales/calcsheet/projects/opp1']}>
      <AiAssistHost>
        <div>page body</div>
      </AiAssistHost>
    </MemoryRouter>,
  );
  expect(screen.getByText('page body')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/open ioct assist/i));
  expect(screen.getByText(/now viewing opportunity opp1/i)).toBeInTheDocument();
});
