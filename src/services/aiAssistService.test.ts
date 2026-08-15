jest.mock('../config/api', () => ({
  API_BASE: 'http://lan-host:3001',
}));

import { sendAiChat, requestLiveToken, executeLiveTool, confirmAiProposal, rejectAiProposal, AiAssistError } from './aiAssistService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem('netpacific_token', 'token');
});

it('includes the bearer token and the request body on a successful call', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      requestId: 'r1',
      answer: 'hello',
      citations: [],
      followUps: [],
      notice: 'AI-generated summary from IOCT records. Verify before making decisions.',
    }),
  });

  const result = await sendAiChat([{ role: 'user', text: 'hi' }], { route: '/projects', projectId: null, opportunityId: null, quotationId: null });

  expect(result.answer).toBe('hello');
  expect(fetchMock).toHaveBeenCalledWith(
    'http://lan-host:3001/api/ai-assist/chat',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      body: JSON.stringify({
        messages: [{ role: 'user', text: 'hi' }],
        pageContext: { route: '/projects', projectId: null, opportunityId: null, quotationId: null },
      }),
    }),
  );
});

it('includes priorToolResults on the chat request when provided', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      requestId: 'r1',
      answer: 'hello',
      citations: [],
      followUps: [],
      notice: 'n',
    }),
  });
  await sendAiChat(
    [{ role: 'user', text: 'how many?' }],
    { route: '/dashboard', projectId: null, opportunityId: null, quotationId: null },
    undefined,
    [{ name: 'navigate_to_record', data: { action: 'navigate', id: 'opp1' } }],
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
  expect(body.priorToolResults).toEqual([
    { name: 'navigate_to_record', data: { action: 'navigate', id: 'opp1' } },
  ]);
});

it('propagates an AbortSignal to fetch', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, requestId: 'r1', answer: 'hi', citations: [], followUps: [], notice: 'n' }),
  });
  const controller = new AbortController();
  await sendAiChat([{ role: 'user', text: 'hi' }], null, controller.signal);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ signal: controller.signal }),
  );
});

it('turns a non-JSON error response into a generic error message', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => { throw new Error('not json'); },
  });
  await expect(sendAiChat([{ role: 'user', text: 'hi' }], null)).rejects.toThrow(AiAssistError);
});

it('distinguishes 401 from 403', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ ok: false, error: 'unauthenticated' }) });
  await expect(sendAiChat([{ role: 'user', text: 'hi' }], null)).rejects.toMatchObject({ status: 401 });

  fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ ok: false, error: 'not_allowlisted' }) });
  await expect(sendAiChat([{ role: 'user', text: 'hi' }], null)).rejects.toMatchObject({ status: 403 });
});

it('requestLiveToken requires a liveSessionId and executeLiveTool sends it', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      token: 'ephemeral',
      model: 'gemini-3.1-flash-live-preview',
      expireTime: '2026-08-14T00:00:00.000Z',
      newSessionExpireTime: '2026-08-14T00:00:00.000Z',
    }),
  });
  await expect(requestLiveToken()).rejects.toThrow(AiAssistError);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      token: 'ephemeral',
      model: 'gemini-3.1-flash-live-preview',
      liveSessionId: 'sess-1',
      expireTime: '2026-08-14T00:00:00.000Z',
      newSessionExpireTime: '2026-08-14T00:00:00.000Z',
    }),
  });
  await expect(requestLiveToken()).resolves.toMatchObject({ liveSessionId: 'sess-1' });

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { n: 1 }, sources: [] }),
  });
  await executeLiveTool('search_projects', { search: 'plant' }, 'sess-1');
  expect(fetchMock).toHaveBeenLastCalledWith(
    'http://lan-host:3001/api/ai-assist/tools/search_projects',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ args: { search: 'plant' }, liveSessionId: 'sess-1' }),
    }),
  );
});

it('parses a chat proposal when present', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      requestId: 'r1',
      answer: 'draft ready',
      citations: [],
      followUps: [],
      notice: 'n',
      proposal: {
        proposalId: 'p1',
        kind: 'opportunity',
        recordId: 'opp1',
        label: 'Rezcoat',
        field: 'opportunityGrade',
        currentValue: 'B',
        proposedValue: 'A',
        reason: 'stronger signal',
        expiresAt: '2026-08-15T00:10:00.000Z',
      },
    }),
  });
  const result = await sendAiChat([{ role: 'user', text: 'grade A' }], null);
  expect(result.proposal).toMatchObject({ proposalId: 'p1', field: 'opportunityGrade', proposedValue: 'A' });
});

it('confirmAiProposal posts the confirm route and rejectAiProposal posts reject', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      applied: true,
      proposalId: 'p1',
      kind: 'opportunity',
      recordId: 'opp1',
      label: 'Rezcoat',
      field: 'status',
      currentValue: 'sent',
      proposedValue: 'for_review',
    }),
  });
  await expect(confirmAiProposal('p1')).resolves.toMatchObject({ applied: true, proposalId: 'p1' });
  expect(fetchMock).toHaveBeenLastCalledWith(
    'http://lan-host:3001/api/ai-assist/proposals/p1/confirm',
    expect.objectContaining({ method: 'POST' }),
  );

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, rejected: true, proposalId: 'p1' }),
  });
  await expect(rejectAiProposal('p1')).resolves.toEqual({ rejected: true, proposalId: 'p1' });
  expect(fetchMock).toHaveBeenLastCalledWith(
    'http://lan-host:3001/api/ai-assist/proposals/p1/reject',
    expect.objectContaining({ method: 'POST' }),
  );
});

it('rejects a malformed successful payload instead of returning it', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, requestId: 'r1', answer: 123, citations: null, followUps: [], notice: 'n' }),
  });
  await expect(sendAiChat([{ role: 'user', text: 'hi' }], null)).rejects.toThrow(AiAssistError);
});
