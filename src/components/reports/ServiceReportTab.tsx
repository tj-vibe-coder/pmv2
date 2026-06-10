import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  PictureAsPdf as PictureAsPdfIcon,
  Visibility as VisibilityIcon,
  CameraAlt as CameraAltIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { Project } from '../../types/Project';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  REPORT_COMPANIES,
  type ReportCompanyKey,
  ServiceReport,
  ServiceReportPhoto,
  getServiceReports,
  saveServiceReport,
  updateServiceReport,
  deleteServiceReport,
  clearServiceReports,
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

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };
const DR_HEADER_BLUE = [44, 90, 160] as [number, number, number];

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
  project: Project;
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
  const [exporting, setExporting] = useState(false);
  const {
    isConfigured: oneDriveConfigured,
    isAuthenticated: oneDriveSignedIn,
    isLoading: oneDriveAuthLoading,
    login: oneDriveLogin,
    getAccessToken: getOneDriveToken,
  } = useOneDriveAuth();
  // Local copy of execution folder id — updated if we auto-create the folder on first export
  const [localExecutionFolderId, setLocalExecutionFolderId] = useState(project.executionFolderId);
  useEffect(() => { setLocalExecutionFolderId(project.executionFolderId); }, [project.id, project.executionFolderId]);

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
    setPhotos(prev => {
      prev.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      return [];
    });
  }, [clientApprover?.name, clientApprover?.designation, clientApprover?.company]);

  const loadServiceReports = useCallback(async () => {
    setSrLoading(true);
    try {
      const reports = await getServiceReports(project.id);
      setServiceReports(reports);
    } catch {
      // Keep stale list on transient error — don't wipe what the user can see.
    } finally {
      setSrLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    resetServiceReportForm();
    setPhotosFolderId(null);
    setPhotosFolderUrl(null);
    setResolvedExecFolderId(null);
    loadServiceReports();
    migrateServiceReportsFromLocalStorage().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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
        const projectCode = project.project_no || String(project.item_no ?? project.id);
        const execFolder = await ensureExecutionFolder(token, { code: projectCode, name: project.project_name });
        execFolderId = execFolder.id;
        setResolvedExecFolderId(execFolderId);
        // Also persist if nothing was stored yet
        if (!localExecutionFolderId) {
          setLocalExecutionFolderId(execFolderId);
          dataService.updateProject(project.id, { executionFolderId: execFolder.id, executionFolderUrl: execFolder.webUrl }).catch(() => {});
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

      const reportPrefix = (serviceReportNo || `${project.project_no || project.id}-SR`)
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
    const projectNo = (project.project_no || String(project.item_no ?? project.id) || '').trim() || '—';
    const editingReport = editingServiceReportId ? serviceReports.find(r => r.id === editingServiceReportId) : null;
    const reportNo = editingReport?.reportNo || `${projectNo} - SR${serviceReports.length + 1}`;
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
    };
    try {
      if (editingReport) {
        await updateServiceReport(editingReport.id, report);
      } else {
        await saveServiceReport(project.id, report);
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
  };

  const handleDeleteLoadedServiceReport = async () => {
    if (!editingServiceReportId) return;
    const report = serviceReports.find(r => r.id === editingServiceReportId);
    if (!report) return;
    if (!window.confirm(`Delete saved service report "${report.reportNo}"? This cannot be undone.`)) return;
    try {
      await deleteServiceReport(report.id);
      resetServiceReportForm();
      await loadServiceReports();
    } catch (err) {
      setExportFeedback({ severity: 'error', message: 'Failed to delete report.' });
    }
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

  const handleClearServiceReports = async () => {
    if (window.confirm('Remove all saved service reports for this project? This cannot be undone.')) {
      try {
        await clearServiceReports(project.id);
        resetServiceReportForm();
        setServiceReports([]);
      } catch (err) {
        setExportFeedback({ severity: 'error', message: 'Failed to clear reports.' });
      }
    }
  };

  const buildPdf = async (preview: boolean): Promise<{ blob: Blob; filename: string; missingPhotos: number } | void> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    const contentWidth = 210 - margin * 2;
    const pageHeight = 297;
    let y = 18;
    const lineHeight = 5.2;
    const sectionGap = 6;

    const hasArialNarrow = typeof arialNarrowBase64 === 'string' && arialNarrowBase64.length > 0;
    if (hasArialNarrow) {
      doc.addFileToVFS('ArialNarrow.ttf', arialNarrowBase64);
      doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
    }
    const fontTitle = () => doc.setFont('helvetica', 'bold');
    const fontBody = () => doc.setFont(hasArialNarrow ? 'ArialNarrow' : 'helvetica', 'normal');
    const companyName = REPORT_COMPANIES[reportCompany];
    const companyNameUpper = companyName.toUpperCase();
    const projectNo = (project.project_no || String(project.item_no ?? project.id) || '').trim() || '—';
    const reportNo = (serviceReportNo || '').trim() || `${projectNo} - SR${serviceReports.length + 1}`;
    const reportDateStr = serviceReportDate ? new Date(serviceReportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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

    // Helper: add a grid of photos to the PDF, returns new Y
    const addPhotoGrid = async (items: PhotoItem[], startY: number): Promise<number> => {
      const colCount = 2;
      const gap = 5;
      const photoW = (contentWidth - gap * (colCount - 1)) / colCount;
      const photoMaxH = 55;
      const captionH = 5;
      let gY = startY;
      let col = 0;
      let rowTopY = gY;

      for (const photo of items) {
        const dataUrl = photoDataUrls.get(photo.localId);
        if (!dataUrl) continue;
        const x = margin + col * (photoW + gap);

        // Measure image natural dimensions for aspect-ratio fitting
        let drawW = photoW;
        let drawH = photoMaxH;
        try {
          await new Promise<void>(res => {
            const img = new Image();
            img.onload = () => {
              const aspect = img.naturalWidth / img.naturalHeight;
              if (aspect > photoW / photoMaxH) {
                drawW = photoW;
                drawH = photoW / aspect;
              } else {
                drawH = photoMaxH;
                drawW = photoMaxH * aspect;
              }
              res();
            };
            img.onerror = () => res();
            img.src = dataUrl;
          });
        } catch (_) {}

        // New page if this row won't fit
        if (rowTopY + photoMaxH + captionH + 4 > pageHeight - 25) {
          doc.addPage();
          gY = 20;
          rowTopY = gY;
          col = 0;
        }

        try {
          const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(dataUrl, fmt, x, rowTopY, drawW, drawH, undefined, 'FAST');
        } catch (_) {}

        // Caption: filename under the photo
        fontBody();
        doc.setFontSize(7);
        const rawName = photo.filename || photo.file?.name || '';
        const caption = rawName.replace(/^[^_]*_[^_]*_\d+\./, '').slice(0, 40) || rawName;
        doc.text(caption, x, rowTopY + photoMaxH + captionH, { maxWidth: photoW });

        col++;
        if (col >= colCount) {
          col = 0;
          gY = rowTopY + photoMaxH + captionH + 4;
          rowTopY = gY;
        }
      }
      if (col > 0) {
        gY = rowTopY + photoMaxH + captionH + 4;
      }
      return gY;
    };

    if (reportCompany === 'ACT') {
      try {
        const { loadLogoTransparentBackground, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT } = await import('../../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-acti.png`;
        const logoDataUrl = await loadLogoTransparentBackground(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, ACT_LOGO_PDF_WIDTH, ACT_LOGO_PDF_HEIGHT);
        y += ACT_LOGO_PDF_HEIGHT + 4;
      } catch (_) {}
    } else if (reportCompany === 'IOCT') {
      try {
        const { loadImageDataUrl, IOCT_ICON_LOGO_PDF_SIZE } = await import('../../utils/logoUtils');
        const logoUrl = `${process.env.PUBLIC_URL || ''}/logo-ioct-only.png`;
        const logoDataUrl = await loadImageDataUrl(logoUrl);
        doc.addImage(logoDataUrl, 'PNG', margin, y, IOCT_ICON_LOGO_PDF_SIZE, IOCT_ICON_LOGO_PDF_SIZE);
        y += IOCT_ICON_LOGO_PDF_SIZE + 4;
      } catch (_) {}
    }

    fontTitle();
    doc.setFontSize(11);
    doc.text(companyNameUpper, margin, y);
    fontTitle();
    doc.setFontSize(14);
    const pageWidth = 210;
    doc.text('Daily Service Report', pageWidth - margin, y, { align: 'right' });
    y += lineHeight + sectionGap;
    fontBody();
    doc.setFontSize(9);
    doc.text(`Project Name: ${project.project_name || '—'}`, margin, y);
    doc.text(`Report No.: ${reportNo}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`Project No.: ${projectNo}`, margin, y);
    doc.text(`Date: ${reportDateStr}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`PO No.: ${project.po_number || '—'}`, margin, y);
    doc.text(`Start Time: ${serviceReportStartTime || '—'}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
    doc.text(`Client: ${project.account_name || '—'}`, margin, y);
    doc.text(`End Time: ${serviceReportEndTime || '—'}`, pageWidth - margin, y, { align: 'right' });
    y += lineHeight + sectionGap;

    const signatureSpace = 2 * lineHeight;
    const signatureBlockHeight = 42 + signatureSpace;
    const signatureY = pageHeight - signatureBlockHeight - 10;

    // Activities table
    const tableRows = serviceReportActivitiesTable.filter((r) => (r.activity || '').trim() || (r.findingOutcome || '').trim());
    const headers = ['No.', 'Activity', 'Finding / Outcome'];
    const body: string[][] = tableRows.map((r, i) => [
      String(i + 1),
      (r.activity || '').trim() || '—',
      (r.findingOutcome || '').trim() || '—',
    ]);
    if (y > signatureY - 80) { doc.addPage(); y = 20; }
    fontTitle();
    doc.setFontSize(11);
    doc.text('Activities', margin, y);
    fontBody();
    y += lineHeight;
    doc.setFontSize(9);
    autoTable(doc, {
      head: [headers],
      body,
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      theme: 'grid',
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: contentWidth * 0.5 - 5 }, 2: { cellWidth: contentWidth * 0.5 - 5 } },
      styles: { fontSize: 8, font: hasArialNarrow ? 'ArialNarrow' : 'helvetica', overflow: 'linebreak', cellPadding: 2 },
      headStyles: { fillColor: DR_HEADER_BLUE, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 8 },
    });
    const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + sectionGap;

    // ------------------------------------------------------------------
    // Photos — inline mode: group by activity, render right after table
    // ------------------------------------------------------------------
    // Minimum vertical space needed to keep a section heading with at least
    // one photo row on the same page (heading + photo + caption + gap + footer).
    const photoRowMinH = 55 + 5 + 4; // photoMaxH + captionH + rowGap
    const headingH = lineHeight + 2;
    const footerClearance = 20; // keep clear of footer
    const ensurePhotoSectionFits = () => {
      if (y + headingH + photoRowMinH > pageHeight - footerClearance) {
        doc.addPage(); y = 20;
      }
    };

    if (photoPlacement === 'inline' && photoDataUrls.size > 0) {
      // Group: per-activity first (skip -1 which renders after recommendations), then general
      const activityIndices = Array.from(
        new Set(exportablePhotos.filter(p => p.activityIndex !== undefined && p.activityIndex >= 0).map(p => p.activityIndex as number))
      ).sort((a, b) => a - b);

      for (const idx of activityIndices) {
        const groupPhotos = exportablePhotos.filter(p => p.activityIndex === idx && photoDataUrls.has(p.localId));
        if (groupPhotos.length === 0) continue;
        const activityLabel = tableRows[idx]?.activity?.trim() || `Activity ${idx + 1}`;
        ensurePhotoSectionFits();
        fontTitle();
        doc.setFontSize(9);
        doc.text(`Photos — Activity ${idx + 1}: ${activityLabel.slice(0, 60)}`, margin, y);
        y += headingH;
        y = await addPhotoGrid(groupPhotos, y);
        y += sectionGap;
      }

      const generalPhotos = exportablePhotos.filter(p => p.activityIndex === undefined && photoDataUrls.has(p.localId));
      if (generalPhotos.length > 0) {
        ensurePhotoSectionFits();
        fontTitle();
        doc.setFontSize(9);
        doc.text('Site Photos (General)', margin, y);
        y += headingH;
        y = await addPhotoGrid(generalPhotos, y);
        y += sectionGap;
      }
    }

    // Recommendations and Remarks
    const boxHeight = 4 * lineHeight;
    if (y + boxHeight + sectionGap > signatureY - 5) { doc.addPage(); y = 20; }
    fontTitle();
    doc.setFontSize(11);
    doc.text('Recommendations and Remarks', margin, y);
    y += lineHeight + 2;
    doc.setDrawColor(180, 180, 180);
    doc.rect(margin, y, contentWidth, boxHeight);
    const commentsText = (serviceReportCustomerComments || '').trim();
    if (commentsText) {
      fontBody();
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(commentsText, contentWidth - 4), margin + 2, y + 3);
    }
    y += boxHeight + sectionGap;

    // Recommendations photos (activityIndex === -1) — always inline, right after the box
    const recPhotos = exportablePhotos.filter(p => p.activityIndex === -1 && photoDataUrls.has(p.localId));
    if (recPhotos.length > 0) {
      ensurePhotoSectionFits();
      fontTitle();
      doc.setFontSize(9);
      doc.text('Photos — Recommendations and Remarks', margin, y);
      y += headingH;
      y = await addPhotoGrid(recPhotos, y);
      y += sectionGap;
    }

    // ------------------------------------------------------------------
    // Photos — end-of-report mode: all non-recommendations photos at end
    // ------------------------------------------------------------------
    if (photoPlacement === 'end' && photoDataUrls.size > 0) {
      const endPhotos = exportablePhotos.filter(p => p.activityIndex !== -1 && photoDataUrls.has(p.localId));
      if (endPhotos.length > 0) {
        ensurePhotoSectionFits();
        fontTitle();
        doc.setFontSize(11);
        doc.text('Site Photos', margin, y);
        y += headingH;
        y = await addPhotoGrid(endPhotos, y);
        y += sectionGap;
      }
    }

    // Signature block — fixed position at bottom of last page
    const leftColX = margin;
    const rightColX = margin + 95;
    const lineWidth = 52;
    const sigLineHeight = 5;
    const drawSignatureLine = (colX: number, label: string, rowY: number, value?: string) => {
      fontBody();
      doc.setFontSize(9);
      doc.text(label, colX, rowY);
      if (value) doc.text(value, colX + 28, rowY);
      doc.setDrawColor(180, 180, 180);
      doc.line(colX + 26, rowY + 2, colX + 26 + lineWidth, rowY + 2);
    };
    const totalPages = doc.getNumberOfPages();
    const lastPageSignatureY = pageHeight - signatureBlockHeight - 10;
    doc.setPage(totalPages);
    fontTitle();
    doc.setFontSize(10);
    doc.text('Prepared by:', leftColX, lastPageSignatureY);
    doc.text('Approved by:', rightColX, lastPageSignatureY);
    let rowY = lastPageSignatureY + signatureSpace;
    const preparedByName = (preparedBy.name || currentUser?.full_name || currentUser?.username || currentUser?.email || '').trim() || '—';
    drawSignatureLine(leftColX, 'Name', rowY, preparedByName);
    drawSignatureLine(rightColX, 'Name', rowY, approverName.trim() || undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Designation', rowY, (preparedBy.designation || '').trim() || undefined);
    drawSignatureLine(rightColX, 'Designation', rowY, approverDesignation.trim() || undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Company', rowY, companyName);
    drawSignatureLine(rightColX, 'Company', rowY, approverCompany.trim() || undefined);
    rowY += sigLineHeight;
    drawSignatureLine(leftColX, 'Date', rowY, reportDateStr);
    drawSignatureLine(rightColX, 'Date', rowY, reportDateStr);

    const docNumber = `Doc. No.: ${reportNo}`;
    const footerY = pageHeight - 10;
    fontBody();
    doc.setFontSize(8);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(docNumber, margin, footerY);
      doc.text(`Page ${p} of ${totalPages}`, 210 - margin, footerY, { align: 'right' });
    }

    // Format: IOCT2606001-SR1.pdf (collapse "IOCT2606001 - SR1" → "IOCT2606001-SR1")
    const filename = `${reportNo.replace(/\s*-\s*/g, '-').replace(/\s+/g, '')}.pdf`;
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
        const projectCode = project.project_no || String(project.item_no ?? project.id);
        const folder = await ensureExecutionFolder(token, { code: projectCode, name: project.project_name });
        folderId = folder.id;
        setResolvedExecFolderId(folderId);
        if (!localExecutionFolderId) {
          setLocalExecutionFolderId(folderId);
          dataService.updateProject(project.id, { executionFolderId: folder.id, executionFolderUrl: folder.webUrl }).catch(() => {});
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

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        Service Report
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create service reports. Save to store a snapshot; load a previous report; Preview or Export to PDF.
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={resetServiceReportForm}
          sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary, textTransform: 'none' }}
        >
          New report
        </Button>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="Report Date" type="date" value={serviceReportDate} onChange={(e) => setServiceReportDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Report No.</Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {serviceReportNo || `${(project.project_no || String(project.item_no ?? project.id) || '—').trim()} - SR${serviceReports.length + 1}`}
          </Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="Start Time" type="time" value={serviceReportStartTime} onChange={(e) => setServiceReportStartTime(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" fullWidth label="End Time" type="time" value={serviceReportEndTime} onChange={(e) => setServiceReportEndTime(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField size="small" fullWidth label="Title" placeholder="e.g. Monthly Service Visit" value={serviceReportTitle} onChange={(e) => setServiceReportTitle(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Activities</Typography>
          <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}>
            <Table size="small" sx={{ minWidth: 560, '& td, & th': { border: '1px solid #e2e8f0' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', width: 48, color: '#fff' }}>No.</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fff' }}>Activity</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fff' }}>Finding / Outcome</TableCell>
                  <TableCell sx={{ width: 80, color: '#fff', fontWeight: 600, fontSize: '0.8125rem' }}>Photos</TableCell>
                  <TableCell sx={{ width: 48 }} />
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
                          <Tooltip title={oneDriveSignedIn ? 'Attach photo to this activity' : 'Sign in to OneDrive (see Site Photos section below)'}>
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
        </Grid>
        <Grid size={{ xs: 12 }}>
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
        </Grid>

        {/* Approved by — editable, pre-filled from client record */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Approved by (PDF)</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField size="small" label="Name" value={approverName} onChange={(e) => setApproverName(e.target.value)} sx={{ width: 220 }} placeholder={clientApprover?.name || 'Client approver name'} />
            <TextField size="small" label="Designation" value={approverDesignation} onChange={(e) => setApproverDesignation(e.target.value)} sx={{ width: 180 }} placeholder={clientApprover?.designation || 'Position'} />
            <TextField size="small" label="Company" value={approverCompany} onChange={(e) => setApproverCompany(e.target.value)} sx={{ width: 220 }} placeholder={clientApprover?.company || 'Company'} />
          </Box>
        </Grid>

        {/* General photos (not tied to a specific activity) */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2">Site Photos</Typography>
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
        </Grid>
      </Grid>

      {/* Hidden file input shared by both per-activity and general photo pickers */}
      <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel id="sr-report-company-label">Report as company</InputLabel>
          <Select labelId="sr-report-company-label" value={reportCompany} label="Report as company" onChange={(e) => setReportCompany(e.target.value as ReportCompanyKey)}>
            <MenuItem value="IOCT">{REPORT_COMPANIES.IOCT}</MenuItem>
            <MenuItem value="ACT">{REPORT_COMPANIES.ACT}</MenuItem>
          </Select>
        </FormControl>
        {photos.some(p => p.file || p.uploadStatus === 'done') && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Photos in PDF:</Typography>
            <ToggleButtonGroup size="small" exclusive value={photoPlacement} onChange={(_, v) => { if (v) setPhotoPlacement(v); }}>
              <ToggleButton value="inline" sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, px: 1.25 }}>Inline per activity</ToggleButton>
              <ToggleButton value="end" sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, px: 1.25 }}>End of report</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={resetServiceReportForm} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>New report</Button>
        <Button variant="contained" size="small" onClick={handleSaveServiceReport} sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}>{serviceReportSaveFeedback ? 'Saved' : editingServiceReportId !== null ? 'Update report' : 'Save report'}</Button>
        <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>Preview PDF</Button>
        <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={handleExport} disabled={exporting} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>{exporting ? 'Exporting...' : 'Export to PDF'}</Button>
        {srLoading && <CircularProgress size={18} sx={{ color: NET_PACIFIC_COLORS.primary }} />}
        {serviceReports.length > 0 && (
          <>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="load-service-report-label">Load previous report</InputLabel>
              <Select labelId="load-service-report-label" value="" label="Load previous report" onChange={(e) => {
                const report = serviceReports.find(r => r.id === e.target.value);
                if (report) handleLoadServiceReport(report);
                (e.target as HTMLSelectElement).value = '';
              }}>
                <MenuItem value=""><em>— Select to load —</em></MenuItem>
                {serviceReports.map((r) => (
                  <MenuItem key={r.id} value={r.id}>{new Date(r.date).toLocaleDateString('en-US', { dateStyle: 'medium' })} · {r.reportNo}{r.title ? ` · ${r.title.slice(0, 30)}${r.title.length > 30 ? '…' : ''}` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" color="error" onClick={handleClearServiceReports}>Clear all saved reports</Button>
          </>
        )}
      </Box>
      {serviceReports.length > 0 && (
        <TableContainer sx={{ mt: 2, border: '1px solid #e2e8f0', borderRadius: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 600 }}>Saved service reports</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serviceReports.map((r) => (
                <TableRow key={r.id} hover selected={editingServiceReportId === r.id}>
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
      )}
      {editingServiceReportId !== null && serviceReports.find(r => r.id === editingServiceReportId) != null && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.8125rem' }}>
            Editing: {serviceReports.find(r => r.id === editingServiceReportId)!.reportNo}. Click &quot;Update report&quot; to save changes.
          </Typography>
          <Button size="small" variant="outlined" onClick={resetServiceReportForm}>Cancel edit</Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDeleteLoadedServiceReport}>Delete report</Button>
        </Box>
      )}
      {exportFeedback && (
        <Alert severity={exportFeedback.severity} sx={{ mt: 2 }} onClose={() => setExportFeedback(null)}>
          {exportFeedback.message}
        </Alert>
      )}
    </Paper>
  );
};

export default ServiceReportTab;
