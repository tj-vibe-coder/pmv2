import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiAssistLauncher from './AiAssistLauncher';
import { AiAssistProvider, useAiAssist } from './AiAssistProvider';
import * as liveSession from '../../ai/liveSession';

jest.mock('../../ai/liveSession', () => ({
  getUserMedia: jest.fn(),
  createCaptureContext: jest.fn(),
  createPlaybackContext: jest.fn(),
  connectSession: jest.fn(),
  executeLiveToolCall: jest.fn(),
}));

function StartVoice(): React.ReactElement {
  const { startVoice } = useAiAssist();
  return <button onClick={() => { void startVoice(); }}>start-voice</button>;
}

it('shows a LIVE badge on the launcher only while a voice session is active', async () => {
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
  (liveSession.connectSession as jest.Mock).mockResolvedValue({
    sendRealtimeInputPcm: () => {},
    sendToolResponse: () => {},
    close: () => {},
  });

  render(
    <AiAssistProvider enabled>
      <AiAssistLauncher />
      <StartVoice />
    </AiAssistProvider>,
  );

  expect(screen.getByLabelText('Open IOCT Assist')).toBeInTheDocument();
  expect(screen.queryByText('LIVE')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('start-voice'));
  await waitFor(() => {
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByLabelText(/open ioct assist — live/i)).toBeInTheDocument();
  });
});

it('hides the launcher while the drawer is open so it cannot cover Send', () => {
  render(
    <AiAssistProvider enabled>
      <AiAssistLauncher />
    </AiAssistProvider>,
  );
  fireEvent.click(screen.getByLabelText('Open IOCT Assist'));
  expect(screen.queryByLabelText('Open IOCT Assist')).not.toBeInTheDocument();
});
