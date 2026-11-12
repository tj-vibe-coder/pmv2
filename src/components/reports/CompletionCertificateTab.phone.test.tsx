import { render, screen, within } from '@testing-library/react';
import CompletionCertificateTab from './CompletionCertificateTab';
import { Project } from '../../types/Project';

const mockCerts = [
  { id: 'c1', projectId: 'p1', createdAt: 1700000000000, completionDate: '2026-03-01', companyName: 'IO Control Technologie', reportCompany: 'ioct', approverName: 'Ana Client' },
  { id: 'c2', projectId: 'p1', createdAt: 1700100000000, completionDate: '2026-04-01', companyName: '', reportCompany: 'acti', approverName: '' },
];

jest.mock('../ProjectDetails', () => ({
  REPORT_COMPANIES: { ioct: 'IO Control Technologie', acti: 'ACTI' },
  getCompletionCertificates: () => Promise.resolve(mockCerts),
  saveCompletionCertificate: jest.fn(),
  updateCompletionCertificate: jest.fn(),
  deleteCompletionCertificate: jest.fn(),
}));
jest.mock('../../contexts/OneDriveAuthContext', () => ({
  useOneDriveAuth: () => ({ isConfigured: false, isAuthenticated: false, isLoading: false, login: () => {}, getAccessToken: () => null }),
}));
jest.mock('../../config/onedriveConfig', () => ({ isCorporateOneDriveConfigured: () => false }));
jest.mock('../../services/onedriveFolderService', () => ({ resolveCorporateDriveId: jest.fn(), uploadFileToFolderById: jest.fn(), ensureExecutionFolder: jest.fn() }));
jest.mock('../../services/dataService', () => ({ __esModule: true, default: { updateProject: jest.fn() } }));
jest.mock('../../utils/reports/completionCertificatePdf', () => ({ buildCompletionCertificatePdf: jest.fn() }));
jest.mock('../../utils/reports/reportPdfKit', () => ({ REPORT_ISSUERS: {} }));
jest.mock('../../utils/reports/reportLogo', () => ({ loadReportLogo: jest.fn() }));
jest.mock('../../fonts/arialNarrowBase64', () => ({ arialNarrowBase64: '' }));

const project = { id: 'p1', project_name: 'Plant A', project_no: 'PCS1', account_name: 'Client', po_number: 'PO1' } as unknown as Project;
const renderTab = () => render(
  <CompletionCertificateTab
    project={project}
    currentUser={{ full_name: 'Me' }}
    reportCompany={'ioct' as never}
    setReportCompany={jest.fn()}
    preparedBy={{ name: 'Me', designation: 'Eng', company: '', date: '' }}
    onPreview={jest.fn()}
  />,
);

it('desktop keeps the saved certificates table', async () => {
  renderTab();
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

  it('lists saved certificates as cards with Load and Delete', async () => {
    renderTab();
    const card = await screen.findByTestId('saved-cert-c1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(card).getByText('Ana Client')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Load' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /delete certificate/i })).toBeInTheDocument();
    expect(screen.getByTestId('saved-cert-c2')).toBeInTheDocument();
  });
});
