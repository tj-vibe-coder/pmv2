import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvoiceDocumentsPanel from './InvoiceDocumentsPanel';
import { evidenceRequest } from '../../services/financeEvidenceService';
import { uploadFileToFolder } from '../../services/onedriveFolderService';
import type { ProjectInvoice } from '../../types/Invoice';

let mockRole = 'admin';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reviewer', role: mockRole } }) }));
jest.mock('../../services/financeEvidenceService', () => ({ evidenceRequest: jest.fn() }));
jest.mock('../../services/onedriveFolderService', () => ({ uploadFileToFolder: jest.fn() }));
const request = evidenceRequest as jest.Mock;
const upload = uploadFileToFolder as jest.Mock;
const invoice = { id: 'si008', project_id: 'adi', invoice_no: 'SI008', amount: 193414.05, amount_collected: 185677.49, wht_amount: 7736.56, collection_date: '2026-09-10', wht_2307_status: 'received' } as ProjectInvoice;
const empty = { links: [], legacy: { webUrl: 'https://example.com/legacy', filename: 'original-pack.pdf' } };
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); mockRole = 'admin'; request.mockResolvedValue(empty); });

test('legacy pack remains viewable with received history independent of direct certificate availability', async () => {
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  expect(await screen.findByText('original-pack.pdf')).toHaveAttribute('href', 'https://example.com/legacy');
  expect(screen.getByText(/No standalone BIR 2307 linked/)).toHaveTextContent('Historical flag: received');
  expect(screen.getByText(/Supporting documents do not record a payment/)).toBeInTheDocument();
});
test('linking existing file posts only evidence metadata and preserves invoice amounts', async () => {
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText('original-pack.pdf');
  fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Oct 14 audit' } });
  fireEvent.change(screen.getByLabelText('Existing HTTPS file URL'), { target: { value: 'https://example.com/cr006' } });
  fireEvent.change(screen.getByLabelText('Filename'), { target: { value: 'CR006.pdf' } });
  fireEvent.click(screen.getByRole('button', { name: 'Link document' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/links', 'POST', expect.objectContaining({ invoiceIds: ['si008'], source: 'Oct 14 audit', document: { webUrl: 'https://example.com/cr006', filename: 'CR006.pdf' } })));
  const body = request.mock.calls.find(c => c[1] === 'POST')[2];
  expect(body.amount_collected).toBeUndefined(); expect(body.wht_amount).toBeUndefined(); expect(upload).not.toHaveBeenCalled();
});
test('successful upload followed by failed link retains retry metadata without uploading again', async () => {
  upload.mockResolvedValue({ id: 'uploaded1', driveId: 'drive1', webUrl: 'https://example.com/proof1', name: 'proof1.pdf' });
  request.mockImplementation((path, method) => method === 'POST' ? Promise.reject(new Error('Link unavailable; retry')) : Promise.resolve(empty));
  const view = render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText('original-pack.pdf');
  fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Original scan' } });
  fireEvent.change(screen.getByLabelText('Upload invoice evidence'), { target: { files: [new File(['%PDF-1.4'], 'proof.pdf', { type: 'application/pdf' })] } });
  await screen.findByText(/Ready to link/);
  fireEvent.click(screen.getByRole('button', { name: 'Link document' }));
  await screen.findByText('Link unavailable; retry');
  expect(JSON.parse(sessionStorage.getItem('finance-evidence-upload:si008') || '{}').itemId).toBe('uploaded1');
  view.unmount();
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText(/Ready to link/);
  expect(screen.queryByLabelText('Upload invoice evidence')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Original scan' } });
  request.mockImplementation(() => Promise.resolve(empty));
  fireEvent.click(screen.getByRole('button', { name: 'Link document' }));
  await waitFor(() => expect(sessionStorage.getItem('finance-evidence-upload:si008')).toBeNull());
  expect(upload).toHaveBeenCalledTimes(1);
});
test('tax filer only classifies 2307, viewer has read-only evidence access', async () => {
  mockRole = 'tax_filer';
  const view = render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText('original-pack.pdf');
  expect(screen.getByRole('combobox', { name: 'Evidence type' })).toHaveTextContent('BIR 2307');
  view.unmount(); mockRole = 'viewer';
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText('original-pack.pdf');
  expect(screen.queryByRole('button', { name: 'Link document' })).not.toBeInTheDocument();
});
test('2307 review sends printed evidence independently from actual WHT and source history', async () => {
  const row = { id: 'link1', documentId: 'doc1', revision: 1, type: 'bir2307', active: true, source: 'audit', reference: '', documentDate: '', document: { id: 'doc1', revision: 1, filename: '2307.pdf', webUrl: 'https://example.com/2307', provenance: 'onedrive' } };
  request.mockResolvedValue({ ...empty, links: [row] });
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} initialType="bir2307" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review 2307' }));
  fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-09-30' } });
  fireEvent.change(screen.getByLabelText('Printed income base (PHP)'), { target: { value: '172691.13' } });
  fireEvent.change(screen.getByLabelText('Printed WHT (PHP)'), { target: { value: '7736.56' } });
  fireEvent.change(screen.getByLabelText('Printed ATC'), { target: { value: 'WC158' } });
  fireEvent.change(screen.getByLabelText('Review flags (one per line)'), { target: { value: 'Base/rate mismatch\nGoods versus engineering' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save certificate evidence' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/documents/doc1/certificate', 'PUT', expect.objectContaining({ printedIncomeCentavos: 17269113, printedWhtCentavos: 773656, printedAtc: 'WC158', allocations: [{ invoiceId: 'si008', whtCentavos: 773656 }] })));
});

test('Refresh discards a conflicted reference draft and reopening saves the latest revision', async () => {
  const original = { id: 'link1', documentId: 'doc1', revision: 1, type: 'supporting_pack', active: true, source: 'original source', reference: 'original ref', documentDate: '', document: { id: 'doc1', revision: 1, filename: 'pack.pdf', webUrl: 'https://example.com/pack', provenance: 'onedrive' } };
  let current = original;
  request.mockImplementation((_path, method) => method === 'PATCH' ? Promise.reject(new Error('Evidence changed; reload before saving')) : Promise.resolve({ ...empty, links: [current] }));
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit reference' }));
  fireEvent.change(screen.getByLabelText('Reference number'), { target: { value: 'stale unsaved draft' } });
  current = { ...original, revision: 2, reference: 'other reviewer ref' };
  fireEvent.click(screen.getByRole('button', { name: 'Save reference' }));
  await screen.findByText('Evidence changed; reload before saving');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh and discard drafts' }));
  await screen.findByText(/Unsaved drafts discarded/);
  expect(screen.queryByRole('button', { name: 'Save reference' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit reference' }));
  expect(screen.getByLabelText('Reference number')).toHaveValue('other reviewer ref');
  fireEvent.change(screen.getByLabelText('Reference number'), { target: { value: 'reviewed correction' } });
  request.mockImplementation(() => Promise.resolve({ ...empty, links: [current] }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reference' }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith('/invoices/si008/documents'));
  expect(request).toHaveBeenCalledWith('/links/link1', 'PATCH', expect.objectContaining({ revision: 2, reference: 'reviewed correction' }));
});

test('Refresh discards a conflicted certificate draft and reopening uses fresh printed values and revision', async () => {
  const cert = { certificateNumber: 'original', periodStart: '2026-09-01', periodEnd: '2026-09-30', printedIncomeCentavos: 17269113, printedWhtCentavos: 773656, printedAtc: 'WC158', printedDescription: 'Goods', observedCalculation: '', reviewState: 'discrepancy', reviewNote: '', reviewFlags: [], allocations: [{ invoiceId: 'si008', whtCentavos: 773656 }] };
  const original = { id: 'link1', documentId: 'doc1', revision: 1, type: 'bir2307', active: true, source: 'audit', reference: '', documentDate: '', document: { id: 'doc1', revision: 2, filename: '2307.pdf', webUrl: 'https://example.com/cert', provenance: 'onedrive', certificate: cert } };
  let current = original;
  request.mockImplementation((_path, method) => method === 'PUT' ? Promise.reject(new Error('Evidence changed; reload before saving')) : Promise.resolve({ ...empty, links: [current] }));
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} initialType="bir2307" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review 2307' }));
  fireEvent.change(screen.getByLabelText('Certificate number'), { target: { value: 'stale draft' } });
  current = { ...original, document: { ...original.document, revision: 3, certificate: { ...cert, certificateNumber: 'newer original' } } };
  fireEvent.click(screen.getByRole('button', { name: 'Save certificate evidence' }));
  await screen.findByText('Evidence changed; reload before saving');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh and discard drafts' }));
  await screen.findByText(/Unsaved drafts discarded/);
  expect(screen.queryByRole('button', { name: 'Save certificate evidence' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review 2307' }));
  expect(screen.getByLabelText('Certificate number')).toHaveValue('newer original');
  request.mockImplementation(() => Promise.resolve({ ...empty, links: [current] }));
  fireEvent.click(screen.getByRole('button', { name: 'Save certificate evidence' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/documents/doc1/certificate', 'PUT', expect.objectContaining({ revision: 3, certificateNumber: 'newer original' })));
});


test.each(['certificate.pdf', 'certificate.pdf.pdf', `${'long'.repeat(80)}.PDF`, 'scan.JpEg', 'scan.tiff'])('upload keeps one extension and unique names for %s, and requests server project resolution', async original => {
  upload.mockImplementation((_token, _drive, _root, name) => Promise.resolve({ id: 'uploaded', driveId: 'drive', webUrl: 'https://example.com/proof', name }));
  render(<InvoiceDocumentsPanel invoice={{ ...invoice, project_no: 'stale-project-number', project_name: 'stale project name' }} onClose={() => {}} initialType="bir2307" />);
  await screen.findByText('original-pack.pdf');
  fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Original scan' } });
  const file = new File(['fixture'], original, { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Upload invoice evidence'), { target: { files: [file] } });
  await screen.findByText(/Ready to link/);
  const [token, drive, root, name, uploaded, type, invoiceId] = upload.mock.calls[0];
  expect([token, drive, root, uploaded, type, invoiceId]).toEqual(['server', 'server', '01 Execution', file, 'bir2307', invoice.id]);
  const extension = original.slice(original.lastIndexOf('.'));
  expect(name.endsWith(extension)).toBe(true);
  expect(name.toLowerCase().split(extension.toLowerCase())).toHaveLength(2);
  expect(name).toMatch(/^SI008_\d+_[a-z0-9]+_/);
  expect(name.length).toBeLessThan(220);
});

test('unresolved project folder leaves upload recovery and evidence links untouched', async () => {
  upload.mockRejectedValue(new Error('Project execution folder missing or ambiguous'));
  render(<InvoiceDocumentsPanel invoice={invoice} onClose={() => {}} />);
  await screen.findByText('original-pack.pdf');
  fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Original scan' } });
  fireEvent.change(screen.getByLabelText('Upload invoice evidence'), { target: { files: [new File(['fixture'], 'proof.pdf')] } });
  await screen.findByText('Project execution folder missing or ambiguous');
  expect(sessionStorage.getItem('finance-evidence-upload:si008')).toBeNull();
  expect(request.mock.calls.every(call => !call[1])).toBe(true);
});
