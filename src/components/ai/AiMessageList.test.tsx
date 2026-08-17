import React from 'react';
import { render, screen } from '@testing-library/react';
import AiMessageList from './AiMessageList';
import type { AiMessage } from '../../types/AiAssist';

it('renders a model string containing HTML literally, never as markup', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: '<img src=x onerror=alert(1)>', citations: [], notice: 'n' },
  ];
  const { container } = render(<AiMessageList messages={messages} onNavigateSource={() => {}} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
});

it('never uses dangerouslySetInnerHTML anywhere in its rendered output', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'user', text: 'hi' },
    { id: '2', role: 'assistant', text: 'hello', citations: [{ id: 'project:p1', label: 'P1', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }], notice: 'n' },
    { id: '3', role: 'error', text: 'failed' },
  ];
  render(<AiMessageList messages={messages} onNavigateSource={() => {}} />);
  expect(document.querySelectorAll('[dangerouslysetinnerhtml]').length).toBe(0);
});

it('renders source citation chips that call onNavigateSource with the citation route', () => {
  const onNavigateSource = jest.fn();
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: 'hello', citations: [{ id: 'project:p1', label: 'Project One', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }], notice: 'n' },
  ];
  render(<AiMessageList messages={messages} onNavigateSource={onNavigateSource} />);
  screen.getByText('Project One').click();
  expect(onNavigateSource).toHaveBeenCalledWith('/projects/p1');
});

it('renders the persistent AI-generated notice under an assistant message', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: 'hello', citations: [], notice: 'AI-generated summary from IOCT records. Verify before making decisions.' },
  ];
  render(<AiMessageList messages={messages} onNavigateSource={() => {}} />);
  expect(screen.getByText('AI-generated summary from IOCT records. Verify before making decisions.')).toBeInTheDocument();
});

it('renders error messages distinctly', () => {
  const messages: AiMessage[] = [{ id: '1', role: 'error', text: 'Something went wrong.' }];
  render(<AiMessageList messages={messages} onNavigateSource={() => {}} />);
  expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
});
