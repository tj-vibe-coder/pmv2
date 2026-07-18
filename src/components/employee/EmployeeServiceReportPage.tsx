import React, { useState, useEffect } from 'react';
import { Autocomplete, Box, Paper, TextField, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { REPORT_COMPANY_KEY, REPORT_PREPARED_BY_KEY, type ReportCompanyKey } from '../ProjectDetails';
import ServiceReportTab from '../reports/ServiceReportTab';
import PdfPreviewDialog from '../PdfPreviewDialog';
import dataService from '../../services/dataService';
import type { Project } from '../../types/Project';

// Remember the last project the employee reported against, so the picker
// doesn't reset on every visit.
const EMPLOYEE_SR_PROJECT_KEY = 'employeeServiceReportProjectId';

function loadPreparedBy(): { name: string; designation: string; company: string; date: string } {
  try {
    const raw = localStorage.getItem(REPORT_PREPARED_BY_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>;
      return {
        name: typeof p.name === 'string' ? p.name : '',
        designation: typeof p.designation === 'string' ? p.designation : '',
        company: typeof p.company === 'string' ? p.company : '',
        date: typeof p.date === 'string' ? p.date : '',
      };
    }
  } catch {}
  return { name: '', designation: '', company: '', date: '' };
}

const EmployeeServiceReportPage: React.FC = () => {
  const { user } = useAuth();

  const [reportCompany, setReportCompany] = useState<ReportCompanyKey>(() => {
    try {
      const s = localStorage.getItem(REPORT_COMPANY_KEY);
      if (s === 'ACT' || s === 'IOCT') return s;
    } catch {}
    return 'IOCT';
  });

  const [preparedBy, setPreparedBy] = useState(loadPreparedBy);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);

  // Project picker — ServiceReportTab derives project no./name/client/PO from
  // this prop, and refuses to save a report without one.
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await dataService.getProjects();
        if (cancelled) return;
        setProjects(rows);
        // Restore the last-used project if it's still in the list.
        try {
          const savedId = localStorage.getItem(EMPLOYEE_SR_PROJECT_KEY);
          if (savedId) {
            const match = rows.find((p) => String(p.id) === savedId);
            if (match) setSelectedProject(match);
          }
        } catch {}
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      if (selectedProject) localStorage.setItem(EMPLOYEE_SR_PROJECT_KEY, String(selectedProject.id));
      else localStorage.removeItem(EMPLOYEE_SR_PROJECT_KEY);
    } catch {}
  }, [selectedProject]);

  // Persist report company
  useEffect(() => {
    try { localStorage.setItem(REPORT_COMPANY_KEY, reportCompany); } catch {}
  }, [reportCompany]);

  // Persist prepared by
  useEffect(() => {
    try { localStorage.setItem(REPORT_PREPARED_BY_KEY, JSON.stringify(preparedBy)); } catch {}
  }, [preparedBy]);

  // Auto-fill prepared by from logged-in user
  useEffect(() => {
    setPreparedBy(prev => {
      const userName = (user?.full_name?.trim() || user?.username || user?.email || '').trim();
      const userDesignation = (user?.designation?.trim() || '').trim();
      const prevName = (prev.name || '').trim();
      const matches = !prevName || prevName.toLowerCase() === userName.toLowerCase();
      const name = matches && userName ? userName : prev.name;
      const designation = matches && userDesignation ? userDesignation : prev.designation;
      if (name !== prev.name || designation !== prev.designation) return { ...prev, name, designation };
      return prev;
    });
  }, [user?.full_name, user?.username, user?.email, user?.designation]);

  const handlePreview = (blob: Blob, title: string) => {
    setPdfBlob(blob);
    setPdfTitle(title);
    setPdfOpen(true);
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Project</Typography>
        <Autocomplete
          size="small"
          options={projects}
          loading={projectsLoading}
          value={selectedProject}
          onChange={(_, v) => setSelectedProject(v)}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          getOptionLabel={(p) => {
            const no = (p.project_no || String(p.item_no ?? p.id ?? '')).trim();
            return no ? `${no} — ${p.project_name || ''}`.trim() : (p.project_name || '');
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Project"
              placeholder={projectsLoading ? 'Loading projects…' : 'Select the project this report is for'}
              helperText="Fills the project details on the report — required to save."
            />
          )}
          sx={{ maxWidth: 560 }}
        />
      </Paper>
      <ServiceReportTab
        project={selectedProject}
        currentUser={user}
        reportCompany={reportCompany}
        setReportCompany={setReportCompany}
        preparedBy={preparedBy}
        setPreparedBy={setPreparedBy}
        onPreview={handlePreview}
      />
      <PdfPreviewDialog
        open={pdfOpen}
        onClose={() => { setPdfOpen(false); setPdfBlob(null); }}
        pdfBlob={pdfBlob}
        title={pdfTitle}
      />
    </Box>
  );
};

export default EmployeeServiceReportPage;
