import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectActivityPage from './ProjectActivityPage';

const activity = {
  days: 30, since: '2026-10-12', today: '2026-11-10',
  totals: { open_items: 2, overdue_items: 1, due_this_week: 1, done_items: 0, updates: 1, emails: 1, projects_active: 1 },
  by_project: [{
    project_id: 'p1', ovp_number: 'IOCT2610005', project_name: 'MDLZ Diverter System', account_name: 'Mondelez', project_status: 'IN PROGRESS',
    progress: 40, open_items: 2, overdue_items: 1, done_items: 0, next_due: '2026-11-08', updates: 1, emails: 1,
    last_activity: '2026-11-09T02:00:00.000Z', latest_update: { date: '2026-11-09', note: 'FAT done', next_step: 'Ship panel' },
  }],
  action_items: [
    { id: 'a1', project_id: 'p1', project: 'IOCT2610005 · MDLZ Diverter System', text: '[RPP] Send revised drawings', owner: 'renzel', due_date: '2026-11-08',
      overdue: true, done: false, done_by: null, done_at: null, progress: null, subtasks_total: 2, subtasks_done: 1, latest_note: null,
      posted_by: 'Projects Agent', via: 'agent', created_at: '2026-11-07T00:00:00Z' },
    { id: 'a2', project_id: 'p1', project: 'IOCT2610005 · MDLZ Diverter System', text: 'Book crane', owner: null, due_date: '2026-11-12',
      overdue: false, done: false, done_by: null, done_at: null, progress: 50, subtasks_total: 0, subtasks_done: 0, latest_note: 'Quote received',
      posted_by: 'RJ', via: 'app', created_at: '2026-11-01T00:00:00Z' },
  ],
  updates: [{ id: 'u1', project_id: 'p1', project: 'IOCT2610005 · MDLZ Diverter System', date: '2026-11-09', type: 'Progress', note: 'FAT done',
    status: null, progress: null, next_step: 'Ship panel', next_date: null, risk: null, link: null, posted_by: 'Projects Agent', via: 'agent', created_at: '2026-11-09T01:00:00Z' }],
  emails: [{ id: 'e1', project_id: 'p1', project: 'IOCT2610005 · MDLZ Diverter System', date: '2026-11-09T02:00:00.000Z', direction: 'inbound',
    subject: 'PO 4500123 released', from: 'buyer@example.com', to: [], summary: 'Client released the PO.', category: 'PO', attachments: [], link: null, logged_by: 'Projects Agent' }],
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => Promise.resolve({
    ok: true,
    statusText: 'OK',
    json: () => Promise.resolve(init?.method === 'PUT' ? { success: true } : activity),
  }));
  (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

const renderPage = () => render(<MemoryRouter><ProjectActivityPage /></MemoryRouter>);

it('shows the totals and the per-project summary', async () => {
  renderPage();
  expect(await screen.findByText('IOCT2610005')).toBeInTheDocument();
  expect(screen.getByText('Open action items')).toBeInTheDocument();
  expect(screen.getByText('past their due date')).toBeInTheDocument();
  expect(screen.getByText('FAT done')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/project-activity\?days=30$/);
});

it('lists action items and ticks one done', async () => {
  renderPage();
  await screen.findByText('IOCT2610005');
  fireEvent.click(screen.getByRole('tab', { name: /Action items/ }));
  expect(screen.getByText('[RPP] Send revised drawings')).toBeInTheDocument();
  expect(screen.getByText('1/2 subtasks')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Mark done' })[0]);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/api/agent/action-items/a1') && init?.method === 'PUT')).toBe(true));
});

it('filters action items by owner', async () => {
  renderPage();
  await screen.findByText('IOCT2610005');
  fireEvent.click(screen.getByRole('tab', { name: /Action items/ }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Owner' }));
  fireEvent.click(screen.getByRole('option', { name: 'Renzel (RPP)' }));
  expect(screen.getByText('[RPP] Send revised drawings')).toBeInTheDocument();
  expect(screen.queryByText('Book crane')).not.toBeInTheDocument();
});

it('shows logged emails with their summary on expand', async () => {
  renderPage();
  await screen.findByText('IOCT2610005');
  fireEvent.click(screen.getByRole('tab', { name: /Emails/ }));
  expect(screen.getByText('PO 4500123 released')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show summary' }));
  expect(await screen.findByText('Client released the PO.')).toBeInTheDocument();
});
