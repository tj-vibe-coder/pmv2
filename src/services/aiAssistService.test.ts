jest.mock('../config/api', () => ({
  API_BASE: 'http://lan-host:3001',
}));

import { sendAiChat, AiAssistError } from './aiAssistService';

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

  const result = await sendAiChat([{ role: 'user', text: 'hi' }], { route: '/projects', projectId: null });

  expect(result.answer).toBe('hello');
  expect(fetchMock).toHaveBeenCalledWith(
    'http://lan-host:3001/api/ai-assist/chat',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      body: JSON.stringify({
        messages: [{ role: 'user', text: 'hi' }],
        pageContext: { route: '/projects', projectId: null },
      }),
    }),
  );
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

it('rejects a malformed successful payload instead of returning it', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, requestId: 'r1', answer: 123, citations: null, followUps: [], notice: 'n' }),
  });
  await expect(sendAiChat([{ role: 'user', text: 'hi' }], null)).rejects.toThrow(AiAssistError);
});
