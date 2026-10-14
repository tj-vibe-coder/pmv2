import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiquidationReceiptReview from './LiquidationReceiptReview';
let mockRole = 'admin';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reviewer', full_name: 'Actual Reviewer', username: 'RJR', role: mockRole } }) }));
const empty = { review: null, status: 'not_reviewed', contentHash: 'saved-hash', revision: 0, canRecord: true, canSubmitPhysical: true, isRj: true, workflowStatus: 'awaiting_rj_review' };
const reviewed = { active: true, revision: 1, reviewedBy: 'reviewer', reviewedByName: 'Actual Reviewer', reviewDate: '2026-10-01', recordedAt: '2026-10-14T03:00:00.000Z', note: 'Paper originals checked' };
let current: typeof empty | Record<string, unknown>;
const fetchMock = jest.fn();
beforeEach(() => {
  mockRole = 'admin'; current = empty; fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === 'POST') current = { ...empty, review: reviewed, status: 'reviewed', revision: 1 };
    return { ok: true, json: async () => current };
  });
  global.fetch = fetchMock;
});
const show = (props = {}) => render(<LiquidationReceiptReview liquidationId="liq1" contentHash="saved-hash" readOnly={false} onReload={jest.fn().mockResolvedValue(undefined)} {...props} />);

test('records a confirmed manual paper review with actual date and server-controlled reviewer', async () => {
  show(); await screen.findByText('Not reviewed'); fireEvent.click(screen.getByRole('button', { name: 'Record receipt review' }));
  expect(screen.getByLabelText('Reviewed by')).toHaveValue('Actual Reviewer');
  expect(screen.getByRole('button', { name: 'Save receipt review' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Review date'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Review notes (optional)'), { target: { value: 'Paper originals checked' } });
  screen.getAllByRole('checkbox').forEach(box => fireEvent.click(box));
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt review' }));
  await screen.findByText('Receipts reviewed');
  const call = fetchMock.mock.calls.find(([, options]) => options.method === 'POST');
  const body = JSON.parse(call[1].body);
  expect(body).toEqual({ action: 'review', contentHash: 'saved-hash', revision: 0, reviewDate: '2026-10-01', note: 'Paper originals checked', confirmed: true, physicalReceiptConfirmed: true });
  expect(body.reviewedBy).toBeUndefined(); expect(body.total_amount).toBeUndefined();
  expect(screen.getByText('Actual Reviewer')).toBeInTheDocument();
});
test('ordinary owners see reviewer and date without review-writing controls', async () => {
  mockRole = 'user'; current = { ...empty, review: reviewed, status: 'reviewed', revision: 1, canRecord: false, isRj: false };
  show(); await screen.findByText('Receipts reviewed');
  expect(screen.getByText('Actual Reviewer')).toBeInTheDocument(); expect(screen.getByText('2026-10-01')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record another receipt review' })).not.toBeInTheDocument();
});
test('changed saved forms display old review and require review again; an outdated view cannot attest', async () => {
  current = { ...empty, review: reviewed, status: 'review_required', revision: 1, contentHash: 'new-hash' };
  const reload = jest.fn().mockResolvedValue(undefined); show({ onReload: reload });
  await screen.findByText('Review required — form changed');
  expect(screen.getByRole('button', { name: 'Record receipt review' })).toBeDisabled();
  expect(screen.getByText(/Previous review by/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload liquidation' })); expect(reload).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
test('an edit in progress blocks a new attestation and withdrawal requires a reason', async () => {
  current = { ...empty, review: reviewed, status: 'reviewed', revision: 1 };
  const view = show({ readOnly: true }); await screen.findByText('Receipts reviewed');
  expect(screen.getByRole('button', { name: 'Record another receipt review' })).toBeDisabled();
  view.rerender(<LiquidationReceiptReview liquidationId="liq1" contentHash="saved-hash" readOnly={false} onReload={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw review' }));
  const buttons = screen.getAllByRole('button', { name: 'Withdraw review' }); expect(buttons[buttons.length - 1]).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Withdrawal reason'), { target: { value: 'Recheck one receipt' } });
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST' && JSON.parse(options.body).action === 'withdraw')).toBe(true));
});
test('conflict keeps the review unsaved and allows status refresh', async () => {
  fetchMock.mockImplementation(async (_url, options) => options.method === 'POST' ? { ok: false, json: async () => ({ error: 'Review changed; refresh its status before saving' }) } : { ok: true, json: async () => empty });
  show(); await screen.findByText('Not reviewed'); fireEvent.click(screen.getByRole('button', { name: 'Record receipt review' }));
  screen.getAllByRole('checkbox').forEach(box => fireEvent.click(box)); fireEvent.click(screen.getByRole('button', { name: 'Save receipt review' }));
  expect((await screen.findAllByText('Review changed; refresh its status before saving')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh review status' }));
  await waitFor(() => expect(screen.queryByText('Review changed; refresh its status before saving')).not.toBeInTheDocument());
});

test('staff can record physical handover but cannot perform RJ review', async () => {
  mockRole = 'user'; current = { ...empty, review: null, isRj: false, canRecord: false, workflowStatus: 'awaiting_physical' };
  show(); await screen.findByText('Awaiting physical receipts');
  expect(screen.queryByRole('button', { name: 'Record receipt review' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark physical copies submitted to RJ' }));
  fireEvent.change(await screen.findByLabelText('Submission date'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Save physical receipt status' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('/physical-receipts') && JSON.parse(options.body).action === 'submit')).toBe(true));
});

test('returned copies show RJ reason/actor/time separately from the original handover note/date/actor', async () => {
  const returnedAt = '2026-10-14T06:30:00.000Z';
  current = { ...empty, status: 'withdrawn', workflowStatus: 'awaiting_physical', review: { ...reviewed, active: false, physicalSubmission: {
    active: false, version: 1, submittedDate: '2026-10-13', submittedByName: 'Fixture Employee', note: 'Original printed form and originals handed to RJ',
    returnReason: 'Missing original toll receipt', returnedBy: 'rj-id', returnedByName: 'Fixture RJ', returnedAt,
  } } };
  show();
  await screen.findByText('Physical copies returned');
  expect(screen.getByText('Return reason: Missing original toll receipt')).toBeInTheDocument();
  expect(screen.getByText(`Returned by: Fixture RJ · Returned at: ${new Date(returnedAt).toLocaleString()}`)).toBeInTheDocument();
  expect(screen.getByText('Original handover to RJ · 2026-10-13 · Recorded by Fixture Employee')).toBeInTheDocument();
  expect(screen.getByText('Handover note: Original printed form and originals handed to RJ')).toBeInTheDocument();
});

test('older return records show their recorded return actor ID without borrowing the staff identity', async () => {
  current = { ...empty, status: 'withdrawn', workflowStatus: 'awaiting_physical', review: { ...reviewed, active: false, physicalSubmission: {
    active: false, version: 1, submittedDate: '2026-10-13', submittedByName: 'Staff Member', note: 'Old handover note', returnReason: 'Return for correction', returnedBy: 'legacy-rj-id', returnedAt: '2026-10-14T06:30:00.000Z',
  } } };
  show(); await screen.findByText('Physical copies returned');
  expect(screen.getByText(/Returned by: legacy-rj-id/)).toBeInTheDocument();
  expect(screen.queryByText(/Returned by: Staff Member/)).not.toBeInTheDocument();
  expect(screen.getByText('Return reason: Return for correction')).toBeInTheDocument();
});
