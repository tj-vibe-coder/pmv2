import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectActivityPage from './ProjectActivityPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));

const DATA = {
  days: 30, since: '2026-10-10', today: '2026-11-09',
  totals: { open_items: 2, overdue_items: 1, due_this_week: 1, done_items: 0, updates: 1, emails: 1, projects_active: 1 },
  by_project: [{
    project_id: 'p1', ovp_number: 'OVP-001', project_name: 'Alpha Plant', account_name: 'Acme', project_status: 'Ongoing', progress: 40,
    open_items: 2, overdue_items: 1, done_items: 0, next_due: '2026-11-12', updates: 1, emails: 1, last_activity: '2026-11-08T03:00:00.000Z',
    latest_update: { date: '2026-11-08', note: 'Waiting on the supplier quote', by: 'Nylle', next_step: 'Chase quote', next_date: '2026-11-12', risk: 'low' },
  }],
  action_items: [{
    id: 'ai1', project_id: 'p1', project: 'Alpha Plant', text: 'Send revised quotation', owner: 'nylle', due_date: '2026-11-01', overdue: true,
    done: false, done_by: null, done_at: null, progress: 20, subtasks_total: 3, subtasks_done: 1, latest_note: 'Draft ready', posted_by: 'RJ', via: 'user', created_at: null,
  }],
  updates: [{
    id: 'u1', project_id: 'p1', project: 'Alpha Plant', date: '2026-11-08', type: 'Site visit', note: 'Panels installed', status: 'On track',
    progress: 40, next_step: 'Commissioning', next_date: '2026-11-15', risk: 'high', link: null, posted_by: 'Renzel', via: 'agent', created_at: null,
  }],
  emails: [{
    id: 'e1', project_id: 'p1', project: 'Alpha Plant', date: '2026-11-07T02:00:00.000Z', direction: 'inbound', subject: 'PO confirmation', from: 'buyer@example.com',
    to: ['us@example.com'], summary: 'They confirmed the purchase order.', category: 'PO', attachments: [{ name: 'po.pdf' }], link: null, logged_by: 'TJ',
  }],
};

const fetchMock = jest.fn();
beforeEach(() => {
  mockNavigate.mockClear();
  fetchMock.mockReset().mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('/project-activity') ? DATA : { success: true }) }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

const renderPage = () => render(<MemoryRouter><ProjectActivityPage /></MemoryRouter>);

describe('desktop', () => {
  it('keeps the table', async () => {
    renderPage();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('OVP-001')).toBeInTheDocument();
  });
});

describe('phone layout', () => {
  const realMatchMedia = window.matchMedia;
  beforeAll(() => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width:599.95px'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterAll(() => { window.matchMedia = realMatchMedia; });

  it('shows projects as tappable cards instead of a table', async () => {
    renderPage();
    const number = await screen.findByText('OVP-001');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByTestId('activity-project-p1');
    expect(within(card).getByText(/Alpha Plant · Acme/)).toBeInTheDocument();
    expect(within(card).getByText('Ongoing · 40%')).toBeInTheDocument();
    expect(within(card).getByText('Waiting on the supplier quote')).toBeInTheDocument();
    expect(within(card).getByText(/Next: Chase quote/)).toBeInTheDocument();
    fireEvent.click(number);
    expect(mockNavigate).toHaveBeenCalledWith('/projects/p1');
  });

  it('action items: shows due state and lets you tick one off', async () => {
    renderPage();
    await screen.findByText('OVP-001');
    fireEvent.click(screen.getByRole('tab', { name: /Action items/ }));
    expect(await screen.findByText('Send revised quotation')).toBeInTheDocument();
    expect(screen.getByText(/Due Nov 1, 2026 · 20% · 1\/3 subtasks/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/agent/action-items/ai1'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ done: true }) }),
    ));
  });

  it('updates: shows the note, risk and next step', async () => {
    renderPage();
    await screen.findByText('OVP-001');
    fireEvent.click(screen.getByRole('tab', { name: /Updates/ }));
    expect(await screen.findByText('Panels installed')).toBeInTheDocument();
    expect(screen.getByText('high risk')).toBeInTheDocument();
    expect(screen.getByText(/Next: Commissioning/)).toBeInTheDocument();
    expect(screen.getByText('On track · 40% site progress')).toBeInTheDocument();
  });

  it('emails: the summary stays folded until you ask for it', async () => {
    renderPage();
    await screen.findByText('OVP-001');
    fireEvent.click(screen.getByRole('tab', { name: /Emails/ }));
    expect(await screen.findByText('PO confirmation')).toBeInTheDocument();
    expect(screen.queryByText('They confirmed the purchase order.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show summary/i }));
    expect(await screen.findByText('They confirmed the purchase order.')).toBeInTheDocument();
    expect(screen.getByText(/Logged by TJ/)).toBeInTheDocument();
  });
});
