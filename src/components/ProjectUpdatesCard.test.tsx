import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectUpdatesCard from './ProjectUpdatesCard';

const UPDATES = [
  {
    id: 'u2', date: '2026-11-01', type: 'Site work', note: 'Cable pulling done', progress: 55,
    posted_by: 'RPP', posted_by_id: '2', posted_via: 'app', created_at: '2026-11-01T08:00:00Z',
  },
  {
    id: 'u1', date: '2026-10-31', type: 'Submittal', note: 'Sent shop drawings Rev.0 to ISTS',
    next_step: 'Await ISTS comments', next_date: '2026-11-07',
    posted_by: 'Projects Agent', posted_by_id: 'agent_x', posted_via: 'agent', created_at: '2026-10-31T09:00:00Z',
  },
];

describe('ProjectUpdatesCard', () => {
  const realFetch = window.fetch;
  let calls: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    calls = [];
    window.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, update: { id: 'u3' } }), { status: 201 });
      }
      return new Response(JSON.stringify({ success: true, updates: UPDATES }), { status: 200 });
    }) as unknown as typeof window.fetch;
  });

  afterEach(() => {
    window.fetch = realFetch;
  });

  it('lists updates with who posted them and the next step', async () => {
    const onChanged = jest.fn();
    render(<ProjectUpdatesCard projectId="sual" currentUserId="2" onChanged={onChanged} />);
    expect(await screen.findByText('Cable pulling done')).toBeInTheDocument();
    expect(screen.getByText('Sent shop drawings Rev.0 to ISTS')).toBeInTheDocument();
    expect(screen.getByText('Projects Agent')).toBeInTheDocument();
    expect(screen.getByText(/Next: Await ISTS comments/)).toBeInTheDocument();
    // Only the poster's own entry offers delete.
    expect(screen.getAllByLabelText('Delete update')).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledWith(UPDATES, 'load');
  });

  it('posts a new update and reloads the list', async () => {
    const onChanged = jest.fn();
    render(<ProjectUpdatesCard projectId="sual" onChanged={onChanged} />);
    await screen.findByText('Cable pulling done');
    fireEvent.click(screen.getByRole('button', { name: /post update/i }));
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Sent IFC drawings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(UPDATES, 'post'));
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(post?.url).toMatch(/\/api\/projects\/sual\/updates$/);
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ note: 'Sent IFC drawings', type: 'Progress' });
  });

  it('hides Post update for people who cannot post', async () => {
    render(<ProjectUpdatesCard projectId="sual" canPost={false} />);
    await screen.findByText('Cable pulling done');
    expect(screen.queryByRole('button', { name: /post update/i })).not.toBeInTheDocument();
  });
});
