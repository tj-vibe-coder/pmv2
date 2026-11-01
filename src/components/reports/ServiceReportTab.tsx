import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  PictureAsPdf as PictureAsPdfIcon,
  GridOn as GridOnIcon,
  Visibility as VisibilityIcon,
  CameraAlt as CameraAltIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { Project } from '../../types/Project';
import {
  REPORT_COMPANIES,
  type ReportCompanyKey,
  ServiceReport,
  ServiceReportPhoto,
  getServiceReports,
  saveServiceReport,
  updateServiceReport,
  deleteServiceReport,
  migrateServiceReportsFromLocalStorage,
} from '../ProjectDetails';
import { arialNarrowBase64 } from '../../fonts/arialNarrowBase64';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import {
  resolveCorporateDriveId,
  uploadFileToFolderById,
  ensureExecutionFolder,
  getOrCreateChildFolderById,
  fetchDriveItemBlob,
} from '../../services/onedriveFolderService';
import dataService from '../../services/dataService';
import { buildServiceReportXlsxBlob } from '../../utils/reports/serviceReportXlsx';
import { buildServiceReportPdf, type ServiceReportPhoto as PdfPhoto } from '../../utils/reports/serviceReportPdf';
import { REPORT_ISSUERS } from '../../utils/reports/reportPdfKit';
import { loadReportLogo } from '../../utils/reports/reportLogo';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0', secondary: '#1e4a72' };

/** Accordion sections styled as the design guide's content papers (DESIGN_PHILOSOPHY §8). */
const sectionSx = {
  mb: 1.5,
  borderRadius: '8px !important',
  overflow: 'hidden',
  border: '1px solid #e2e8f0',
  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
  '&:before': { display: 'none' },
} as const;
const summarySx = { minHeight: 52, px: 1.5, '&.Mui-expanded': { borderBottom: '1px solid #e0e0e0' }, '& .MuiAccordionSummary-content': { alignItems: 'center', my: 1 } } as const;
const sectionTitleSx = { fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 } as const;
const headSx = { fontWeight: 600, fontSize: '0.875rem', bgcolor: '#f8fafc', color: 'text.primary', whiteSpace: 'nowrap' } as const;

interface PhotoItem {
  localId: string;
  file?: File;
  previewUrl?: string;        // object URL for local preview (newly added only)
  activityIndex?: number;     // undefined = general photo
  // populated after successful OneDrive upload
  oneDriveId?: string;
  filename?: string;
  webUrl?: string;
  uploadedAt?: string;
  thumbnailDataUrl?: string;  // ~120px JPEG stored at upload time; survives page reload
  uploadStatus: 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

/**
 * Generate a small thumbnail (~120px longest edge, JPEG 0.65) from a photo blob.
 * Also corrects EXIF orientation. Stored in localStorage so thumbnails display
 * without a live OneDrive connection when a saved report is loaded.
 */
async function generateThumbnail(source: Blob): Promise<string> {
  const MAX = 120;
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.65);
  } catch {
    return '';
  }
}

/**
 * Bake EXIF orientation into a canvas so jsPDF sees an already-rotated image.
 * `createImageBitmap({ imageOrientation: 'from-image' })` handles all 8 EXIF
 * orientations (including the common phone-portrait case) without a library.
 * Falls back to a plain FileReader data URL if the API is unavailable.
 */
/**
 * Convert a HEIC/HEIF file to JPEG. Returns the original file unchanged for
 * any other format. The returned File has a .jpg extension so browsers can
 * render it with createObjectURL / createImageBitmap.
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif') ||
    file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch {
    return file; // fall back to original if conversion fails
  }
}

async function normalizeImageOrientation(source: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' } as unknown as ImageBitmapOptions);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(source);
    });
  }
}

export interface ServiceReportTabProps {
  project?: Project | null;
  currentUser: { full_name?: string | null; username?: string; email?: string } | null;
  reportCompany: ReportCompanyKey;
  setReportCompany: (v: ReportCompanyKey) => void;
  preparedBy: { name: string; designation: string; company: string; date: string };
  setPreparedBy: React.Dispatch<React.SetStateAction<{ name: string; designation: string; company: string; date: string }>>;
  onPreview: (blob: Blob, title: string) => void;
  /** Resolved client contact to use as the "Approved by" signatory */
  clientApprover?: { name: string; designation: string; company: string };
}

