import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login page on initial load', () => {
  render(<App />);
  const signinElements = screen.getAllByText(/Sign in/i);
  expect(signinElements.length).toBeGreaterThan(0);
});

