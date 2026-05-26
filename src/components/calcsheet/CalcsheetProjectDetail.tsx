import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Stack, Switch, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { nanoid } from 'nanoid';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import HistoryIcon from '@mui/icons-material/History';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderIcon from '@mui/icons-material/Folder';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { useQuotationStore } from '../../store/quotationStore';
import { computeTotals, PHP } from '../../utils/calcsheet/calc';
import type { ProjectStatus, Quotation, QuotationKind } from '../../types/Quotation';
import { parseLegacyWorkbook } from '../../utils/calcsheet/legacyImport';
import type { ParsedProject, ParsedQuotation } from '../../utils/calcsheet/legacyImport';
import { parseLegacyPdf } from '../../utils/calcsheet/legacyPdfImport';
import type { ParsedLegacyPdf } from '../../utils/calcsheet/legacyPdfImport';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import {
  ensureProposalFolder,
  ensureExecutionFolder,
  moveProposalToExecution,
  resolveCorporateDriveId,
  verifyDriveItem,
  resolveSharingUrl,
  listFoldersWithPrefix,
  projectCodePrefix,
  type DriveItemRef,
} from '../../services/onedriveFolderService';
import { onedriveConfig } from '../../config/onedriveConfig';
import LinkIcon from '@mui/icons-material/Link';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const project = useQuotationStore((s) => s.projects.find((p) => p.id === id));
  const clients = useQuotationStore((s) => s.clients);
  const allQuotations = useQuotationStore((s) => s.quotations);
  const quotations = useMemo(() => allQuotations.filter((q) => q.projectId === id), [allQuotations, id]);
  const createQuotation = useQuotationStore((s) => s.createQuotation);
  const deleteQuotation = useQuotationStore((s) => s.deleteQuotation);
  const duplicateQuotation = useQuotationStore((s) => s.duplicateQuotation);
  const importQuotation = useQuotationStore((s) => s.importQuotation);
  const updateProject = useQuotationStore((s) => s.updateProject);
  const syncMainProject = useQuotationStore((s) => s.syncMainProject);

  // OneDrive corporate folder integration
  const { isAuthenticated: oneDriveSignedIn, login: oneDriveLogin, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const [oneDriveBusy, setOneDriveBusy] = useState<'proposal' | 'execution' | null>(null);
  const [oneDriveErr, setOneDriveErr] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  // Non-error info message shown next to the OneDrive buttons. Used to tell the
  // user when auto-detect matched an existing historical folder (instead of
  // creating a new one) so they don't think the system silently misbehaved.
  const [oneDriveInfo, setOneDriveInfo] = useState<string>('');
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [mainSyncBusy, setMainSyncBusy] = useState(false);
  const [mainSyncErr, setMainSyncErr] = useState('');
  const [mainSyncInfo, setMainSyncInfo] = useState('');

  const syncToMainProject = async (force = false) => {
    if (!project) return null;
    setMainSyncBusy(true);
    setMainSyncErr('');
    setMainSyncInfo('');
    try {
      const result = await syncMainProject(project.id, { force });
      const verb = result.action === 'linked-existing'
        ? 'Linked existing Project List record'
        : result.action === 'recreated'
          ? 'Recreated Project List record'
          : result.action === 'updated'
            ? 'Updated Project List record'
            : 'Created Project List record';
      setMainSyncInfo(`${verb} using ${result.quotationKind} quotation (${PHP(result.amount)}).`);
      return result;
    } catch (e) {
      setMainSyncErr(e instanceof Error ? e.message : 'Failed to sync Project List record');
      return null;
    } finally {
      setMainSyncBusy(false);
    }
  };

  const changeStatus = async (nextStatus: ProjectStatus) => {
    if (!project) return;
    setMainSyncErr('');
    setMainSyncInfo('');
    if (nextStatus === 'won' && project.status !== 'won') {
      setStatusConfirmOpen(true);
      return;
    }
    await updateProject(project.id, { status: nextStatus });
  };

  const confirmWon = async (sync: boolean) => {
    if (!project) return;
    setStatusConfirmOpen(false);
    setMainSyncErr('');
    setMainSyncInfo('');
    try {
      const result = sync ? await syncToMainProject(false) : null;
      if (sync && !result) return;
      await updateProject(project.id, {
        status: 'won',
        ...(result ? { mainProjectId: result.mainProjectId, mainProjectNo: result.projectNo } : {}),
      });
    } catch (e) {
      setMainSyncErr(e instanceof Error ? e.message : 'Failed to mark project as won');
    }
  };

  const createProposalFolderManually = async () => {
    if (!project) return;
    setOneDriveBusy('proposal');
    setOneDriveErr('');
    setOneDriveInfo('');
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setOneDriveErr('Not signed in to OneDrive.');
        return;
      }
      const ref = await ensureProposalFolder(token, project);
      await updateProject(project.id, {
        proposalFolderId: ref.id,
        proposalFolderUrl: ref.webUrl,
      });
      if (ref.matchedExisting) {
        setOneDriveInfo(`Linked to existing folder: "${ref.folderName}"`);
      }
    } catch (e) {
      setOneDriveErr(e instanceof Error ? e.message : 'Failed to create proposal folder');
    } finally {
      setOneDriveBusy(null);
    }
  };

  /**
   * Verify a stored OneDrive folder still exists, then either open it or, if it
   * was deleted out-of-band (via OneDrive web/Finder), clear the stale URL on
   * the project so the button reverts to "Create…". Best-effort: if the verify
   * itself fails (network/auth blip), fall through to opening the URL so we
   * don't block the user on a folder that's probably fine.
   */
  const openFolderOrSelfHeal = async (which: 'proposal' | 'execution') => {
    if (!project) return;
    const folderUrl = which === 'proposal' ? project.proposalFolderUrl : project.executionFolderUrl;
    const folderId = which === 'proposal' ? project.proposalFolderId : project.executionFolderId;
    if (!folderUrl) return;

    // No id to verify against — just open.
    if (!folderId) {
      window.open(folderUrl, '_blank', 'noopener');
      return;
    }

    try {
      const token = await getOneDriveToken();
      if (!token) {
        // Not signed in — just open and let OneDrive prompt for sign-in.
        window.open(folderUrl, '_blank', 'noopener');
        return;
      }
      const driveId = await resolveCorporateDriveId(token);
      const exists = await verifyDriveItem(token, driveId, folderId);
      if (exists) {
        window.open(folderUrl, '_blank', 'noopener');
        return;
      }
      // Self-heal: folder was deleted in OneDrive. Clear stored URL/id so the
      // button reverts to "Create proposal/execution folder".
      //
      // Special case: after a project is promoted (status → 'won'), the move
      // preserves the drive item's id, so proposalFolderId === executionFolderId
      // and both refs point at the same physical folder. If that single folder
      // is deleted, clearing only one side leaves the other side stale — which
      // makes the button mislabel itself "Promote to execution" and then the
      // promote operation 404s on the non-existent source. So when the two refs
      // share an id, clear both atomically.
      const sharedId =
        project.proposalFolderId &&
        project.executionFolderId &&
        project.proposalFolderId === project.executionFolderId;
      const patch = sharedId
        ? { proposalFolderId: '', proposalFolderUrl: '', executionFolderId: '', executionFolderUrl: '' }
        : which === 'proposal'
          ? { proposalFolderId: '', proposalFolderUrl: '' }
          : { executionFolderId: '', executionFolderUrl: '' };
      await updateProject(project.id, patch);
      setOneDriveErr(`The ${which} folder no longer exists in OneDrive. Click "Create ${which} folder" to make a new one.`);
    } catch (err) {
      // Verify failed for some non-404 reason — open the link anyway so the
      // user isn't blocked. They'll see the OneDrive error directly if it's broken.
      // eslint-disable-next-line no-console
      console.warn(`[OneDrive] verify ${which} folder failed, opening anyway`, err);
      window.open(folderUrl, '_blank', 'noopener');
    }
  };

  // "Link existing folder" — the dialog auto-scans OneDrive for folders whose
  // name starts with this project's PCS code and lists them as one-click
  // suggestions. Falls back to manual URL paste at the bottom for edge cases
  // (folders renamed beyond recognition, missing PCS code prefix, etc.).
  const [linkDialogOpen, setLinkDialogOpen] = useState<null | 'proposal' | 'execution'>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<DriveItemRef[]>([]);
  const [linkSuggestionsLoading, setLinkSuggestionsLoading] = useState(false);

  const fetchSuggestions = async (kind: 'proposal' | 'execution') => {
    if (!project) return;
    setLinkSuggestionsLoading(true);
    setLinkSuggestions([]);
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setLinkErr('Not signed in to OneDrive — can\'t fetch suggestions. Paste a URL below instead.');
        return;
      }
      const driveId = await resolveCorporateDriveId(token);
      const root = kind === 'proposal' ? onedriveConfig.proposalRoot : onedriveConfig.executionRoot;
      const prefix = projectCodePrefix(project);
      const matches = await listFoldersWithPrefix(token, driveId, root, prefix);
      setLinkSuggestions(matches);
    } catch (e) {
      // Don't set the error red — fall back to URL input silently with a hint.
      // eslint-disable-next-line no-console
      console.warn('[OneDrive] suggestion fetch failed', e);
    } finally {
      setLinkSuggestionsLoading(false);
    }
  };

  const openLinkDialog = (kind: 'proposal' | 'execution') => {
    setLinkUrl('');
    setLinkErr('');
    setLinkSuggestions([]);
    setLinkDialogOpen(kind);
    void fetchSuggestions(kind);
  };

  const linkToSuggestion = async (ref: DriveItemRef) => {
    if (!project || !linkDialogOpen) return;
    setLinkBusy(true);
    setLinkErr('');
    try {
      const patch = linkDialogOpen === 'proposal'
        ? { proposalFolderId: ref.id, proposalFolderUrl: ref.webUrl }
        : { executionFolderId: ref.id, executionFolderUrl: ref.webUrl };
      await updateProject(project.id, patch);
      if (linkDialogOpen === 'execution' && project.mainProjectId) {
        await fetch(`/api/projects/${project.mainProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionFolderId: ref.id, executionFolderUrl: ref.webUrl }),
        }).catch(() => {});
      }
      setLinkDialogOpen(null);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : 'Failed to link folder');
    } finally {
      setLinkBusy(false);
    }
  };

  const submitLinkDialog = async () => {
    if (!project || !linkDialogOpen) return;
    setLinkErr('');
    setLinkBusy(true);
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setLinkErr('Not signed in to OneDrive.');
        return;
      }
      const ref = await resolveSharingUrl(token, linkUrl);
      if (!ref.isFolder) {
        setLinkErr('That URL points to a file, not a folder. Paste a folder URL.');
        return;
      }
      const patch = linkDialogOpen === 'proposal'
        ? { proposalFolderId: ref.id, proposalFolderUrl: ref.webUrl }
        : { executionFolderId: ref.id, executionFolderUrl: ref.webUrl };
      await updateProject(project.id, patch);
      if (linkDialogOpen === 'execution' && project.mainProjectId) {
        await fetch(`/api/projects/${project.mainProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionFolderId: ref.id, executionFolderUrl: ref.webUrl }),
        }).catch(() => {});
      }
      setLinkDialogOpen(null);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : 'Failed to resolve URL');
    } finally {
      setLinkBusy(false);
    }
  };

  const createExecutionFolderManually = async () => {
    if (!project) return;
    setOneDriveBusy('execution');
    setOneDriveErr('');
    setOneDriveInfo('');
    try {
      const token = await getOneDriveToken();
      if (!token) {
        setOneDriveErr('Not signed in to OneDrive.');
        return;
      }
      // Preferred path: move the existing proposal folder so files travel with the
      // project (single source of truth). Fallback: create a fresh execution folder
      // when there's no proposal folder to move OR when the stored proposal folder
      // has been deleted externally (the move would 404).
      let proposalGone = !project.proposalFolderId;
      if (project.proposalFolderId) {
        try {
          const driveId = await resolveCorporateDriveId(token);
          proposalGone = !(await verifyDriveItem(token, driveId, project.proposalFolderId));
        } catch {
          // If verify itself errors, optimistically try the move; moveItem will
          // throw a clearer error if the source is genuinely gone.
          proposalGone = false;
        }
      }

      if (!proposalGone && project.proposalFolderId) {
        const { moved } = await moveProposalToExecution(token, {
          code: project.code,
          name: project.name,
          proposalFolderId: project.proposalFolderId,
          executionFolderName: project.mainProjectNo,
        });
        await updateProject(project.id, {
          proposalFolderUrl: moved.webUrl,
          executionFolderId: moved.id,
          executionFolderUrl: moved.webUrl,
        });
        if (project.mainProjectId) {
          await fetch(`/api/projects/${project.mainProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executionFolderId: moved.id, executionFolderUrl: moved.webUrl }),
          }).catch(() => {});
        }
      } else {
        // Either no proposal folder ever existed, or it was deleted out-of-band.
        // Create a fresh execution folder and clear any stale proposal refs so
        // future clicks don't try to re-promote a ghost.
        const executionProject = project.mainProjectNo
          ? { code: project.mainProjectNo, name: '' }
          : project;
        const ref = await ensureExecutionFolder(token, executionProject);
        await updateProject(project.id, {
          proposalFolderId: '',
          proposalFolderUrl: '',
          executionFolderId: ref.id,
          executionFolderUrl: ref.webUrl,
        });
        if (project.mainProjectId) {
          await fetch(`/api/projects/${project.mainProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executionFolderId: ref.id, executionFolderUrl: ref.webUrl }),
          }).catch(() => {});
        }
        if (ref.matchedExisting) {
          setOneDriveInfo(`Linked to existing folder: "${ref.folderName}"`);
        }
      }
    } catch (e) {
      setOneDriveErr(e instanceof Error ? e.message : 'Failed to create execution folder');
    } finally {
      setOneDriveBusy(null);
    }
  };

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<QuotationKind>('IOCT');
  const [recipientId, setRecipientId] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ code: '', name: '', location: '', customerId: '', partnerId: '' });

  // Legacy-quotation single-file import (for adding a missing kind to an existing project)
  const legacyFileInputRef = useRef<HTMLInputElement | null>(null);
  // Page-wide drag-and-drop state (auto-routes by file extension)
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyParsed, setLegacyParsed] = useState<ParsedProject | null>(null);
  const [legacySource, setLegacySource] = useState<string>('');
  const [legacySelect, setLegacySelect] = useState<{ IOCT: boolean; ACTI: boolean }>({ IOCT: false, ACTI: false });
  const [legacyRevisions, setLegacyRevisions] = useState<{ IOCT: string; ACTI: string }>({ IOCT: '00', ACTI: '00' });
  const [legacyRecipient, setLegacyRecipient] = useState<{ IOCT: string; ACTI: string }>({ IOCT: '', ACTI: '' });
  // Per-kind VAT inclusion: true → use the VAT-IN grand total from the workbook
  // (default — what was actually issued); false → drop VAT and use the VAT-EX
  // subtotal as the grand total. Lets the user record a VAT-EX quotation when
  // the workbook was authored VAT-IN (or vice-versa) without editing the file.
  const [legacyIncludeVat, setLegacyIncludeVat] = useState<{ IOCT: boolean; ACTI: boolean }>({ IOCT: true, ACTI: true });
  const [legacyError, setLegacyError] = useState<string>('');
  const [legacyImporting, setLegacyImporting] = useState(false);

  // Legacy-quotation PDF import (when the source .xlsx is missing/corrupted)
  const legacyPdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfParsed, setPdfParsed] = useState<ParsedLegacyPdf | null>(null);
  const [pdfForm, setPdfForm] = useState({
    kind: 'ACTI' as QuotationKind,
    revision: '00',
    recipientId: '',
    date: '',
    validityDays: 30,
    warrantyMonths: 12,
    paymentTerms: '',
    deliveryTerms: '',
    preparedBy: '',
    authorizedBy: 'Renzel Punongbayan',
    sectionA: 0,
    sectionB: 0,
    sectionC: 0,
    vatMode: 'VAT-EX' as 'VAT-EX' | 'VAT-IN',
    grandTotal: 0,
  });
  const [pdfError, setPdfError] = useState<string>('');
  const [pdfImporting, setPdfImporting] = useState(false);

  if (!project) return <Typography>Project not found. <Link to="/calcsheet/projects">Back</Link></Typography>;

  const customer = clients.find((c) => c.id === project.customerId);
  const partner = clients.find((c) => c.id === project.partnerId);

  const startNew = (k: QuotationKind) => {
    setKind(k);
    setRecipientId(k === 'IOCT' ? (partner?.id ?? customer?.id ?? '') : (customer?.id ?? ''));
    setOpen(true);
  };
  const create = async () => {
    const q = await createQuotation(project.id, kind, recipientId || null);
    setOpen(false);
    navigate(`/calcsheet/quotations/${q.id}`);
  };

  const hasIoct = quotations.some((q) => q.kind === 'IOCT');
  const hasActi = quotations.some((q) => q.kind === 'ACTI');

  const openEdit = () => {
    setEditForm({
      code: project.code,
      name: project.name,
      location: project.location ?? '',
      customerId: project.customerId ?? '',
      partnerId: project.partnerId ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    await updateProject(project.id, {
      code: editForm.code.trim(),
      name: editForm.name.trim(),
      location: editForm.location.trim() || undefined,
      customerId: editForm.customerId || null,
      partnerId: editForm.partnerId || null,
    });
    setEditOpen(false);
  };

  // ── Legacy-quotation import (single .xlsx into THIS project) ──────────────
  const nextRevisionFor = (k: QuotationKind, parsedRev: string): string => {
    const existing = quotations.filter((q) => q.kind === k).map((q) => q.revision);
    if (!existing.includes(parsedRev)) return parsedRev;
    // bump until free, padding to 2 digits
    let n = parseInt(parsedRev, 10);
    if (!Number.isFinite(n)) n = 0;
    while (existing.includes(String(n).padStart(2, '0'))) n += 1;
    return String(n).padStart(2, '0');
  };

  const onLegacyFilePicked = async (file: File | null) => {
    if (!file) return;
    setLegacyError('');
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseLegacyWorkbook(buf, {
        filename: file.name,
        offerPdfs: [],
        projectFolder: project.code,
      });
      const hasIoct = parsed.quotations.some((q) => q.kind === 'IOCT');
      const hasActi = parsed.quotations.some((q) => q.kind === 'ACTI');
      const ioctParsed = parsed.quotations.find((q) => q.kind === 'IOCT');
      const actiParsed = parsed.quotations.find((q) => q.kind === 'ACTI');
      setLegacyParsed(parsed);
      setLegacySource(file.name);
      setLegacySelect({ IOCT: hasIoct, ACTI: hasActi });
      setLegacyRevisions({
        IOCT: nextRevisionFor('IOCT', ioctParsed?.revision || '00'),
        ACTI: nextRevisionFor('ACTI', actiParsed?.revision || '00'),
      });
      // Default recipients: IOCT → partner (when set) else customer; ACTI → customer
      setLegacyRecipient({
        IOCT: project.partnerId ?? project.customerId ?? '',
        ACTI: project.customerId ?? '',
      });
      // Default VAT inclusion: keep VAT only when the workbook actually has a
      // non-zero VAT amount for that kind. Otherwise default to VAT-EX so the
      // user doesn't have to flip a switch on every import.
      setLegacyIncludeVat({
        IOCT: (ioctParsed?.legacyTotalsSnapshot.vat ?? 0) > 0,
        ACTI: (actiParsed?.legacyTotalsSnapshot.vat ?? 0) > 0,
      });
      setLegacyOpen(true);
    } catch (err: any) {
      setLegacyError(`Parse failed: ${err.message || err}`);
      setLegacyOpen(true);
    } finally {
      // reset so the same file can be re-picked after a failure
      if (legacyFileInputRef.current) legacyFileInputRef.current.value = '';
    }
  };

  const closeLegacyDialog = () => {
    setLegacyOpen(false);
    setLegacyParsed(null);
    setLegacySource('');
    setLegacyError('');
    setLegacyImporting(false);
  };

  const importLegacySelected = async () => {
    if (!legacyParsed) return;
    setLegacyImporting(true);
    setLegacyError('');
    try {
      const wantKinds: QuotationKind[] = [];
      if (legacySelect.IOCT) wantKinds.push('IOCT');
      if (legacySelect.ACTI) wantKinds.push('ACTI');
      const picks: ParsedQuotation[] = legacyParsed.quotations.filter((q) => wantKinds.includes(q.kind));
      if (picks.length === 0) {
        setLegacyError('Pick at least one kind to import.');
        setLegacyImporting(false);
        return;
      }
      for (const pq of picks) {
        const revision = legacyRevisions[pq.kind];
        // Guard against duplicate (kind, revision) on this project
        const dup = quotations.find((q) => q.kind === pq.kind && q.revision === revision);
        if (dup) {
          setLegacyError(`A ${pq.kind} rev ${revision} already exists on this project. Change the revision in the dialog and try again.`);
          setLegacyImporting(false);
          return;
        }
        const importedFrom: { sourceFile: string; importedAt: string; originalCode?: string } = {
          sourceFile: legacySource,
          importedAt: new Date().toISOString(),
          originalCode: legacyParsed.originalCode,
        };
        // Honor the per-kind "Include VAT" toggle: when off, zero out the VAT
        // amount and recompute the grand total as (subtotal − discount). The
        // snapshot is the source of truth for legacy quotations, so this is
        // where the decision is baked in.
        const includeVat = legacyIncludeVat[pq.kind];
        const snap = pq.legacyTotalsSnapshot;
        const snapshot = includeVat ? snap : {
          ...snap,
          vat: 0,
          grandTotal: Math.max(0, snap.subtotal - snap.discount),
        };
        const built: Quotation = {
          id: nanoid(8),
          projectId: project.id,
          kind: pq.kind,
          revision,
          recipientId: legacyRecipient[pq.kind] || null,
          validityDays: pq.validityDays,
          paymentTerms: pq.paymentTerms,
          deliveryTerms: pq.deliveryTerms,
          warrantyMonths: pq.warrantyMonths,
          productMarkupPct: pq.productMarkupPct,
          laborMarkupPct: pq.laborMarkupPct,
          generalReqMarkupPct: pq.generalReqMarkupPct,
          globalContingencyPct: pq.globalContingencyPct,
          discountPct: pq.discountPct,
          vatPct: includeVat ? pq.vatPct : 0,
          generalReqts: pq.generalReqts,
          components: pq.components,
          services: pq.services,
          manpower: pq.manpower,
          servicesFromManpower: pq.servicesFromManpower,
          preparedBy: pq.preparedBy,
          authorizedBy: pq.authorizedBy,
          formulaVersion: 'legacy',
          legacyTotalsSnapshot: snapshot,
          importedFrom,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await importQuotation(built);
      }
      closeLegacyDialog();
    } catch (err: any) {
      setLegacyError(err.message || String(err));
      setLegacyImporting(false);
    }
  };

  // Route a picked/dropped file to the right importer based on extension.
  const handleLegacyFile = (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (/\.xlsx?$/.test(lower)) {
      onLegacyFilePicked(file);
    } else if (/\.pdf$/.test(lower)) {
      onLegacyPdfPicked(file);
    } else {
      setLegacyError(`Unsupported file type: ${file.name}. Drop a .xlsx or .pdf.`);
      setLegacyOpen(true);
    }
  };

  // Drag-and-drop handlers (page-wide overlay)
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleLegacyFile(f);
  };

  // ── Legacy-quotation PDF import ───────────────────────────────────────────
  const onLegacyPdfPicked = async (file: File | null) => {
    if (!file) return;
    setPdfError('');
    setPdfParsing(true);
    setPdfOpen(true);
    try {
      const parsed = await parseLegacyPdf(file);
      const inferredKind: QuotationKind = parsed.kind === 'IOCT' ? 'IOCT' : 'ACTI';
      const initialRev = nextRevisionFor(inferredKind, parsed.revision || '00');
      // Guess recipient by matching name against existing clients (loose)
      const lcName = parsed.recipientName.toLowerCase();
      const matched = clients.find((c) => lcName && c.name.toLowerCase().includes(lcName.split(' ')[0]));
      setPdfParsed(parsed);
      setPdfForm({
        kind: inferredKind,
        revision: initialRev,
        recipientId:
          matched?.id ??
          (inferredKind === 'IOCT' ? (project.partnerId ?? project.customerId ?? '') : (project.customerId ?? '')),
        date: parsed.date || project.date || '',
        validityDays: parsed.validityDays,
        warrantyMonths: parsed.warrantyMonths,
        paymentTerms: parsed.paymentTerms || '30% DP, 70% Progress Billing',
        deliveryTerms: parsed.deliveryTerms || '',
        preparedBy: '',
        authorizedBy: parsed.authorizedBy || 'Renzel Punongbayan',
        sectionA: parsed.sectionA,
        sectionB: parsed.sectionB,
        sectionC: parsed.sectionC,
        vatMode: parsed.vatMode === 'VAT-IN' ? 'VAT-IN' : 'VAT-EX',
        grandTotal: parsed.grandTotal,
      });
    } catch (err: any) {
      setPdfError(`Parse failed: ${err.message || err}`);
    } finally {
      setPdfParsing(false);
      if (legacyPdfInputRef.current) legacyPdfInputRef.current.value = '';
    }
  };

  const closePdfDialog = () => {
    setPdfOpen(false);
    setPdfParsed(null);
    setPdfError('');
    setPdfImporting(false);
  };

  const importLegacyPdf = async () => {
    if (!pdfParsed) return;
    // Compute snapshot from form
    const sub = pdfForm.vatMode === 'VAT-IN' ? +(pdfForm.grandTotal / 1.12).toFixed(2) : pdfForm.grandTotal;
    const v = pdfForm.vatMode === 'VAT-IN' ? +(pdfForm.grandTotal - sub).toFixed(2) : 0;
    if (!pdfForm.grandTotal || pdfForm.grandTotal <= 0) {
      setPdfError('Grand total is required and must be greater than zero.');
      return;
    }
    const dup = quotations.find((q) => q.kind === pdfForm.kind && q.revision === pdfForm.revision);
    if (dup) {
      setPdfError(`A ${pdfForm.kind} rev ${pdfForm.revision} already exists on this project. Change the revision.`);
      return;
    }
    setPdfImporting(true);
    setPdfError('');
    try {
      const snapshot = {
        generalReqtsCost: pdfForm.sectionA,
        generalReqtsWithContingency: pdfForm.sectionA,
        generalReqtsSubtotal: pdfForm.sectionA,
        componentsCost: pdfForm.sectionB,
        componentsSubtotal: pdfForm.sectionB,
        laborCost: pdfForm.sectionC,
        laborWithContingency: pdfForm.sectionC,
        servicesSubtotal: pdfForm.sectionC,
        subtotal: sub,
        discount: 0,
        vat: v,
        grandTotal: pdfForm.grandTotal,
      };
      const built: Quotation = {
        id: nanoid(8),
        projectId: project.id,
        kind: pdfForm.kind,
        revision: pdfForm.revision,
        recipientId: pdfForm.recipientId || null,
        validityDays: pdfForm.validityDays,
        paymentTerms: pdfForm.paymentTerms,
        deliveryTerms: pdfForm.deliveryTerms,
        warrantyMonths: pdfForm.warrantyMonths,
        productMarkupPct: 0,
        laborMarkupPct: 0,
        generalReqMarkupPct: 0,
        globalContingencyPct: 0,
        discountPct: 0,
        vatPct: pdfForm.vatMode === 'VAT-IN' ? 12 : 0,
        generalReqts: [],
        components: [],
        services: [],
        manpower: [],
        servicesFromManpower: true,
        preparedBy: pdfForm.preparedBy,
        authorizedBy: pdfForm.authorizedBy,
        formulaVersion: 'legacy',
        legacyTotalsSnapshot: snapshot,
        importedFrom: {
          sourceFile: pdfParsed.sourceFile,
          importedAt: new Date().toISOString(),
          originalCode: pdfParsed.refCode,
          pdfFilename: pdfParsed.sourceFile,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await importQuotation(built);
      closePdfDialog();
    } catch (err: any) {
      setPdfError(err.message || String(err));
      setPdfImporting(false);
    }
  };

  return (
    <Box
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{ position: 'relative', minHeight: '100%' }}
    >
      {dragOver && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            bgcolor: 'rgba(237, 108, 2, 0.08)',
            border: '4px dashed',
            borderColor: 'warning.main',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Paper elevation={6} sx={{ p: 4, textAlign: 'center', maxWidth: 420 }}>
            <UploadFileIcon sx={{ fontSize: 56, color: 'warning.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Drop to import as legacy</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Accepts <strong>.xlsx</strong> (full parse) or <strong>.pdf</strong> (snapshot totals).
              The file type is auto-detected.
            </Typography>
          </Paper>
        </Box>
      )}
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Stack spacing={0.5}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {project.code}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>{project.name}</Typography>
            {project.location && <Typography color="text.secondary">{project.location}</Typography>}
          </Stack>
          <IconButton size="small" onClick={openEdit} title="Edit project details" sx={{ mt: 0.5 }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Button component={Link} to="/calcsheet/projects" variant="text" size="small">← All projects</Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={4} flexWrap="wrap" alignItems="center">
          <Box>
            <Typography variant="caption" color="text.secondary">Customer</Typography>
            <Typography variant="body2">{customer?.name ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Partner</Typography>
            <Typography variant="body2">{partner?.name ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Box>
              <TextField
                select
                size="small"
                variant="standard"
                value={project.status}
                onChange={(e) => { void changeStatus(e.target.value as ProjectStatus); }}
                InputProps={{ disableUnderline: true, sx: { fontSize: '0.8125rem' } }}
                sx={{ minWidth: 80 }}
              >
                <MenuItem value="draft">draft</MenuItem>
                <MenuItem value="sent">sent</MenuItem>
                <MenuItem value="won">won</MenuItem>
                <MenuItem value="lost">lost</MenuItem>
                <MenuItem value="inactive">inactive</MenuItem>
              </TextField>
            </Box>
          </Box>
          {project.mainProjectId && (
            <Box>
              <Typography variant="caption" color="text.secondary">Project List status</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={project.mainProjectStatus || 'Not Started'}
                  color={
                    String(project.mainProjectStatus || '').toLowerCase().includes('complete') ||
                    String(project.mainProjectStatus || '').toLowerCase().includes('closed')
                      ? 'success'
                      : 'default'
                  }
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  {project.mainProjectProgressPercent ?? 0}%
                </Typography>
              </Stack>
            </Box>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">Date</Typography>
            <Box>
              <TextField
                type="date"
                size="small"
                variant="standard"
                value={project.date?.slice(0, 10) || ''}
                onChange={(e) => updateProject(project.id, { date: e.target.value })}
                InputProps={{ disableUnderline: true, sx: { fontSize: '0.8125rem' } }}
                sx={{ width: 150 }}
              />
            </Box>
          </Box>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 1 }}>
        {project.mainProjectId ? (
          <>
            <Button
              component={Link}
              to="/dashboard"
              variant="outlined"
              size="small"
              color="success"
              startIcon={<LinkIcon />}
            >
              Linked to Project List
            </Button>
            <Button
              variant="text"
              size="small"
              disabled={mainSyncBusy}
              onClick={() => { void syncToMainProject(true); }}
            >
              {mainSyncBusy ? 'Syncing...' : 'Resync'}
            </Button>
          </>
        ) : project.status === 'won' ? (
          <Button
            variant="contained"
            size="small"
            color="success"
            disabled={mainSyncBusy}
            startIcon={<LinkIcon />}
            onClick={() => { void syncToMainProject(false); }}
          >
            {mainSyncBusy ? 'Creating...' : 'Create Project List record'}
          </Button>
        ) : null}
        {mainSyncErr && (
          <Typography variant="caption" color="error.main">
            {mainSyncErr}
          </Typography>
        )}
        {mainSyncInfo && !mainSyncErr && (
          <Typography variant="caption" color="success.main">
            {mainSyncInfo}
          </Typography>
        )}
      </Stack>

      {isCorporateOneDriveConfigured() && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 1 }}>
          {!oneDriveSignedIn ? (
            <Button
              variant="outlined"
              size="small"
              color="info"
              startIcon={<CloudOffIcon />}
              onClick={() => { void oneDriveLogin(); }}
            >
              Sign in to OneDrive
            </Button>
          ) : (
            <>
              {/*
                After promotion to 'won', the proposal folder URL is updated to the
                moved folder's new URL — same as executionFolderUrl. We hide the
                "Proposal folder" button in that state since both would point to the
                same place; the "Execution folder" button is sufficient.
              */}
              {project.status !== 'won' && (
                project.proposalFolderUrl ? (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FolderIcon />}
                    endIcon={<OpenInNewIcon />}
                    onClick={() => { void openFolderOrSelfHeal('proposal'); }}
                  >
                    Proposal folder
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      color="info"
                      startIcon={<CloudIcon />}
                      disabled={oneDriveBusy === 'proposal'}
                      onClick={createProposalFolderManually}
                    >
                      {oneDriveBusy === 'proposal' ? 'Creating…' : 'Create proposal folder'}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<LinkIcon />}
                      onClick={() => openLinkDialog('proposal')}
                    >
                      Link existing
                    </Button>
                  </>
                )
              )}
              {project.status === 'won' && (
                project.executionFolderUrl ? (
                  <Button
                    variant="outlined"
                    size="small"
                    color="success"
                    startIcon={<FolderIcon />}
                    endIcon={<OpenInNewIcon />}
                    onClick={() => { void openFolderOrSelfHeal('execution'); }}
                  >
                    Execution folder
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      color="success"
                      startIcon={<CloudIcon />}
                      disabled={oneDriveBusy === 'execution'}
                      onClick={createExecutionFolderManually}
                    >
                      {oneDriveBusy === 'execution'
                        ? (project.proposalFolderId ? 'Moving…' : 'Creating…')
                        : (project.proposalFolderId ? 'Promote to execution' : 'Create execution folder')}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      color="success"
                      startIcon={<LinkIcon />}
                      onClick={() => openLinkDialog('execution')}
                    >
                      Link existing
                    </Button>
                  </>
                )
              )}
            </>
          )}
          {oneDriveErr && (
            <Typography variant="caption" color="error.main" sx={{ ml: 1 }}>
              {oneDriveErr}
            </Typography>
          )}
          {oneDriveInfo && !oneDriveErr && (
            <Typography variant="caption" color="success.main" sx={{ ml: 1 }}>
              {oneDriveInfo}
            </Typography>
          )}
        </Stack>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Quotations</Typography>
        <Stack direction="row" spacing={1}>
          {quotations.length >= 2 && (
            <Button
              component={Link}
              to={`/calcsheet/projects/${project.id}/compare`}
              variant="outlined"
              startIcon={<CompareArrowsIcon />}
              size="small"
            >
              Compare
            </Button>
          )}
          <Button
            variant={hasIoct ? 'outlined' : 'contained'}
            startIcon={<AddIcon />}
            onClick={() => startNew('IOCT')}
            size="small"
          >
            IOCT quotation
          </Button>
          <Button
            variant={hasActi ? 'outlined' : 'contained'}
            startIcon={<AddIcon />}
            onClick={() => startNew('ACTI')}
            size="small"
            color="secondary"
          >
            ACTI quotation
          </Button>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={() => legacyFileInputRef.current?.click()}
            title="Import a legacy .xlsx or .pdf into this project — or just drag-and-drop the file onto this page"
          >
            Import legacy
          </Button>
          <input
            ref={legacyFileInputRef}
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf"
            hidden
            onChange={(e) => handleLegacyFile(e.target.files?.[0] ?? null)}
          />
          {/* Hidden ref retained for compatibility — no longer wired to a button */}
          <input
            ref={legacyPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => onLegacyPdfPicked(e.target.files?.[0] ?? null)}
          />
        </Stack>
      </Stack>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Kind</TableCell>
              <TableCell>Revision</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell align="right">Subtotal</TableCell>
              <TableCell align="right">VAT</TableCell>
              <TableCell align="right">Grand Total</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotations.map((q) => {
              const t = computeTotals(q);
              const recipient = clients.find((c) => c.id === q.recipientId);
              return (
                <TableRow key={q.id} hover>
                  <TableCell>
                    <Chip size="small" label={q.kind} color={q.kind === 'IOCT' ? 'primary' : 'secondary'} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>rev {q.revision}</span>
                      {q.formulaVersion === 'legacy' && (
                        <Chip
                          size="small"
                          icon={<HistoryIcon />}
                          label="Legacy"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                      )}
                      {q.formulaVersion === 'legacy' && (() => {
                        const src = q.importedFrom?.sourceFile || '';
                        const isPdf = /\.pdf$/i.test(src);
                        const isXlsx = /\.xlsx?$/i.test(src);
                        if (!isPdf && !isXlsx) return null;
                        return (
                          <Tooltip title={src || (isPdf ? 'Imported from PDF' : 'Imported from xlsx')}>
                            <Chip
                              size="small"
                              label={isPdf ? 'PDF' : 'XLSX'}
                              variant="outlined"
                              sx={{
                                height: 20,
                                borderColor: isPdf ? 'error.light' : 'success.light',
                                color: isPdf ? 'error.main' : 'success.main',
                                '& .MuiChip-label': { fontSize: '0.65rem', fontWeight: 600 },
                              }}
                            />
                          </Tooltip>
                        );
                      })()}
                    </Stack>
                  </TableCell>
                  <TableCell>{recipient?.name ?? '—'}</TableCell>
                  <TableCell align="right">{PHP(t.subtotal)}</TableCell>
                  <TableCell align="right">{PHP(t.vat)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{PHP(t.grandTotal)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" component={Link} to={`/calcsheet/quotations/${q.id}`}><OpenInNewIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => duplicateQuotation(q.id)} title="Duplicate as new revision"><ContentCopyIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(q)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {quotations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  No quotations yet. Create an IOCT or ACTI quotation to begin.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit project details</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Project code"
              value={editForm.code}
              onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <TextField
              label="Project name"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Location"
              value={editForm.location}
              onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              select
              label="Customer"
              value={editForm.customerId}
              onChange={(e) => setEditForm((f) => ({ ...f, customerId: e.target.value }))}
              fullWidth
              size="small"
            >
              <MenuItem value="">— none —</MenuItem>
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Partner"
              value={editForm.partnerId}
              onChange={(e) => setEditForm((f) => ({ ...f, partnerId: e.target.value }))}
              fullWidth
              size="small"
            >
              <MenuItem value="">— none —</MenuItem>
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={!editForm.name.trim() || !editForm.code.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={legacyOpen} onClose={closeLegacyDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryIcon color="warning" />
            <span>Import legacy quotation into this project</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {legacyImporting && <LinearProgress sx={{ mb: 2 }} />}
          {legacyError && <Alert severity="error" sx={{ mb: 2 }}>{legacyError}</Alert>}
          {!legacyParsed && !legacyError && (
            <Typography variant="body2" color="text.secondary">Parsing…</Typography>
          )}
          {legacyParsed && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">Source file</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {legacySource}
                </Typography>
              </Box>
              <Stack direction="row" spacing={3}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Original code</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{legacyParsed.originalCode || '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Workbook customer</Typography>
                  <Typography variant="body2">
                    {legacyParsed.customer.name || '—'}
                    {legacyParsed.customer.code && (
                      <Chip size="small" label={legacyParsed.customer.code} sx={{ ml: 0.75, height: 18 }} />
                    )}
                  </Typography>
                </Box>
              </Stack>

              {legacyParsed.warnings.length > 0 && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  <Stack spacing={0.25}>
                    {legacyParsed.warnings.map((w, i) => (
                      <Typography key={i} variant="caption">{w}</Typography>
                    ))}
                  </Stack>
                </Alert>
              )}

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Quotations found</Typography>
                <Stack spacing={1.5}>
                  {(['IOCT', 'ACTI'] as QuotationKind[]).map((k) => {
                    const pq = legacyParsed.quotations.find((q) => q.kind === k);
                    if (!pq) return (
                      <Paper key={k} variant="outlined" sx={{ p: 1.25, opacity: 0.6 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={k} variant="outlined" />
                          <Typography variant="caption" color="text.secondary">
                            not present in this workbook
                          </Typography>
                        </Stack>
                      </Paper>
                    );
                    const dupExists = quotations.some(
                      (q) => q.kind === k && q.revision === legacyRevisions[k],
                    );
                    const includeVat = legacyIncludeVat[k];
                    const snap = pq.legacyTotalsSnapshot;
                    const grandIncl = snap.grandTotal;
                    const grandExcl = Math.max(0, snap.subtotal - snap.discount);
                    const hasVatInWorkbook = (snap.vat || 0) > 0;
                    const liveTotal = includeVat ? grandIncl : grandExcl;
                    return (
                      <Paper key={k} variant="outlined" sx={{ p: 1.25 }}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Checkbox
                              size="small"
                              checked={legacySelect[k]}
                              onChange={(e) => setLegacySelect((s) => ({ ...s, [k]: e.target.checked }))}
                              sx={{ p: 0.5 }}
                            />
                            <Chip
                              size="small"
                              label={k}
                              color={k === 'IOCT' ? 'primary' : 'secondary'}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                              {pq.components.length} component(s) · {pq.services.length} service(s) · {pq.generalReqts.length} gen-reqt(s)
                            </Typography>
                            <Stack alignItems="flex-end" spacing={0}>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                {PHP(liveTotal)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                {includeVat ? 'VAT-IN' : 'VAT-EX'}
                              </Typography>
                            </Stack>
                          </Stack>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <TextField
                              label="Revision"
                              size="small"
                              value={legacyRevisions[k]}
                              onChange={(e) => setLegacyRevisions((r) => ({ ...r, [k]: e.target.value.padStart(2, '0').slice(0, 2) }))}
                              disabled={!legacySelect[k]}
                              error={legacySelect[k] && dupExists}
                              helperText={legacySelect[k] && dupExists ? 'Already exists' : ' '}
                              sx={{ width: 110 }}
                              inputProps={{ style: { fontFamily: 'monospace' } }}
                            />
                            <TextField
                              select
                              label="Recipient"
                              size="small"
                              value={legacyRecipient[k]}
                              onChange={(e) => setLegacyRecipient((r) => ({ ...r, [k]: e.target.value }))}
                              disabled={!legacySelect[k]}
                              sx={{ flex: 1 }}
                            >
                              <MenuItem value="">— none —</MenuItem>
                              {clients.map((c) => (
                                <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
                              ))}
                            </TextField>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 0.5 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={includeVat}
                                  onChange={(e) => setLegacyIncludeVat((v) => ({ ...v, [k]: e.target.checked }))}
                                  disabled={!legacySelect[k] || !hasVatInWorkbook}
                                />
                              }
                              label={
                                <Typography variant="caption">
                                  Include VAT
                                </Typography>
                              }
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                              {hasVatInWorkbook
                                ? `VAT-EX ${PHP(grandExcl)} · VAT ${PHP(snap.vat)} · VAT-IN ${PHP(grandIncl)}`
                                : 'workbook has no VAT line — already VAT-EX'}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Imported quotations are tagged <strong>legacy</strong> with frozen totals snapshot.
                Duplicate one later to create an editable revision under the current formulation.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeLegacyDialog} disabled={legacyImporting}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={importLegacySelected}
            disabled={legacyImporting || !legacyParsed || (!legacySelect.IOCT && !legacySelect.ACTI)}
          >
            Import selected
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pdfOpen} onClose={closePdfDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryIcon color="warning" />
            <span>Import legacy quotation from PDF</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {pdfParsing && <LinearProgress sx={{ mb: 2 }} />}
          {pdfError && <Alert severity="error" sx={{ mb: 2 }}>{pdfError}</Alert>}
          {!pdfParsed && !pdfParsing && !pdfError && (
            <Typography variant="body2" color="text.secondary">Pick a PDF…</Typography>
          )}
          {pdfParsed && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">Source PDF</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {pdfParsed.sourceFile}
                </Typography>
              </Box>

              {pdfParsed.warnings.length > 0 && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  <Stack spacing={0.25}>
                    {pdfParsed.warnings.map((w, i) => (
                      <Typography key={i} variant="caption">{w}</Typography>
                    ))}
                  </Stack>
                </Alert>
              )}

              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Kind"
                  size="small"
                  value={pdfForm.kind}
                  onChange={(e) => setPdfForm((f) => ({
                    ...f,
                    kind: e.target.value as QuotationKind,
                    revision: nextRevisionFor(e.target.value as QuotationKind, f.revision),
                  }))}
                  sx={{ width: 100 }}
                >
                  <MenuItem value="IOCT">IOCT</MenuItem>
                  <MenuItem value="ACTI">ACTI</MenuItem>
                </TextField>
                <TextField
                  label="Revision"
                  size="small"
                  value={pdfForm.revision}
                  onChange={(e) => setPdfForm((f) => ({ ...f, revision: e.target.value.padStart(2, '0').slice(0, 2) }))}
                  sx={{ width: 90 }}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
                <TextField
                  label="Original code"
                  size="small"
                  value={pdfParsed.refCode}
                  InputProps={{ readOnly: true }}
                  sx={{ flex: 1 }}
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                />
              </Stack>

              <TextField
                select
                label="Recipient"
                size="small"
                value={pdfForm.recipientId}
                onChange={(e) => setPdfForm((f) => ({ ...f, recipientId: e.target.value }))}
                fullWidth
                helperText={pdfParsed.recipientName ? `Detected: ${pdfParsed.recipientName}` : ' '}
              >
                <MenuItem value="">— none —</MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
                ))}
              </TextField>

              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Date"
                  type="date"
                  size="small"
                  value={pdfForm.date}
                  onChange={(e) => setPdfForm((f) => ({ ...f, date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Validity (days)"
                  type="number"
                  size="small"
                  value={pdfForm.validityDays}
                  onChange={(e) => setPdfForm((f) => ({ ...f, validityDays: parseInt(e.target.value, 10) || 30 }))}
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Warranty (mos)"
                  type="number"
                  size="small"
                  value={pdfForm.warrantyMonths}
                  onChange={(e) => setPdfForm((f) => ({ ...f, warrantyMonths: parseInt(e.target.value, 10) || 12 }))}
                  sx={{ width: 120 }}
                />
              </Stack>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Snapshot totals</Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <TextField
                    label="A. General Reqts"
                    type="number"
                    size="small"
                    value={pdfForm.sectionA}
                    onChange={(e) => setPdfForm((f) => ({ ...f, sectionA: parseFloat(e.target.value) || 0 }))}
                    sx={{ width: 160 }}
                  />
                  <TextField
                    label="B. Components"
                    type="number"
                    size="small"
                    value={pdfForm.sectionB}
                    onChange={(e) => setPdfForm((f) => ({ ...f, sectionB: parseFloat(e.target.value) || 0 }))}
                    sx={{ width: 160 }}
                  />
                  <TextField
                    label="C. Eng. Services"
                    type="number"
                    size="small"
                    value={pdfForm.sectionC}
                    onChange={(e) => setPdfForm((f) => ({ ...f, sectionC: parseFloat(e.target.value) || 0 }))}
                    sx={{ width: 160 }}
                  />
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                  <TextField
                    select
                    label="VAT mode"
                    size="small"
                    value={pdfForm.vatMode}
                    onChange={(e) => setPdfForm((f) => ({ ...f, vatMode: e.target.value as 'VAT-EX' | 'VAT-IN' }))}
                    sx={{ width: 140 }}
                  >
                    <MenuItem value="VAT-EX">VAT-EX (0%)</MenuItem>
                    <MenuItem value="VAT-IN">VAT-IN (12%)</MenuItem>
                  </TextField>
                  <TextField
                    label="Grand Total (PHP)"
                    type="number"
                    size="small"
                    value={pdfForm.grandTotal}
                    onChange={(e) => setPdfForm((f) => ({ ...f, grandTotal: parseFloat(e.target.value) || 0 }))}
                    sx={{ flex: 1, '& input': { fontWeight: 600 } }}
                  />
                </Stack>
                {(() => {
                  const summed = pdfForm.sectionA + pdfForm.sectionB + pdfForm.sectionC;
                  const expected = pdfForm.vatMode === 'VAT-IN'
                    ? +(pdfForm.grandTotal / 1.12).toFixed(2)
                    : pdfForm.grandTotal;
                  const drift = Math.abs(summed - expected);
                  if (summed > 0 && drift > 1) {
                    return (
                      <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                        Section subtotals sum to {PHP(summed)} but grand total {pdfForm.vatMode} expects {PHP(expected)} (drift {PHP(drift)})
                      </Typography>
                    );
                  }
                  return null;
                })()}
              </Box>

              <TextField
                label="Payment terms"
                size="small"
                value={pdfForm.paymentTerms}
                onChange={(e) => setPdfForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                fullWidth
                multiline
                minRows={1}
                maxRows={3}
              />
              <TextField
                label="Delivery terms"
                size="small"
                value={pdfForm.deliveryTerms}
                onChange={(e) => setPdfForm((f) => ({ ...f, deliveryTerms: e.target.value }))}
                fullWidth
                multiline
                minRows={1}
                maxRows={3}
              />

              <Typography variant="caption" color="text.secondary">
                PDF imports record only the snapshot totals (no line items — the original PDF is your line-item reference).
                Quotation is tagged <strong>legacy</strong>; duplicate to revise under the current formulation.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePdfDialog} disabled={pdfImporting}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={importLegacyPdf}
            disabled={pdfImporting || pdfParsing || !pdfParsed || !pdfForm.grandTotal}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New {kind} quotation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} fullWidth>
              <MenuItem value="">— none —</MenuItem>
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              {kind === 'IOCT'
                ? 'IOCT issues this quotation to the recipient — typically the partner (ACTI) when subcontracted, or the end customer when direct.'
                : 'ACTI issues this quotation to the end customer — typically includes hardware and IOCT services with ACTI margin.'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={create}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={statusConfirmOpen} onClose={() => setStatusConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark proposal as won?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              This can create or link a record in the original Project List module using the latest IOCT quotation amount. If no IOCT quotation exists, ACTI is used as the fallback.
            </Typography>
            <Alert severity="info" variant="outlined">
              Changing the status back later will not delete the Project List record. You can unlink or edit it separately.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusConfirmOpen(false)}>Cancel</Button>
          <Button onClick={() => { void confirmWon(false); }}>Mark Won Only</Button>
          <Button variant="contained" color="success" onClick={() => { void confirmWon(true); }}>
            Mark Won and Create Project
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete quotation?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Permanently delete the <strong>{deleteTarget?.kind} rev {deleteTarget?.revision}</strong> quotation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (deleteTarget) { deleteQuotation(deleteTarget.id); setDeleteTarget(null); }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Link existing OneDrive folder dialog */}
      <Dialog open={!!linkDialogOpen} onClose={() => !linkBusy && setLinkDialogOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Link existing {linkDialogOpen} folder
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Suggested folders — auto-scanned by PCS code prefix */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {project ? (
                  <>Suggested folders in <code>{linkDialogOpen === 'proposal' ? onedriveConfig.proposalRoot : onedriveConfig.executionRoot}</code> starting with <code>{projectCodePrefix(project)}</code>:</>
                ) : 'Suggested folders:'}
              </Typography>
              {linkSuggestionsLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <LinearProgress sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">Scanning…</Typography>
                </Box>
              ) : linkSuggestions.length === 0 ? (
                <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                  No folders found with this project&apos;s PCS code prefix. Paste a URL below to link manually.
                </Alert>
              ) : (
                <Stack spacing={0.5}>
                  {linkSuggestions.map((s) => (
                    <Paper
                      key={s.id}
                      variant="outlined"
                      sx={{
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        cursor: linkBusy ? 'wait' : 'pointer',
                        '&:hover': { bgcolor: linkBusy ? undefined : 'action.hover' },
                      }}
                      onClick={() => !linkBusy && linkToSuggestion(s)}
                    >
                      <FolderIcon fontSize="small" color="action" />
                      <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-word' }}>
                        {s.name}
                      </Typography>
                      <Button size="small" variant="contained" disabled={linkBusy}>
                        Link this
                      </Button>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider>or paste a URL</Divider>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                For folders that don&apos;t match the PCS code prefix, paste the OneDrive URL (long Documents path or short share link).
              </Typography>
              <TextField
                fullWidth
                size="small"
                label="OneDrive folder URL"
                placeholder="https://iocontroltech-my.sharepoint.com/..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                disabled={linkBusy}
                error={!!linkErr}
                helperText={linkErr || ' '}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(null)} disabled={linkBusy}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitLinkDialog}
            disabled={linkBusy || !linkUrl.trim()}
          >
            {linkBusy ? 'Linking…' : 'Link from URL'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
    </Box>
  );
}
