import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServiceReportTab from './ServiceReportTab';
import { Project } from '../../types/Project';

const mockReports = [
  { id: 'r1', project_id: 'p1', reportNo: 'SR-001', date: '2026-03-01', title: 'Monthly visit' },
];

jest.mock('../ProjectDetails', () => ({
  REPORT_COMPANIES: { ioct: 'IO Control Technologie', acti: 'ACTI' },
  getServiceReports: () => Promise.resolve(mockReports),
  saveServiceReport: () => Promise.resolve(),
  updateServiceReport: () => Promise.resolve(),
  deleteServiceReport: () => Promise.resolve(),
  migrateServiceReportsFromLocalStorage: () => Promise.resolve(),
}));
jest.mock('../../contexts/OneDriveAuthContext', () => ({
  useOneDriveAuth: () => ({ isConfigured: false, isAuthenticated: false, isLoading: false, login: () => {}, getAccessToken: () => null }),
}));
jest.mock('../../config/onedriveConfig', () => ({ isCorporateOneDriveConfigured: () => false }));
jest.mock('../../services/onedriveFolderService', () => ({
  resolveCorporateDriveId: () => null, uploadFileToFolderById: () => null, ensureExecutionFolder: () => null,
  getOrCreateChildFolderById: () => null, fetchDriveItemBlob: () => null,
}));
jest.mock('../../services/dataService', () => ({ __esModule: true, default: { updateProject: () => Promise.resolve() } }));
jest.mock('../../utils/reports/serviceReportXlsx', () => ({ buildServiceReportXlsxBlob: () => null }));
jest.mock('../../utils/reports/serviceReportPdf', () => ({ buildServiceReportPdf: () => null }));
jest.mock('../../utils/reports/reportPdfKit', () => ({ REPORT_ISSUERS: {} }));
jest.mock('../../utils/reports/reportLogo', () => ({ loadReportLogo: () => null }));
jest.mock('../../fonts/arialNarrowBase64', () => ({ arialNarrowBase64: '' }));

const project = { id: 'p1', project_name: 'Plant A', project_no: 'PCS1' } as unknown as Project;
const renderTab = () => render(
  <ServiceReportTab
    project={project}
    currentUser={{ full_name: 'Me' }}
    reportCompany={'ioct' as never}
    setReportCompany={() => {}}
    preparedBy={{ name: 'Me', designation: 'Eng', company: '', date: '' }}
    setPreparedBy={() => {}}
    onPreview={() => {}}
  />,
);

it('desktop keeps the activities table', async () => {
  renderTab();
  expect((await screen.findAllByRole('table')).length).toBeGreaterThan(0);
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

  it('shows each activity as a card that can be typed into and added to', async () => {
    renderTab();
    const card = await screen.findByTestId('activity-card-0');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.type(within(card).getByLabelText('Activity'), 'Checked PLC');
    expect(within(card).getByLabelText('Activity')).toHaveValue('Checked PLC');
    await userEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect(screen.getByTestId('activity-card-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove activity 2' }));
    expect(screen.queryByTestId('activity-card-1')).not.toBeInTheDocument();
  });
});
