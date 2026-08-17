import React from 'react';
import { render, screen } from '@testing-library/react';
import AiLiveStatus from './AiLiveStatus';

it('renders nothing when voice is idle', () => {
  const { container } = render(<AiLiveStatus micLevel={0} phase="idle" />);
  expect(container).toBeEmptyDOMElement();
});

it('shows a Live badge, phase label, and mic level while listening', () => {
  render(<AiLiveStatus micLevel={0.5} phase="listening" />);
  expect(screen.getByText('Always on')).toBeInTheDocument();
  expect(screen.getByText('Listening')).toBeInTheDocument();
  expect(screen.getByLabelText(/microphone level 50 percent/i)).toBeInTheDocument();
});
