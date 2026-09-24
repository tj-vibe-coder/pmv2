import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AiMessageList from './AiMessageList';
import type { AiMessage } from '../../types/AiAssist';

it('renders a model string containing HTML literally, never as markup', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: '<img src=x onerror=alert(1)>', citations: [], notice: 'n', followUps: [], chart: null },
  ];
  const { container } = render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
});

it('never uses dangerouslySetInnerHTML anywhere in its rendered output', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'user', text: 'hi' },
    {
      id: '2',
      role: 'assistant',
      text: 'hello',
      citations: [{ id: 'project:p1', label: 'P1', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }],
      notice: 'n',
      followUps: [],
      chart: null,
    },
    { id: '3', role: 'error', text: 'failed' },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(document.querySelectorAll('[dangerouslysetinnerhtml]').length).toBe(0);
});

it('renders source citation chips that call onNavigateSource with the citation route', () => {
  const onNavigateSource = jest.fn();
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: 'hello',
      citations: [{ id: 'project:p1', label: 'Project One', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' }],
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={onNavigateSource} />);
  screen.getByText('Project One').click();
  expect(onNavigateSource).toHaveBeenCalledWith('/projects/p1');
});

it('renders the persistent AI-generated notice under an assistant message', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: 'hello',
      citations: [],
      notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.getByText('AI-generated summary from IOCT records. Verify before making decisions.')).toBeInTheDocument();
});

it('renders error messages distinctly', () => {
  const messages: AiMessage[] = [{ id: '1', role: 'error', text: 'Something went wrong.' }];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
});

it('renders assistant markdown bold/list syntax as real elements, not literal asterisks', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: '1. **ADI B1P1** — **₱583,212.00**\n2. **LEAR MES Interface** — **₱557,203.50**',
      citations: [],
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  const { container } = render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(container.querySelector('ol li')).not.toBeNull();
  expect(screen.getAllByText('ADI B1P1')[0].tagName).toBe('STRONG');
  expect(screen.queryByText(/\*\*/)).toBeNull();
});

it('renders markdown headings with compact semantic hierarchy', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: '# **Project snapshot**\n## At risk\n### Evidence\n- Delayed purchase order',
      citations: [],
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.getByRole('heading', { level: 2, name: 'Project snapshot' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'At risk' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 4, name: 'Evidence' })).toBeInTheDocument();
  expect(screen.queryByText(/^#+/)).toBeNull();
});

it('still treats markdown-shaped model text as inert when it contains HTML', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: '- **<img src=x onerror=alert(1)>**', citations: [], notice: 'n', followUps: [], chart: null },
  ];
  const { container } = render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
});

it('renders follow-up chips for the latest assistant message and sends the tapped question', () => {
  const onFollowUp = jest.fn();
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: 'hello', citations: [], notice: 'n', followUps: ['Which project is largest?'], chart: null },
  ];
  render(<AiMessageList messages={messages} onFollowUp={onFollowUp} onNavigateSource={() => {}} />);
  screen.getByText('Which project is largest?').click();
  expect(onFollowUp).toHaveBeenCalledWith('Which project is largest?');
});

it('does not repeat follow-up chips from an earlier turn once a newer assistant message exists', () => {
  const messages: AiMessage[] = [
    { id: '1', role: 'assistant', text: 'first', citations: [], notice: 'n', followUps: ['Stale question?'], chart: null },
    { id: '2', role: 'user', text: 'second question' },
    { id: '3', role: 'assistant', text: 'second', citations: [], notice: 'n', followUps: ['Fresh question?'], chart: null },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.queryByText('Stale question?')).toBeNull();
  expect(screen.getByText('Fresh question?')).toBeInTheDocument();
});

it('labels each source chip with the kind of record it came from, plus an as-of caption', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: 'ok',
      citations: [
        { id: 'q1', label: 'PCS2602005-ADI-01', route: '/sales/calcsheet/quotations/q1', asOf: '2026-08-13T00:00:00.000Z' },
        { id: 'p1', label: 'ADI B1P1', route: '/projects/p1', asOf: '2026-08-13T00:00:00.000Z' },
      ],
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.getByText('Quotation')).toBeInTheDocument();
  expect(screen.getByText('Project')).toBeInTheDocument();
  expect(screen.getByText(/^2 sources · as of /)).toBeInTheDocument();
});

it('shortens a raw Firestore document id in a source label instead of printing the key', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: 'ok',
      citations: [{
        id: 'q1',
        label: 'Quotation 5u33S6kdLXSf8EiM2WkO',
        route: '/sales/calcsheet/quotations/q1',
        asOf: '2026-08-13T00:00:00.000Z',
      }],
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.queryByText(/5u33S6kdLXSf8EiM2WkO/)).toBeNull();
  expect(screen.getByText('Quotation 5u33S6…')).toBeInTheDocument();
});

it('collapses a long source list behind a "+N more" control', () => {
  const messages: AiMessage[] = [
    {
      id: '1',
      role: 'assistant',
      text: 'ok',
      citations: Array.from({ length: 6 }, (_, index) => ({
        id: `p${index}`,
        label: `Project ${index}`,
        route: `/projects/p${index}`,
        asOf: '2026-08-13T00:00:00.000Z',
      })),
      notice: 'n',
      followUps: [],
      chart: null,
    },
  ];
  render(<AiMessageList messages={messages} onFollowUp={() => {}} onNavigateSource={() => {}} />);
  expect(screen.queryByText('Project 5')).toBeNull();
  fireEvent.click(screen.getByText('+2 more'));
  expect(screen.getByText('Project 5')).toBeInTheDocument();
});
