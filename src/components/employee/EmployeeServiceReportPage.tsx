import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { REPORT_COMPANY_KEY, REPORT_PREPARED_BY_KEY, type ReportCompanyKey } from '../ProjectDetails';
import ServiceReportTab from '../reports/ServiceReportTab';
import PdfPreviewDialog from '../PdfPreviewDialog';

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
      <ServiceReportTab
        project={null}
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
