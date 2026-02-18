import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Tabs,
  Tab,
  Autocomplete,
  IconButton,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import dataService from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { REPORT_COMPANY_KEY, REPORT_PREPARED_BY_KEY, type ReportCompanyKey } from './ProjectDetails';
import PdfPreviewDialog from './PdfPreviewDialog';
import ProgressReportTab from './reports/ProgressReportTab';
import ServiceReportTab from './reports/ServiceReportTab';
import CompletionCertificateTab from './reports/CompletionCertificateTab';
import AttachmentsTab from './reports/AttachmentsTab';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

function loadPreparedBy(): { name: string; designation: string; company: string; date: string } {
  try {
    const raw = localStorage.getItem(REPORT_PREPARED_BY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; designation?: string; company?: string; date?: string };
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        designation: typeof parsed.designation === 'string' ? parsed.designation : '',
        company: typeof parsed.company === 'string' ? parsed.company : '',
        date: typeof parsed.date === 'string' ? parsed.date : '',
      };
    }
  } catch (_) {}
  return { name: '', designation: '', company: '', date: '' };
}

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { tab = 'progress' } = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const [reportCompany, setReportCompanyState] = useState<ReportCompanyKey>(() => {
    try {
      const s = localStorage.getItem(REPORT_COMPANY_KEY);
      if (s === 'ACT' || s === 'IOCT') return s;
    } catch (_) {}
    return 'IOCT';
  });
  const [preparedBy, setPreparedBy] = useState(loadPreparedBy);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  useEffect(() => {
    const defaultName = currentUser?.username || currentUser?.email || '';
    setPreparedBy((prev) => (prev.name === '' && defaultName ? { ...prev, name: defaultName } : prev));
  }, [currentUser?.username, currentUser?.email]);

  useEffect(() => {
    try {
      localStorage.setItem(REPORT_COMPANY_KEY, reportCompany);
    } catch (_) {}
  }, [reportCompany]);

  useEffect(() => {
    try {
      localStorage.setItem(REPORT_PREPARED_BY_KEY, JSON.stringify(preparedBy));
    } catch (_) {}
  }, [preparedBy]);

  useEffect(() => {
    dataService.getProjects().then((list) => {
      setProjects(list);
      const projectId = searchParams.get('projectId');
      if (projectId && list.length > 0) {
        const proj = list.find((p: Project) => p.id === Number(projectId));
        if (proj) setSelectedProject(proj);
      }
      setLoading(false);
    });
  }, [searchParams]);

  const setReportCompany = (v: ReportCompanyKey) => setReportCompanyState(v);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    navigate(`/reports/${newValue}${selectedProject ? `?projectId=${selectedProject.id}` : ''}`);
  };

  const handlePreview = (blob: Blob, title: string) => {
    setPdfPreviewBlob(blob);
    setPdfPreviewTitle(title);
    setPdfPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPdfPreviewOpen(false);
    setPdfPreviewBlob(null);
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Typography>Loading...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1, color: NET_PACIFIC_COLORS.primary }}>
          Reports
        </Typography>
      </Box>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Autocomplete
          options={projects}
          getOptionLabel={(option) => `${option.project_name} (${option.project_no || option.item_no || option.id})`}
          value={selectedProject}
          onChange={(_, newValue) => {
            setSelectedProject(newValue);
            if (newValue) {
              navigate(`/reports/${tab}?projectId=${newValue.id}`);
            }
          }}
          renderInput={(params) => <TextField {...params} label="Select Project" size="small" />}
          sx={{ maxWidth: 600 }}
        />
      </Paper>

      {selectedProject ? (
        <>
          <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Progress Report" value="progress" />
            <Tab label="Service Report" value="service" />
            <Tab label="Certificate of Completion" value="completion" />
            <Tab label="Attachments" value="attachments" />
          </Tabs>

          {tab === 'progress' && (
            <ProgressReportTab
              project={selectedProject}
              currentUser={currentUser}
              reportCompany={reportCompany}
              setReportCompany={setReportCompany}
              preparedBy={preparedBy}
              setPreparedBy={setPreparedBy}
              onPreview={handlePreview}
            />
          )}
          {tab === 'service' && (
            <ServiceReportTab
              project={selectedProject}
              currentUser={currentUser}
              reportCompany={reportCompany}
              setReportCompany={setReportCompany}
              preparedBy={preparedBy}
              setPreparedBy={setPreparedBy}
              onPreview={handlePreview}
            />
          )}
          {tab === 'completion' && (
            <CompletionCertificateTab
              project={selectedProject}
              currentUser={currentUser}
              reportCompany={reportCompany}
              setReportCompany={setReportCompany}
              preparedBy={preparedBy}
              setPreparedBy={setPreparedBy}
              onPreview={handlePreview}
            />
          )}
          {tab === 'attachments' && (
            <AttachmentsTab project={selectedProject} currentUser={currentUser} />
          )}
        </>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Please select a project to generate reports
          </Typography>
        </Paper>
      )}

      <PdfPreviewDialog open={pdfPreviewOpen} onClose={handleClosePreview} pdfBlob={pdfPreviewBlob} title={pdfPreviewTitle} />
    </Container>
  );
};

export default ReportsPage;