const ServiceReportTab: React.FC<ServiceReportTabProps> = ({
  project,
  currentUser,
  reportCompany,
  setReportCompany,
  preparedBy,
  setPreparedBy,
  onPreview,
  clientApprover,
}) => {
  const [serviceReportDate, setServiceReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Site-work date range (may span multiple days) — separate from serviceReportDate,
  // which is when the report itself was authored. Defaults to today for both ends.
  const [serviceReportDateCoveredStart, setServiceReportDateCoveredStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceReportDateCoveredEnd, setServiceReportDateCoveredEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceReportStartTime, setServiceReportStartTime] = useState('');
  const [serviceReportEndTime, setServiceReportEndTime] = useState('');
  const [serviceReportNo, setServiceReportNo] = useState('');
  const [serviceReportTitle, setServiceReportTitle] = useState('');
  const [serviceReportActivitiesTable, setServiceReportActivitiesTable] = useState<{ activity: string; findingOutcome: string }[]>([{ activity: '', findingOutcome: '' }]);
  const [serviceReportCustomerComments, setServiceReportCustomerComments] = useState('');
  const [editingServiceReportId, setEditingServiceReportId] = useState<string | null>(null);
  const [serviceReports, setServiceReports] = useState<ServiceReport[]>([]);
  const [srLoading, setSrLoading] = useState(false);
  const [serviceReportSaveFeedback, setServiceReportSaveFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Accordion expanded state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    setup: true,
    activities: true,
    signatories: false,
    photos: false,
    savedReports: false,
  });
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Editable approver — seeded from clientApprover prop, overridable by the user
  const [approverName, setApproverName] = useState(clientApprover?.name || '');
  const [approverDesignation, setApproverDesignation] = useState(clientApprover?.designation || '');
  const [approverCompany, setApproverCompany] = useState(clientApprover?.company || '');

  // Sync when the resolved client contact arrives asynchronously
  useEffect(() => {
    if (clientApprover?.name || clientApprover?.designation) {
      setApproverName(prev => prev || clientApprover.name || '');
      setApproverDesignation(prev => prev || clientApprover.designation || '');
      setApproverCompany(prev => prev || clientApprover.company || '');
    }
  }, [clientApprover?.name, clientApprover?.designation, clientApprover?.company]);

  // Editable "Prepared by" — defaults to the shared preparedBy / logged-in user,
  // but overridable per report (e.g. a third-party engineer who went onsite).
  // Company defaults to the report company (blank → REPORT_COMPANIES[reportCompany]).
  const preparedByDefaultName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim();
  const [preparedByName, setPreparedByName] = useState(preparedByDefaultName);
  const [preparedByDesignation, setPreparedByDesignation] = useState((preparedBy.designation || '').trim());
  const [preparedByCompany, setPreparedByCompany] = useState('');

  // Pull in the shared preparedBy when it resolves (e.g. account loads after mount),
  // without clobbering a manual override.
  useEffect(() => {
    setPreparedByName(prev => prev || preparedByDefaultName);
    setPreparedByDesignation(prev => prev || (preparedBy.designation || '').trim());
  }, [preparedByDefaultName, preparedBy.designation]);
  const [exporting, setExporting] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const {
    isConfigured: oneDriveConfigured,
    isAuthenticated: oneDriveSignedIn,
    isLoading: oneDriveAuthLoading,
    login: oneDriveLogin,
    getAccessToken: getOneDriveToken,
  } = useOneDriveAuth();

  // Convenience accessors — safe when project is null (pre-PO service reports)
  const projectId = project?.id ?? null;
  const projectNo = (project?.project_no || String(project?.item_no ?? project?.id ?? '')).trim() || '';
  const projectName = project?.project_name || '';
  const projectClient = project?.account_name || '';
  const projectPo = project?.po_number || '';

  // Local copy of execution folder id — updated if we auto-create the folder on first export
  const [localExecutionFolderId, setLocalExecutionFolderId] = useState(project?.executionFolderId);
  useEffect(() => { setLocalExecutionFolderId(project?.executionFolderId); }, [project?.id, project?.executionFolderId]);

  // Photo attachment state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosFolderId, setPhotosFolderId] = useState<string | null>(null);
  const [photosFolderUrl, setPhotosFolderUrl] = useState<string | null>(null);
  // Resolved ops-level execution folder — resolved once via ensureExecutionFolder(project_no)
  // so photos always land under the IOCT project folder, not inside a PCS proposal subfolder.
  const [resolvedExecFolderId, setResolvedExecFolderId] = useState<string | null>(null);
  const [photoPlacement, setPhotoPlacement] = useState<'inline' | 'end'>('inline');
  const pendingActivityIndexRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount to avoid memory leaks
  const photosRef = useRef<PhotoItem[]>([]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    photosRef.current.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
  }, []);

  const resetServiceReportForm = useCallback(() => {
    setServiceReportDate(new Date().toISOString().slice(0, 10));
    setServiceReportDateCoveredStart(new Date().toISOString().slice(0, 10));
    setServiceReportDateCoveredEnd(new Date().toISOString().slice(0, 10));
    setServiceReportStartTime('');
    setServiceReportEndTime('');
    setServiceReportNo('');
    setServiceReportTitle('');
    setServiceReportActivitiesTable([{ activity: '', findingOutcome: '' }]);
    setServiceReportCustomerComments('');
    setEditingServiceReportId(null);
    setExportFeedback(null);
    setApproverName(clientApprover?.name || '');
    setApproverDesignation(clientApprover?.designation || '');
    setApproverCompany(clientApprover?.company || '');
    setPreparedByName(preparedByDefaultName);
    setPreparedByDesignation((preparedBy.designation || '').trim());
    setPreparedByCompany('');
    setPhotos(prev => {
      prev.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      return [];
    });
  }, [clientApprover?.name, clientApprover?.designation, clientApprover?.company, preparedByDefaultName, preparedBy.designation]);

  const loadServiceReports = useCallback(async () => {
    if (projectId == null) { setServiceReports([]); return; }
    setSrLoading(true);
    try {
      const reports = await getServiceReports(projectId);
      setServiceReports(reports);
    } catch {
      // Keep stale list on transient error — don't wipe what the user can see.
    } finally {
      setSrLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    resetServiceReportForm();
    setPhotosFolderId(null);
    setPhotosFolderUrl(null);
    setResolvedExecFolderId(null);
    loadServiceReports();
    migrateServiceReportsFromLocalStorage().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const triggerPhotoInput = (activityIndex: number | null) => {
    pendingActivityIndexRef.current = activityIndex;
    photoInputRef.current?.click();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (rawFiles.length === 0) return;
    const activityIdx = pendingActivityIndexRef.current;
    pendingActivityIndexRef.current = null;

    // Convert HEIC/HEIF to JPEG before preview or upload
    const files = await Promise.all(rawFiles.map(convertHeicToJpeg));

    // Add to state immediately with local previews
    const newItems: PhotoItem[] = files.map(file => ({
      localId: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      activityIndex: activityIdx ?? undefined,
      uploadStatus: 'uploading' as const,
    }));
    setPhotos(prev => [...prev, ...newItems]);

    if (!oneDriveSignedIn) {
      setPhotos(prev => prev.map(p =>
        newItems.some(n => n.localId === p.localId)
          ? { ...p, uploadStatus: 'error', errorMessage: 'Sign in to OneDrive to upload photos.' }
          : p
      ));
      return;
    }

    // Upload each file sequentially (shares the same token + folder setup)
    try {
      const token = await getOneDriveToken();
      if (!token) throw new Error('Could not get OneDrive token.');
      const driveId = await resolveCorporateDriveId(token);

      // Always resolve the execution folder by project_no so photos land under the
      // IOCT ops folder (e.g. IOCT2606001-LBI …), not inside a PCS proposal subfolder
      // that the stored executionFolderId may point to.
      let execFolderId = resolvedExecFolderId;
      if (!execFolderId) {
        const projectCode = projectNo || (projectId != null ? String(projectId) : 'no-project');
        const execFolder = await ensureExecutionFolder(token, { code: projectCode, name: projectName });
        execFolderId = execFolder.id;
        setResolvedExecFolderId(execFolderId);
        // Also persist if nothing was stored yet
        if (!localExecutionFolderId && projectId != null) {
          setLocalExecutionFolderId(execFolderId);
          dataService.updateProject(projectId, { executionFolderId: execFolder.id, executionFolderUrl: execFolder.webUrl }).catch(() => {});
        }
      }

      // Ensure Photos subfolder
      let folderId = photosFolderId;
      if (!folderId) {
        const photosFolder = await getOrCreateChildFolderById(token, driveId, execFolderId, 'Photos');
        folderId = photosFolder.id;
        setPhotosFolderId(folderId);
        if (photosFolder.webUrl) setPhotosFolderUrl(photosFolder.webUrl);
      }

      const reportPrefix = (serviceReportNo || `${projectNo || (projectId != null ? String(projectId) : 'report')}-SR`)
        .replace(/[<>:"/\\|?*\s]/g, '_');

      for (const item of newItems) {
        try {
          const ext = (item.file!.name.split('.').pop() || 'jpg').toLowerCase();
          const filename = `${reportPrefix}_${Date.now()}.${ext}`;
          const [uploaded, thumbnailDataUrl] = await Promise.all([
            uploadFileToFolderById(token, driveId, folderId, filename, item.file!),
            generateThumbnail(item.file!),
          ]);
          setPhotos(prev => prev.map(p => p.localId === item.localId ? {
            ...p,
            oneDriveId: uploaded.id,
            filename: uploaded.name,
            webUrl: uploaded.webUrl,
            uploadedAt: new Date().toISOString(),
            thumbnailDataUrl: thumbnailDataUrl || undefined,
            uploadStatus: 'done' as const,
          } : p));
        } catch (err) {
          setPhotos(prev => prev.map(p => p.localId === item.localId ? {
            ...p,
            uploadStatus: 'error' as const,
            errorMessage: err instanceof Error ? err.message : 'Upload failed',
          } : p));
        }
      }
    } catch (err) {
      // Token/folder setup failed — mark all new items as error
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setPhotos(prev => prev.map(p =>
        newItems.some(n => n.localId === p.localId) && p.uploadStatus === 'uploading'
          ? { ...p, uploadStatus: 'error' as const, errorMessage: msg }
          : p
      ));
    }
  };

  const handleRemovePhoto = (localId: string) => {
    setPhotos(prev => {
      const removed = prev.find(p => p.localId === localId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(p => p.localId !== localId);
    });
  };

  const handleSaveServiceReport = async () => {
    if (!projectId) {
      setExportFeedback({ severity: 'warning', message: 'Select a project to save the report.' });
      return;
    }
    const reportProjectNo = projectNo || '—';
    const editingReport = editingServiceReportId ? serviceReports.find(r => r.id === editingServiceReportId) : null;
    const reportNo = editingReport?.reportNo || `${reportProjectNo} - SR${serviceReports.length + 1}`;
    const table = serviceReportActivitiesTable.filter((r) => (r.activity || '').trim() || (r.findingOutcome || '').trim());
    const recs = (serviceReportCustomerComments || '').trim() ? [serviceReportCustomerComments.trim()] : [];
    const savedPhotos: ServiceReportPhoto[] = photos
      .filter(p => p.uploadStatus === 'done' && p.oneDriveId)
      .map(p => ({
        id: p.oneDriveId!,
        filename: p.filename!,
        webUrl: p.webUrl!,
        uploadedAt: p.uploadedAt!,
        activityIndex: p.activityIndex,
        thumbnailDataUrl: p.thumbnailDataUrl,
      }));
    const report = {
      date: serviceReportDate,
      dateCoveredStart: serviceReportDateCoveredStart || serviceReportDate,
      dateCoveredEnd: serviceReportDateCoveredEnd || serviceReportDate,
      reportNo,
      title: serviceReportTitle.trim() || 'Service Report',
      startTime: serviceReportStartTime.trim() || undefined,
      endTime: serviceReportEndTime.trim() || undefined,
      activitiesTable: table.length > 0 ? table : [{ activity: '', findingOutcome: '' }],
      recommendationsTable: recs,
      photos: savedPhotos.length > 0 ? savedPhotos : undefined,
      approverName: approverName.trim() || undefined,
      approverDesignation: approverDesignation.trim() || undefined,
      approverCompany: approverCompany.trim() || undefined,
      preparedByName: preparedByName.trim() || undefined,
      preparedByDesignation: preparedByDesignation.trim() || undefined,
      preparedByCompany: preparedByCompany.trim() || undefined,
    };
    try {
      if (editingReport) {
        await updateServiceReport(editingReport.id, report);
      } else {
        await saveServiceReport(projectId, report);
      }
      setServiceReportNo(reportNo);
      setServiceReportSaveFeedback(true);
      setTimeout(() => setServiceReportSaveFeedback(false), 2000);
      await loadServiceReports();
    } catch (err) {
      setExportFeedback({ severity: 'error', message: err instanceof Error ? err.message : 'Failed to save report.' });
    }
  };

  const handleLoadServiceReport = (report: ServiceReport) => {
    setServiceReportDate(report.date);
    // Legacy reports have no coverage range saved — fall back to the report's own date.
    setServiceReportDateCoveredStart(report.dateCoveredStart || report.date);
    setServiceReportDateCoveredEnd(report.dateCoveredEnd || report.date);
    setServiceReportStartTime(report.startTime || '');
    setServiceReportEndTime(report.endTime || '');
    setServiceReportNo(report.reportNo);
    setServiceReportTitle(report.title);
    if (report.activitiesTable && report.activitiesTable.length > 0) {
      setServiceReportActivitiesTable(report.activitiesTable);
    } else {
      setServiceReportActivitiesTable([
        { activity: (report as { activities?: string }).activities || '', findingOutcome: (report as { findings?: string }).findings || '' },
      ]);
    }
    if (report.recommendationsTable && report.recommendationsTable.length > 0) {
      setServiceReportCustomerComments(report.recommendationsTable.join('\n'));
    } else {
      const leg = (report as { recommendations?: string }).recommendations || '';
      setServiceReportCustomerComments(leg.trim());
    }
    // Restore saved approver (fall back to current clientApprover if not stored)
    setApproverName(report.approverName ?? clientApprover?.name ?? '');
    setApproverDesignation(report.approverDesignation ?? clientApprover?.designation ?? '');
    setApproverCompany(report.approverCompany ?? clientApprover?.company ?? '');
    // Restore saved prepared-by (fall back to the shared preparedBy / current user)
    setPreparedByName(report.preparedByName ?? preparedByDefaultName);
    setPreparedByDesignation(report.preparedByDesignation ?? (preparedBy.designation || '').trim());
    setPreparedByCompany(report.preparedByCompany ?? '');
    setEditingServiceReportId(report.id);
    setExportFeedback(null);
    // Restore saved photos as done items (no local file/preview available)
    const loadedPhotos: PhotoItem[] = (report.photos || []).map(photo => ({
      localId: `photo-loaded-${photo.id}`,
      activityIndex: photo.activityIndex,
      oneDriveId: photo.id,
      filename: photo.filename,
      webUrl: photo.webUrl,
      uploadedAt: photo.uploadedAt,
      thumbnailDataUrl: photo.thumbnailDataUrl,
      uploadStatus: 'done' as const,
    }));
    setPhotos(loadedPhotos);
    // Expand the setup and activities sections when loading a report
    setExpandedSections(prev => ({ ...prev, setup: true, activities: true }));
  };

  const handleDeleteServiceReport = async (report: ServiceReport) => {
    if (!window.confirm(`Delete saved service report "${report.reportNo}"? This cannot be undone.`)) return;
    try {
      await deleteServiceReport(report.id);
      if (editingServiceReportId === report.id) resetServiceReportForm();
      await loadServiceReports();
    } catch (err) {
      setExportFeedback({ severity: 'error', message: 'Failed to delete report.' });
    }
  };

  const buildPdf = async (preview: boolean): Promise<{ blob: Blob; filename: string; missingPhotos: number } | void> => {
    const pdfProjectNo = projectNo || '—';
    const reportNo = (serviceReportNo || '').trim() || `${pdfProjectNo} - SR${serviceReports.length + 1}`;
    const preparedByNamePdf = (preparedByName.trim() || preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim();

    // ------------------------------------------------------------------
    // Pre-fetch photo data URLs. A photo is embeddable when its original
    // file is still in memory (even if the OneDrive upload failed) or when
    // it was uploaded and can be re-fetched from OneDrive. The PDF must not
    // silently drop attached photos just because the upload didn't succeed.
    // ------------------------------------------------------------------
    const exportablePhotos = photos.filter(p => p.file || (p.uploadStatus === 'done' && p.oneDriveId));
    const photoDataUrls = new Map<string, string>();
    if (exportablePhotos.length > 0) {
      let pdToken: string | null = null;
      let pdDriveId: string | null = null;
      if (oneDriveSignedIn) {
        try {
          pdToken = await getOneDriveToken();
          if (pdToken) pdDriveId = await resolveCorporateDriveId(pdToken);
        } catch (_) {}
      }
      await Promise.allSettled(exportablePhotos.map(async (photo) => {
        try {
          let blob: Blob | undefined;
          if (photo.file) {
            blob = photo.file;
          } else if (pdToken && pdDriveId && photo.oneDriveId) {
            blob = await fetchDriveItemBlob(pdToken, pdDriveId, photo.oneDriveId);
            // Photos uploaded before HEIC→JPEG conversion existed are stored
            // as .heic on OneDrive — browsers can't decode them directly.
            const lowerName = (photo.filename || '').toLowerCase();
            if (blob && (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') ||
                blob.type === 'image/heic' || blob.type === 'image/heif')) {
              blob = await convertHeicToJpeg(new File([blob], photo.filename || 'photo.heic', { type: blob.type }));
            }
          }
          if (blob) {
            // Bake EXIF orientation into the canvas before handing to jsPDF
            const dataUrl = await normalizeImageOrientation(blob);
            photoDataUrls.set(photo.localId, dataUrl);
          }
        } catch (_) {}
      }));
    }
    // Photos that couldn't be resolved to image data (e.g. saved-report photos
    // with no OneDrive token, or undecodable formats) — surfaced to the user.
    const missingPhotos = exportablePhotos.length - photoDataUrls.size;

    // Pixel size of each embeddable photo so the PDF can fit it without distortion.
    const pdfPhotos: PdfPhoto[] = [];
    for (const photo of exportablePhotos) {
      const dataUrl = photoDataUrls.get(photo.localId);
      if (!dataUrl) continue;
      const size = await new Promise<{ width: number; height: number }>((res) => {
        const img = new Image();
        img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => res({ width: 0, height: 0 });
        img.src = dataUrl;
      });
      const rawName = photo.filename || photo.file?.name || '';
      const caption = rawName.replace(/^[^_]*_[^_]*_\d+\./, '').slice(0, 40) || rawName;
      pdfPhotos.push({ dataUrl, ...size, caption, activityIndex: photo.activityIndex });
    }

    const { doc, filename } = buildServiceReportPdf({
      reportCompany,
      reportNo,
      title: serviceReportTitle,
      projectName: projectName || '—',
      projectNo: pdfProjectNo,
      client: projectClient || '—',
      location: project?.project_location || undefined,
      poNumber: projectPo || '—',
      reportDate: serviceReportDate,
      coveredFrom: serviceReportDateCoveredStart,
      coveredTo: serviceReportDateCoveredEnd,
      startTime: serviceReportStartTime,
      endTime: serviceReportEndTime,
      activities: serviceReportActivitiesTable.map((r) => ({ activity: r.activity || '', finding: r.findingOutcome || '' })),
      recommendations: serviceReportCustomerComments || '',
      preparedBy: {
        name: preparedByNamePdf,
        designation: preparedByDesignation.trim() || (preparedBy.designation || '').trim() || undefined,
        company: preparedByCompany.trim() || undefined,
      },
      approvedBy: {
        name: approverName.trim() || undefined,
        designation: approverDesignation.trim() || undefined,
        company: approverCompany.trim() || undefined,
      },
      photos: pdfPhotos,
      photoPlacement,
    }, { logoDataUrl: await loadReportLogo(REPORT_ISSUERS[reportCompany]), bodyFontBase64: arialNarrowBase64 });

    const blob = doc.output('blob') as Blob;
    if (!preview) doc.save(filename);
    return { blob, filename, missingPhotos };
  };

  const missingPhotosNote = (count: number): string =>
    count > 0
      ? ` ${count} attached photo(s) could not be included in the PDF — sign in to OneDrive so saved photos can be fetched.`
      : '';

  const handlePreview = async () => {
    const result = await buildPdf(true);
    if (result) {
      if (result.missingPhotos > 0) {
        setExportFeedback({ severity: 'warning', message: missingPhotosNote(result.missingPhotos).trim() });
      }
      onPreview(result.blob, 'Service Report');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportFeedback(null);
    try {
      const result = await buildPdf(false);
      if (!result) return;
      const photoNote = missingPhotosNote(result.missingPhotos);
      if (!isCorporateOneDriveConfigured()) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. OneDrive is not configured.' + photoNote });
        return;
      }
      if (!oneDriveSignedIn) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. Sign in to OneDrive to upload it.' + photoNote });
        return;
      }
      const token = await getOneDriveToken();
      if (!token) {
        setExportFeedback({ severity: 'warning', message: 'PDF exported locally. Could not get OneDrive access token.' + photoNote });
        return;
      }
      const driveId = await resolveCorporateDriveId(token);
      // Always resolve by project_no so the PDF lands in the IOCT ops folder,
      // not inside a PCS proposal subfolder pointed to by a stale executionFolderId.
      let folderId = resolvedExecFolderId;
      if (!folderId) {
        const projectCode = projectNo || (projectId != null ? String(projectId) : 'no-project');
        const folder = await ensureExecutionFolder(token, { code: projectCode, name: projectName });
        folderId = folder.id;
        setResolvedExecFolderId(folderId);
        if (!localExecutionFolderId && projectId != null) {
          setLocalExecutionFolderId(folderId);
          dataService.updateProject(projectId, { executionFolderId: folder.id, executionFolderUrl: folder.webUrl }).catch(() => {});
        }
      }
      await uploadFileToFolderById(token, driveId, folderId, result.filename, result.blob);
      setExportFeedback({
        severity: photoNote ? 'warning' : 'success',
        message: `PDF exported and uploaded to OneDrive: ${result.filename}.` + photoNote,
      });
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'PDF exported locally, but OneDrive upload failed.' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    setExportFeedback(null);
    try {
      const companyName = REPORT_COMPANIES[reportCompany];
      const xlsxProjectNo = projectNo || '—';
      const reportNo = (serviceReportNo || '').trim() || `${xlsxProjectNo} - SR${serviceReports.length + 1}`;
      const reportDateStr = serviceReportDate
        ? new Date(serviceReportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const filename = `${reportNo.replace(/\s*-\s*/g, '-').replace(/\s+/g, '')}.xlsx`;

      // Embed the same per-company logo the PDF uses (ACT = full mark with dark
      // bg removed; IOCT = icon-only). Best-effort: a load failure just omits it.
      const logo = await (async () => {
        try {
          const isAct = reportCompany === 'ACT';
          const logoUrl = `${process.env.PUBLIC_URL || ''}/${isAct ? 'logo-acti.png' : 'logo-ioct-only.png'}`;
          const { loadLogoTransparentBackground, loadImageDataUrl } = await import('../../utils/logoUtils');
          const dataUrl = isAct ? await loadLogoTransparentBackground(logoUrl) : await loadImageDataUrl(logoUrl);
          const { naturalWidth, naturalHeight } = await new Promise<{ naturalWidth: number; naturalHeight: number }>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
            img.onerror = () => reject(new Error('logo dims'));
            img.src = dataUrl;
          });
          // Match the PDF logo proportions (mm → px at ~3.78px/mm): ACT 22×13.6mm,
          // IOCT 16×16mm icon. Derive height from the natural aspect ratio.
          const targetWidth = isAct ? 83 : 60; // px
          const width = targetWidth;
          const height = Math.round((naturalHeight / naturalWidth) * width);
          return { dataUrl, extension: 'png' as const, width: Math.round(width), height };
        } catch {
          return undefined;
        }
      })();

      const data = {
        companyName,
        logo,
        projectName: projectName || '—',
        projectNo: xlsxProjectNo,
        reportNo,
        reportDateStr,
        poNumber: projectPo || '—',
        client: projectClient || '—',
        startTime: serviceReportStartTime || '—',
        endTime: serviceReportEndTime || '—',
        activities: serviceReportActivitiesTable,
        recommendations: serviceReportCustomerComments || '',
        preparedBy: {
          name: (preparedByName.trim() || preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim(),
          designation: preparedByDesignation.trim() || (preparedBy.designation || '').trim(),
          company: preparedByCompany.trim() || companyName,
        },
        approvedBy: {
          name: approverName.trim(),
          designation: approverDesignation.trim(),
          company: approverCompany.trim(),
        },
      };

      const blob = await buildServiceReportXlsxBlob(data);
      // Trigger local download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Best-effort OneDrive upload, mirroring the PDF export flow
      if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn) {
        setExportFeedback({ severity: 'success', message: `Excel exported: ${filename}.` });
        return;
      }
      const token = await getOneDriveToken();
      if (!token) {
        setExportFeedback({ severity: 'warning', message: `Excel exported locally. Could not get OneDrive access token.` });
        return;
      }
      const driveId = await resolveCorporateDriveId(token);
      let folderId = resolvedExecFolderId;
      if (!folderId) {
        const projectCode = projectNo || (projectId != null ? String(projectId) : 'no-project');
        const folder = await ensureExecutionFolder(token, { code: projectCode, name: projectName });
        folderId = folder.id;
        setResolvedExecFolderId(folderId);
        if (!localExecutionFolderId && projectId != null) {
          setLocalExecutionFolderId(folderId);
          dataService.updateProject(projectId, { executionFolderId: folder.id, executionFolderUrl: folder.webUrl }).catch(() => {});
        }
      }
      await uploadFileToFolderById(token, driveId, folderId, filename, blob);
      setExportFeedback({ severity: 'success', message: `Excel exported and uploaded to OneDrive: ${filename}.` });
    } catch (e) {
      setExportFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to export Excel.' });
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Scrollable accordion area */}
      <Box sx={{ flex: 1, overflow: 'auto', pb: 10 }}>

        {/* Page-level feedback */}
        {exportFeedback && (
          <Alert severity={exportFeedback.severity} onClose={() => setExportFeedback(null)} sx={{ mb: 1 }}>
            {exportFeedback.message}
          </Alert>
        )}

        {/* Accordion 1: Report Setup */}
        <Accordion
          expanded={expandedSections.setup}
          onChange={() => toggleSection('setup')}
          disableGutters
          elevation={0}
          sx={sectionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
            <Typography variant="h6" sx={sectionTitleSx}>
              Report Setup
            </Typography>
            {serviceReportDate && serviceReportTitle && (
              <Chip label="Ready" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
            )}
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField size="small" fullWidth label="Report Date" type="date" value={serviceReportDate} onChange={(e) => setServiceReportDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Report No.</Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {serviceReportNo || (projectNo ? `${projectNo} - SR${serviceReports.length + 1}` : `SR${serviceReports.length + 1}`)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField size="small" fullWidth label="Date Covered (From)" type="date" value={serviceReportDateCoveredStart} onChange={(e) => {
                  const v = e.target.value;
                  setServiceReportDateCoveredStart(v);
                  // Keep the range sane if "From" is pushed past the current "To".
                  if (serviceReportDateCoveredEnd && v > serviceReportDateCoveredEnd) setServiceReportDateCoveredEnd(v);
                }} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField size="small" fullWidth label="Date Covered (To)" type="date" value={serviceReportDateCoveredEnd} onChange={(e) => setServiceReportDateCoveredEnd(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ min: serviceReportDateCoveredStart }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField size="small" fullWidth label="Start Time" type="time" value={serviceReportStartTime} onChange={(e) => setServiceReportStartTime(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField size="small" fullWidth label="End Time" type="time" value={serviceReportEndTime} onChange={(e) => setServiceReportEndTime(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField size="small" fullWidth label="Subject" placeholder="e.g. Monthly Service Visit" value={serviceReportTitle} onChange={(e) => setServiceReportTitle(e.target.value)} />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Accordion 2: Activities */}
        <Accordion
          expanded={expandedSections.activities}
          onChange={() => toggleSection('activities')}
          disableGutters
          elevation={0}
          sx={sectionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
            <Typography variant="h6" sx={sectionTitleSx}>
              Activities
            </Typography>
            <Chip
              label={`${serviceReportActivitiesTable.filter(r => r.activity.trim() || r.findingOutcome.trim()).length || serviceReportActivitiesTable.length} rows`}
              size="small"
              variant="outlined"
              sx={{ mr: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Box sx={{ px: 2, pt: 1.5 }}>
              <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}>
                <Table size="small" sx={{ minWidth: 560, '& td, & th': { border: '1px solid #e2e8f0' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...headSx, width: 48 }}>No.</TableCell>
                      <TableCell sx={headSx}>Activity</TableCell>
                      <TableCell sx={headSx}>Finding / Outcome</TableCell>
                      <TableCell sx={{ ...headSx, width: 80 }}>Photos</TableCell>
                      <TableCell sx={{ ...headSx, width: 48 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serviceReportActivitiesTable.map((row, index) => {
                      const rowPhotos = photos.filter(p => p.activityIndex === index);
                      return (
                        <TableRow key={index}>
                          <TableCell sx={{ verticalAlign: 'top', pt: 1.5 }}>{index + 1}</TableCell>
                          <TableCell sx={{ py: 0.5, px: 1 }}>
                            <TextField size="small" fullWidth multiline minRows={1} placeholder="Activity" value={row.activity} onChange={(e) => setServiceReportActivitiesTable((prev) => prev.map((r, i) => (i === index ? { ...r, activity: e.target.value } : r)))} />
                          </TableCell>
                          <TableCell sx={{ py: 0.5, px: 1 }}>
                            <TextField size="small" fullWidth multiline minRows={1} placeholder="Finding / Outcome" value={row.findingOutcome} onChange={(e) => setServiceReportActivitiesTable((prev) => prev.map((r, i) => (i === index ? { ...r, findingOutcome: e.target.value } : r)))} />
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'top', pt: 0.5, px: 0.5 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                              {rowPhotos.map(p => (
                                <Tooltip key={p.localId} title={p.uploadStatus === 'error' ? (p.errorMessage || 'Upload failed') : (p.filename || p.file?.name || '')}>
                                  <Box sx={{ position: 'relative', width: 36, height: 36, borderRadius: 0.5, overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {(p.previewUrl || p.thumbnailDataUrl) ? (
                                      <img src={p.previewUrl ?? p.thumbnailDataUrl} alt={p.filename || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : null}
                                    {p.uploadStatus === 'uploading' && (
                                      <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CircularProgress size={14} />
                                      </Box>
                                    )}
                                    {p.uploadStatus === 'error' && (
                                      <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Typography variant="caption" sx={{ color: 'error.main', fontSize: '0.6rem', fontWeight: 700 }}>!</Typography>
                                      </Box>
                                    )}
                                    <IconButton size="small" onClick={() => handleRemovePhoto(p.localId)} sx={{ position: 'absolute', top: -2, right: -2, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(200,0,0,0.8)' } }}>
                                      <DeleteIcon sx={{ fontSize: 10 }} />
                                    </IconButton>
                                  </Box>
                                </Tooltip>
                              ))}
                              <Tooltip title={oneDriveSignedIn ? 'Attach photo to this activity' : 'Sign in to OneDrive (see Photos section below)'}>
                                <IconButton
                                  size="small"
                                  onClick={() => oneDriveSignedIn ? triggerPhotoInput(index) : oneDriveLogin()}
                                  sx={{ color: oneDriveSignedIn ? NET_PACIFIC_COLORS.primary : 'text.disabled', border: '1px dashed', borderColor: 'divider', borderRadius: 0.5, p: 0.5 }}
                                >
                                  <CameraAltIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'top', pt: 1 }}>
                            <IconButton size="small" onClick={() => setServiceReportActivitiesTable((prev) => prev.filter((_, i) => i !== index))} color="error" title="Remove row"><DeleteIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setServiceReportActivitiesTable((prev) => [...prev, { activity: '', findingOutcome: '' }])} sx={{ mt: 1, textTransform: 'none', color: NET_PACIFIC_COLORS.primary }}>Add row</Button>
            </Box>

            {/* Recommendations and Remarks */}
            <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle2">Recommendations and Remarks</Typography>
                <Tooltip title={oneDriveSignedIn ? 'Attach photo to recommendations' : 'Sign in to OneDrive to attach photos'}>
                  <IconButton
                    size="small"
                    onClick={() => oneDriveSignedIn ? triggerPhotoInput(-1) : oneDriveLogin()}
                    sx={{ color: oneDriveSignedIn ? NET_PACIFIC_COLORS.primary : 'text.disabled', border: '1px dashed', borderColor: 'divider', borderRadius: 0.5, p: 0.5 }}
                  >
                    <CameraAltIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <TextField size="small" fullWidth multiline minRows={4} placeholder="Enter recommendations and remarks..." value={serviceReportCustomerComments} onChange={(e) => setServiceReportCustomerComments(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }} />
              {/* Inline photos for recommendations */}
              {photos.filter(p => p.activityIndex === -1).length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {photos.filter(p => p.activityIndex === -1).map(p => (
                    <Tooltip key={p.localId} title={p.uploadStatus === 'error' ? (p.errorMessage || 'Upload failed') : (p.filename || p.file?.name || '')}>
                      <Box sx={{ position: 'relative', width: 72, height: 72, borderRadius: 1, overflow: 'hidden', border: '1px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(p.previewUrl || p.thumbnailDataUrl) && (
                          <img src={p.previewUrl ?? p.thumbnailDataUrl} alt={p.filename || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        {p.uploadStatus === 'uploading' && (
                          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CircularProgress size={18} />
                          </Box>
                        )}
                        {p.uploadStatus === 'error' && (
                          <Chip label="Error" size="small" color="error" sx={{ position: 'absolute', bottom: 2, left: 2, fontSize: '0.6rem', height: 16 }} />
                        )}
                        <IconButton size="small" onClick={() => handleRemovePhoto(p.localId)}
                          sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(200,0,0,0.8)' } }}>
                          <DeleteIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Accordion 3: Signatories */}
        <Accordion
          expanded={expandedSections.signatories}
          onChange={() => toggleSection('signatories')}
          disableGutters
          elevation={0}
          sx={sectionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
            <Typography variant="h6" sx={sectionTitleSx}>
              Signatories
            </Typography>
            {preparedByName && (
              <Chip label="Set" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
            )}
          </AccordionSummary>
          <AccordionDetails>
            {/* Prepared by */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Prepared by
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField size="small" label="Name" value={preparedByName} onChange={(e) => setPreparedByName(e.target.value)} sx={{ flex: 1, minWidth: 150 }} placeholder="Engineer name" />
                <TextField size="small" label="Designation" value={preparedByDesignation} onChange={(e) => setPreparedByDesignation(e.target.value)} sx={{ flex: 1, minWidth: 120 }} placeholder="Position" />
                <TextField size="small" label="Company" value={preparedByCompany} onChange={(e) => setPreparedByCompany(e.target.value)} sx={{ flex: 1, minWidth: 150 }} placeholder={REPORT_COMPANIES[reportCompany]} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Leave Company blank to use the report company ({REPORT_COMPANIES[reportCompany]}).
              </Typography>
            </Paper>

            {/* Approved by */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Approved by
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField size="small" label="Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} sx={{ flex: 1, minWidth: 150 }} placeholder={clientApprover?.name || 'Client approver name'} />
                <TextField size="small" label="Designation" value={approverDesignation} onChange={(e) => setApproverDesignation(e.target.value)} sx={{ flex: 1, minWidth: 120 }} placeholder={clientApprover?.designation || 'Position'} />
                <TextField size="small" label="Company" value={approverCompany} onChange={(e) => setApproverCompany(e.target.value)} sx={{ flex: 1, minWidth: 150 }} placeholder={clientApprover?.company || 'Company'} />
              </Box>
            </Paper>
          </AccordionDetails>
        </Accordion>

        {/* Accordion 4: Photos */}
        <Accordion
          expanded={expandedSections.photos}
          onChange={() => toggleSection('photos')}
          disableGutters
          elevation={0}
          sx={sectionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
            <Typography variant="h6" sx={sectionTitleSx}>
              Site Photos
            </Typography>
            {photos.filter(p => p.activityIndex === undefined).length > 0 && (
              <Chip
                label={`${photos.filter(p => p.activityIndex === undefined).length} photo${photos.filter(p => p.activityIndex === undefined).length !== 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
                sx={{ mr: 1 }}
              />
            )}
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              {!oneDriveConfigured ? (
                <Typography variant="caption" color="text.secondary">OneDrive is not configured for this environment.</Typography>
              ) : !oneDriveSignedIn ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={oneDriveAuthLoading ? <CircularProgress size={14} /> : <CameraAltIcon />}
                  disabled={oneDriveAuthLoading}
                  onClick={() => oneDriveLogin()}
                  sx={{ textTransform: 'none', borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                >
                  Sign in to OneDrive to attach photos
                </Button>
              ) : (
                <Button
                  size="small"
                  startIcon={<CameraAltIcon />}
                  onClick={() => triggerPhotoInput(null)}
                  sx={{ textTransform: 'none', color: NET_PACIFIC_COLORS.primary, borderColor: NET_PACIFIC_COLORS.primary }}
                  variant="outlined"
                >
                  Add photos
                </Button>
              )}
              {photosFolderUrl && (
                <Button
                  size="small"
                  variant="text"
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  component="a"
                  href={photosFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.75rem' }}
                >
                  Open Photos folder
                </Button>
              )}
            </Box>
            {photos.some(p => p.file || p.uploadStatus === 'done') && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Photos in PDF:</Typography>
                <ToggleButtonGroup size="small" exclusive value={photoPlacement} onChange={(_, v) => { if (v) setPhotoPlacement(v); }}>
                  <ToggleButton value="inline" sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, px: 1.25 }}>Inline per activity</ToggleButton>
                  <ToggleButton value="end" sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, px: 1.25 }}>End of report</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
            {photos.filter(p => p.activityIndex === undefined).length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {photos.filter(p => p.activityIndex === undefined).map(p => (
                  <Tooltip key={p.localId} title={p.uploadStatus === 'error' ? (p.errorMessage || 'Upload failed') : (p.filename || p.file?.name || '')}>
                    <Box sx={{ position: 'relative', width: 80, height: 80, borderRadius: 1, overflow: 'hidden', border: '1px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {(p.previewUrl || p.thumbnailDataUrl) && (
                        <img src={p.previewUrl ?? p.thumbnailDataUrl} alt={p.filename || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      {p.uploadStatus === 'uploading' && (
                        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CircularProgress size={20} />
                        </Box>
                      )}
                      {p.uploadStatus === 'done' && p.webUrl && (
                        <IconButton size="small" component="a" href={p.webUrl} target="_blank" rel="noopener noreferrer"
                          sx={{ position: 'absolute', bottom: 2, right: 20, bgcolor: 'rgba(0,0,0,0.45)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}>
                          <OpenInNewIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      )}
                      {p.uploadStatus === 'error' && (
                        <Chip label="Error" size="small" color="error" sx={{ position: 'absolute', bottom: 2, left: 2, fontSize: '0.6rem', height: 16 }} />
                      )}
                      <IconButton size="small" onClick={() => handleRemovePhoto(p.localId)}
                        sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(200,0,0,0.8)' } }}>
                        <DeleteIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Accordion 5: Saved Reports */}
        <Accordion
          expanded={expandedSections.savedReports}
          onChange={() => toggleSection('savedReports')}
          disableGutters
          elevation={0}
          sx={sectionSx}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
            <Typography variant="h6" sx={sectionTitleSx}>
              Saved Reports
            </Typography>
            {serviceReports.length > 0 && (
              <Chip label={String(serviceReports.length)} size="small" variant="outlined" sx={{ mr: 1 }} />
            )}
            {srLoading && <CircularProgress size={16} sx={{ color: NET_PACIFIC_COLORS.primary, mr: 1 }} />}
          </AccordionSummary>
          <AccordionDetails>
            {serviceReports.length > 0 ? (
              <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1, maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={headSx}>Report No.</TableCell>
                      <TableCell sx={headSx}>Date</TableCell>
                      <TableCell sx={headSx}>Title</TableCell>
                      <TableCell align="right" sx={headSx}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serviceReports.map((r) => (
                      <TableRow key={r.id} hover selected={editingServiceReportId === r.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0,0,0,0.02)' }, '& td': { fontSize: '0.8rem' } }}>
                        <TableCell>{r.reportNo}</TableCell>
                        <TableCell>{new Date(r.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</TableCell>
                        <TableCell>{r.title || 'Service Report'}</TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => handleLoadServiceReport(r)} sx={{ color: NET_PACIFIC_COLORS.primary }}>Load</Button>
                          <IconButton size="small" color="error" onClick={() => handleDeleteServiceReport(r)} title="Delete report" aria-label="Delete report">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No saved reports yet. Use the Save button to store a snapshot.
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

      </Box>

      {/* Hidden file input shared by both per-activity and general photo pickers */}
      <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />

      {/* Sticky bottom bar */}
      <Paper
        elevation={3}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`,
          pl: 2,
          pr: 9,
          py: 1.25,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              {serviceReportNo || 'New Report'}
            </Typography>
            {editingServiceReportId !== null && (
              <Chip label={`Editing ${serviceReports.find(r => r.id === editingServiceReportId)?.reportNo || ''}`} size="small" color="info" variant="outlined" />
            )}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: { xs: 1, sm: 0 } }}>
            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={resetServiceReportForm} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>New</Button>
            <Button variant="outlined" size="small" onClick={handleSaveServiceReport} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{serviceReportSaveFeedback ? 'Saved' : 'Save'}</Button>
            <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview</Button>
            <Button variant="contained" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={exporting} sx={{ backgroundColor: NET_PACIFIC_COLORS.primary, '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary } }}>{exporting ? 'Exporting...' : 'Export PDF'}</Button>
            <Button variant="outlined" size="small" startIcon={<GridOnIcon />} onClick={handleExportXlsx} disabled={exportingXlsx} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{exportingXlsx ? 'Excel...' : 'Excel'}</Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default ServiceReportTab;
