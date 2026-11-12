import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProgressReportTab from './ProgressReportTab';
import { Project } from '../../types/Project';

const mockWbs = [
  { id: 'w1', code: '1', name: 'Engineering', weight: 0, progress: 0 },
  { id: 'w2', code: '1.1', name: 'Design', weight: 40, progress: 50 },
  { id: 'w3', code: '1.2', name: 'Programming', weight: 60, progress: 100 },
];
const mockSaved = [
  { id: 's1', projectId: 1, pbNumber: '2', date: '2026-03-01', overallProgress: 80 },
];

jest.mock('../ProjectDetails', () => ({
  loadWBS: () => mockWbs,
  saveWBS: () => {},
  parseWBSNum: (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; },
  getProgressReports: () => Promise.resolve(mockSaved),
  saveProgressReport: () => Promise.resolve(),
  updateProgressReport: () => Promise.resolve(),
  deleteProgressReport: () => Promise.resolve(),
  migrateProgressSnapshotsFromLocalStorage: () => Promise.resolve(),
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
jest.mock('../../utils/reports/progressReportPdf', () => ({ buildProgressReportPdf: () => null }));
jest.mock('../../utils/reports/scheduleAnnex', () => ({
  appendPdfs: () => null, renderScheduleAttachment: () => null, fetchScheduleTasks: () => Promise.resolve([]),
}));
jest.mock('../../utils/reports/reportPdfKit', () => ({ REPORT_ISSUERS: {} }));
jest.mock('../../utils/reports/reportLogo', () => ({ loadReportLogo: () => null }));
jest.mock('../../fonts/arialNarrowBase64', () => ({ arialNarrowBase64: '' }));
jest.mock('file-saver', () => ({ saveAs: () => {} }));

const project = { id: 1, project_name: 'Plant A', project_no: 'PCS1' } as unknown as Project;
const renderTab = () => render(
  <MemoryRouter>
    <ProgressReportTab
      project={project}
      currentUser={{ full_name: 'Me' }}
      reportCompany={'ioct' as never}
      setReportCompany={() => {}}
      preparedBy={{ name: 'Me', designation: 'Eng', company: '', date: '' }}
      setPreparedBy={() => {}}
      onPreview={() => {}}
    />
  </MemoryRouter>,
);

it('desktop keeps the WBS table', async () => {
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

  it('shows WBS rows as cards: sub-header is read-only, items editable, with a total', async () => {
    renderTab();
    const header = await screen.findByTestId('wbs-card-w1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Sub-header rolls up its children — weight/progress are not inputs.
    expect(within(header).queryByLabelText('Weight %')).not.toBeInTheDocument();
    expect(within(header).getByText('100.00')).toBeInTheDocument();
    const item = screen.getByTestId('wbs-card-w2');
    expect(within(item).getByLabelText('Weight %')).toHaveValue(40);
    await userEvent.clear(within(item).getByLabelText('Progress %'));
    await userEvent.type(within(item).getByLabelText('Progress %'), '75');
    await userEvent.tab();
    expect(within(screen.getByTestId('wbs-card-w2')).getByLabelText('Progress %')).toHaveValue(75);
    expect(screen.getByTestId('wbs-total')).toHaveTextContent('Weight 100.00%');
  });

  it('lists saved progress reports as cards', async () => {
    renderTab();
    const card = await screen.findByTestId('saved-snapshot-s1');
    expect(within(card).getByText('PB2')).toBeInTheDocument();
    expect(within(card).getByText('80%')).toBeInTheDocument();
    expect(within(card).getByText('Load')).toBeInTheDocument();
  });
});
