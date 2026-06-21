import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Tabs,
  Tab,
  Autocomplete,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { Project } from '../types/Project';
import type { Client } from '../types/Client';
import { resolveContact } from '../types/Client';
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

  // Fetch the unified client record for the selected project so all report tabs
  // can use the real client contact as the "Approved by" signatory.
  const [projectClient, setProjectClient] = useState<Client | null>(null);
  useEffect(() => {
    const cid = selectedProject?.client_id;
    if (!cid) { setProjectClient(null); return; }
    let cancelled = false;
    fetch(`/api/clients/${encodeURIComponent(cid)}`)
      .then(r => r.ok ? r.json() : null)
      .then((c: Client | null) => { if (!cancelled) setProjectClient(c ?? null); })
      .catch(() => { if (!cancelled) setProjectClient(null); });
    return () => { cancelled = true; };
  }, [selectedProject?.client_id]);

  // Resolve the project's designated client contact (approver for all reports)
  const clientApprover = useMemo(() => {
    if (!projectClient) return null;
    const contact = resolveContact(projectClient, selectedProject?.client_contact_id);
    if (!contact) return null;
    return {
      name: contact.name || '',
      designation: contact.position || '',
      company: projectClient.name || '',
    };
  }, [projectClient, selectedProject?.client_contact_id]);

  // All contacts from the project's client — used for the approver autocomplete in ProgressReport
  const clientContacts = useMemo(() =>
    (projectClient?.contacts ?? []).map(c => ({
      name: c.name || '',
      designation: c.position || '',
      company: projectClient?.name || '',
    })),
  [projectClient]);

  useEffect(() => {
    setPreparedBy((prev) => {
      const userName = (currentUser?.full_name?.trim() || currentUser?.username || currentUser?.email || '').trim();
      const userDesignation = (currentUser?.designation?.trim() || '').trim();
      const preparedName = (prev.name || '').trim();
      const matchesCurrentUser = !!userName && (
        preparedName === '' ||
        preparedName.toLowerCase() === userName.toLowerCase() ||
        preparedName.toLowerCase() === (currentUser?.username || '').toLowerCase() ||
        preparedName.toLowerCase() === (currentUser?.email || '').toLowerCase()
      );
      const name = matchesCurrentUser ? userName : prev.name;
      const designation = matchesCurrentUser && userDesignation ? userDesignation : prev.designation;
      if (name !== prev.name || designation !== prev.designation) return { ...prev, name, designation };
      return prev;
    });
  }, [currentUser?.full_name, currentUser?.username, currentUser?.email, currentUser?.designation]);

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
        const proj = list.find((p: Project) => String(p.id) === projectId);
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
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      height: 'calc(100vh - 80px)', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      margin: -2, // Counteract AppLayout padding
      backgroundColor: '#f5f5f5',
    }}>
      <Box sx={{ flexShrink: 0, p: 2, borderBottom: '1px solid #e0e0e0', bgcolor: '#fff' }}>
        <Box display="flex" alignItems="center" mb={2}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ flexGrow: 1, color: NET_PACIFIC_COLORS.primary }}>
            Reports
          </Typography>
        </Box>

        <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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
            sx={{ flex: 1, minWidth: 300, maxWidth: 600 }}
          />
          <RadioGroup
            row
            value={reportCompany}
            onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}
          >
            <FormControlLabel value="IOCT" control={<Radio size="small" />} label="IOCT" />
            <FormControlLabel value="ACT" control={<Radio size="small" />} label="ACTI" />
          </RadioGroup>
        </Paper>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flexShrink: 0, px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={handleTabChange}>
            <Tab label="Progress Report" value="progress" />
            <Tab label="Service Report" value="service" />
            <Tab label="Certificate of Completion" value="completion" />
            <Tab label="Attachments" value="attachments" />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {tab === 'service' ? (
            <ServiceReportTab
              project={selectedProject}
              currentUser={currentUser}
              reportCompany={reportCompany}
              setReportCompany={setReportCompany}
              preparedBy={preparedBy}
              setPreparedBy={setPreparedBy}
              onPreview={handlePreview}
              clientApprover={clientApprover ?? undefined}
            />
          ) : !selectedProject ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, height: '100%' }}>
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary">
                  Please select a project to generate reports
                </Typography>
              </Paper>
            </Box>
          ) : (
            <>
              {tab === 'progress' && (
                <ProgressReportTab
                  project={selectedProject}
                  currentUser={currentUser}
                  reportCompany={reportCompany}
                  setReportCompany={setReportCompany}
                  preparedBy={preparedBy}
                  setPreparedBy={setPreparedBy}
                  onPreview={handlePreview}
                  initialPb={searchParams.get('pb') ?? undefined}
                  clientApprover={clientApprover ?? undefined}
                  clientContacts={clientContacts}
                />
              )}
              {tab === 'completion' && (
                <CompletionCertificateTab
                  project={selectedProject}
                  currentUser={currentUser}
                  reportCompany={reportCompany}
                  setReportCompany={setReportCompany}
                  preparedBy={preparedBy}
                  onPreview={handlePreview}
                  clientApprover={clientApprover ?? undefined}
                />
              )}
              {tab === 'attachments' && (
                <AttachmentsTab project={selectedProject} currentUser={currentUser} />
              )}
            </>
          )}
        </Box>
      </Box>

      <PdfPreviewDialog open={pdfPreviewOpen} onClose={handleClosePreview} pdfBlob={pdfPreviewBlob} title={pdfPreviewTitle} />
    </Box>
  );
};

export default ReportsPage;
