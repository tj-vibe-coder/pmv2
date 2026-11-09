import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from './UsersPage';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'superadmin' }, updateCachedUser: jest.fn() }),
}));

const USERS = [
  { id: 'u1', username: 'boss', email: 'boss@x.com', full_name: 'Boss Person', designation: 'Director', contact_number: '0917', role: 'superadmin', approved: 1, created_at: 1700000000, updated_at: 1700000000 },
  { id: 'u2', username: 'staff', email: 'staff@x.com', full_name: null, designation: null, contact_number: null, role: 'user', approved: 0, project_monitoring: true, created_at: 1700000000, updated_at: 1700000000 },
];

beforeEach(() => {
  localStorage.setItem('netpacific_token', 't');
  (global as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => {
    const body = url.includes('/api/users') ? { success: true, users: USERS } : [];
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) });
  });
});
afterEach(() => localStorage.removeItem('netpacific_token'));

it('desktop keeps the table', async () => {
  render(<UsersPage />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
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

  it('shows one card per user with status, and disables deleting your own account', async () => {
    render(<UsersPage />);
    const boss = await screen.findByTestId('user-card-u1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(boss).getByText('Boss Person')).toBeInTheDocument();
    expect(within(boss).getByText('Approved')).toBeInTheDocument();
    expect(within(boss).getByRole('button', { name: /delete user/i })).toBeDisabled();
    const staff = screen.getByTestId('user-card-u2');
    expect(within(staff).getByText('Pending')).toBeInTheDocument();
    expect(within(staff).getByRole('button', { name: /delete user/i })).toBeEnabled();
  });

  it('edits inside the card and can be cancelled', async () => {
    render(<UsersPage />);
    const staff = await screen.findByTestId('user-card-u2');
    await userEvent.click(within(staff).getByRole('button', { name: /edit/i }));
    expect(within(screen.getByTestId('user-card-u2')).getByLabelText('Username')).toHaveValue('staff');
    expect(within(screen.getByTestId('user-card-u2')).getByLabelText(/new password/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(within(screen.getByTestId('user-card-u2')).queryByLabelText('Username')).not.toBeInTheDocument());
  });
});
