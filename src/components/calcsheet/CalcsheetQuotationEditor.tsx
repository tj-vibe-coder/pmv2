import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, AlertTitle, Autocomplete, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, ListSubheader, MenuItem, Paper,
  Snackbar, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import GridOnIcon from '@mui/icons-material/GridOn';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { format } from 'date-fns';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import { useQuotationStore } from '../../store/quotationStore';
import {
  PHP, computeTotals, componentLineTotal,
  componentSellingUnit, lineGeneralTotal, manpowerCost, manpowerTotalCost,
} from '../../utils/calcsheet/calc';
import type {
  ComponentLine, GeneralReqLine, ManpowerEntry, Quotation, QuotationVersion, SalesContact, ServiceLine,
} from '../../types/Quotation';
import { EditableTable } from './EditableTable';
import type { Column } from './EditableTable';
import { exportQuotationPdf } from '../../utils/calcsheet/pdfExport';
import { exportQuotationXlsx } from '../../utils/calcsheet/xlsxExport';
import { useOneDriveAuth } from '../../contexts/OneDriveAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { isCorporateOneDriveConfigured } from '../../config/onedriveConfig';
import { resolveCorporateDriveId, uploadFileToFolderById } from '../../services/onedriveFolderService';

const id = () => nanoid(6);

const PAYMENT_TERM_OPTIONS = [
  '30% Downpayment, 70% Progress Billing',
  '30% Downpayment, 60% Progress Billing, 10% Retention',
  '20% Downpayment, 80% Progress Billing',
  '20% Downpayment, 70% Progress Billing, 10% Retention',
  '50% Downpayment, 50% Progress Billing',
  '50% Downpayment, 50% Upon Completion',
  '100% Upon Completion',
  // "Pay-when-paid" — IOCT/ACTI invoice the customer in lockstep with the
  // end-user paying them. Common in subcontracted automation work where the
  // customer is themselves billing a downstream owner.
  'Back-to-back with end-user payment terms',
];
const CUSTOM_PAYMENT = '__custom__';
const todayDateOnly = () => format(new Date(), 'yyyy-MM-dd');

const normalizeName = (value: string | undefined | null) => (value || '').trim().toLowerCase();
const firstLastKey = (value: string | undefined | null) => {
  const parts = normalizeName(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

// Number input that doesn't force a leading 0 — empty when value is 0, select-all on focus.
function NumField({
  label, value, onChange, integer = false, sx, helperText, disabled,
}: { label: string; value: number; onChange: (v: number) => void; integer?: boolean; sx?: any; helperText?: string; disabled?: boolean }) {
  return (
    <TextField
      label={label}
      size="small"
      type="number"
      value={value === 0 ? '' : String(value)}
      placeholder="0"
      onChange={(e) => onChange((integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value)) || 0)}
      onFocus={(e) => e.target.select()}
      disabled={disabled}
      sx={sx}
      helperText={helperText}
    />
  );
}

interface BreakdownProps {
  label: string;
  color: 'primary' | 'secondary';
  cost: number;
  contingency: number | null;
  contingencyPct: number | null;
  markup: number;
  markupPct: number;
  subtotal: number;
}

function BreakdownCard({ label, color, cost, contingency, contingencyPct, markup, markupPct, subtotal }: BreakdownProps) {
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="caption" sx={{ color: `${color}.main`, fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 0.5, mt: 1, fontSize: '0.75rem' }}>
        <Typography variant="caption" color="text.secondary">Cost</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(cost)}</Typography>
        {contingency !== null && contingencyPct !== null && (
          <>
            <Typography variant="caption" color="text.secondary">+ Contingency ({contingencyPct}%)</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(contingency)}</Typography>
          </>
        )}
        <Typography variant="caption" color="text.secondary">+ Markup ({markupPct}%)</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(markup)}</Typography>
        <Divider sx={{ gridColumn: 'span 2', my: 0.25 }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Subtotal</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', textAlign: 'right', fontWeight: 600 }}>{PHP(subtotal)}</Typography>
      </Box>
    </Box>
  );
}

export default function QuotationEditor() {
  const { id: qid = '' } = useParams();
  const navigate = useNavigate();
  // `saved` is the persisted version from the store. `draft` is the in-progress
  // edit state that's only pushed to the server when the user clicks Save.
  // Every keystroke used to fire a PUT; now edits accumulate locally first.
  const saved = useQuotationStore((s) => s.quotations.find((q) => q.id === qid));
  const project = useQuotationStore((s) => saved ? s.projects.find((p) => p.id === saved.projectId) : undefined);
  const clients = useQuotationStore((s) => s.clients);
  const salesContacts = useQuotationStore((s) => s.salesContacts);
  const presets = useQuotationStore((s) => s.laborPresets);
  const update = useQuotationStore((s) => s.updateQuotation);
  const duplicateQuotation = useQuotationStore((s) => s.duplicateQuotation);
  const fetchQuotationVersions = useQuotationStore((s) => s.fetchQuotationVersions);

  const [draft, setDraft] = useState<Quotation | undefined>(saved);

  // Re-init the draft when the URL points at a different quotation OR when the
  // saved record changes via some path we don't control (e.g. another browser
  // tab saving). Compare by id and updatedAt so we don't clobber the in-flight
  // draft while the user is editing the same quotation.
  useEffect(() => {
    if (!saved) return;
    if (!draft || draft.id !== saved.id) {
      setDraft(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id]);

  const totals = useMemo(() => draft ? computeTotals(draft) : null, [draft]);

  // Margin summary: separates true markup (= profit on a clean run) from the
  // contingency reserve (= buffer for overruns; not earned profit). Total
  // margin excludes contingency — contingency is reported as a separate line
  // so the user can see the cushion without conflating it with earnings.
  //
  // Stack on the selling-price side (subtotal): cost -> +contingency -> +markup.
  // markupOnly per category = subtotal − withContingency.
  // Services bypass cost/contingency entirely when entered as flat amounts
  // (servicesFromManpower=false) — in that case there's no markup either.
  const marginSummary = useMemo(() => {
    if (!draft || !totals) return null;
    const servicesFromMP = !!draft.servicesFromManpower;
    const componentsWithContingency = totals.componentsWithContingency ?? totals.componentsCost;
    const markupOnly =
      (totals.generalReqtsSubtotal - totals.generalReqtsWithContingency) +
      (totals.componentsSubtotal - componentsWithContingency) +
      (servicesFromMP
        ? totals.servicesSubtotal - totals.laborWithContingency
        : 0);
    const contingency =
      (totals.generalReqtsWithContingency - totals.generalReqtsCost) +
      (componentsWithContingency - totals.componentsCost) +
      (servicesFromMP ? totals.laborWithContingency - totals.laborCost : 0);
    const subtotal =
      totals.generalReqtsSubtotal +
      totals.componentsSubtotal +
      totals.servicesSubtotal;
    const pct = subtotal > 0 ? (markupOnly / subtotal) * 100 : 0;
    const contingencyPct = subtotal > 0 ? (contingency / subtotal) * 100 : 0;
    return { value: markupOnly, subtotal, pct, contingency, contingencyPct };
  }, [draft, totals]);

  const isDirty = useMemo(() => {
    if (!draft || !saved) return false;
    if (draft.id !== saved.id) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);

  // Warn the user before closing/reloading the tab if there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const [saving, setSaving] = useState(false);

  // Saved-version history (snapshots captured server-side on every save).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [versions, setVersions] = useState<QuotationVersion[]>([]);

  // OneDrive auto-upload on export. Hooks must be declared unconditionally —
  // keep these above the early-return guard below.
  const { isAuthenticated: oneDriveSignedIn, getAccessToken: getOneDriveToken } = useOneDriveAuth();
  const { user: currentUser } = useAuth();
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'warning' | 'info' } | null>(null);
  const effectiveSalesContacts = useMemo<SalesContact[]>(() => {
    const userName = (currentUser?.full_name?.trim() || currentUser?.username || currentUser?.email || '').trim();
    const userPosition = (currentUser?.designation || '').trim();
    if (!userName && !userPosition) return salesContacts;
    const userEmail = (currentUser?.email || '').trim();
    const userNameKey = normalizeName(userName);
    const userFirstLast = firstLastKey(userName);
    const currentUserContact: SalesContact = {
      id: String(currentUser?.id || 'current-user'),
      name: userName,
      position: userPosition,
      email: userEmail,
      phone: (currentUser?.contact_number || '').trim(),
    };
    const merged = salesContacts.map((contact) => {
      const contactNameKey = normalizeName(contact.name);
      const contactFirstLast = firstLastKey(contact.name);
      const isCurrentUser =
        (!!userNameKey && contactNameKey === userNameKey) ||
        (!!userFirstLast && contactFirstLast === userFirstLast) ||
        (!!userEmail && normalizeName(contact.email) === normalizeName(userEmail));
      return isCurrentUser
        ? { ...contact, position: userPosition || contact.position, email: userEmail || contact.email }
        : contact;
    });
    const alreadyListed = merged.some((contact) => {
      const contactNameKey = normalizeName(contact.name);
      const contactFirstLast = firstLastKey(contact.name);
      return (
        (!!userNameKey && contactNameKey === userNameKey) ||
        (!!userFirstLast && contactFirstLast === userFirstLast) ||
        (!!userEmail && normalizeName(contact.email) === normalizeName(userEmail))
      );
    });
    return alreadyListed || !userName ? merged : [currentUserContact, ...merged];
  }, [currentUser?.contact_number, currentUser?.designation, currentUser?.email, currentUser?.full_name, currentUser?.id, currentUser?.username, salesContacts]);

  if (!saved || !draft || !project || !totals) {
    return <Typography>Quotation not found. <Link to="/sales/calcsheet/projects">Back</Link></Typography>;
  }
  // Alias for downstream code that previously referenced `quotation` directly.
  // All field/row operations below mutate `draft` (via setDraft); reads see the
  // live draft so totals/labels update immediately as the user types.
  const quotation = draft;
  const recipient = clients.find((c) => c.id === quotation.recipientId);
  const customer = clients.find((c) => c.id === project.customerId);
  const issuer = quotation.kind;
  const isLegacy = quotation.formulaVersion === 'legacy';

  const setField = <K extends keyof Quotation>(k: K, v: any) => {
    if (isLegacy) return;
    setDraft((d) => d ? ({ ...d, [k]: v } as Quotation) : d);
  };

  const setTermsOverride = (key: keyof NonNullable<Quotation['termsOverrides']>, value: string) => {
    if (isLegacy) return;
    setDraft((d) => {
      if (!d) return d;
      const existing = d.termsOverrides ?? {};
      const updated = { ...existing, [key]: value || undefined };
      return { ...d, termsOverrides: updated };
    });
  };

  const setProductContingency = (value: number) => {
    if (isLegacy) return;
    setDraft((d) => {
      if (!d) return d;
      const previous = d.productContingencyPct ?? 0;
      const components = d.components.map((line) => {
        const isOverridden = !!line.contingencyPctOverridden || (line.contingencyPct ?? 0) !== previous;
        return isOverridden
          ? { ...line, contingencyPctOverridden: true }
          : { ...line, contingencyPct: value, contingencyPctOverridden: false };
      });
      return { ...d, productContingencyPct: value, components };
    });
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      // Send the full draft as the patch — the store's updateQuotation handles
      // PUT to the server and updates local state on success.
      const savedQuotation = await update(quotation.id, draft);
      setDraft(savedQuotation);
      setToast({ msg: 'Saved', sev: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: `Save failed: ${msg}`, sev: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!saved) return;
    setDraft(saved);
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setVersions(await fetchQuotationVersions(quotation.id));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreVersion = (v: QuotationVersion) => {
    if (isDirty) {
      const proceed = window.confirm(
        'Restoring this version will replace your unsaved draft edits.\n\nContinue?'
      );
      if (!proceed) return;
    }
    // Load the snapshot into the draft, keeping the live identity fields. The
    // user reviews the restored state and clicks Save to make it permanent
    // (which itself snapshots the current state — nothing is ever lost).
    setDraft({ ...v.data, id: quotation.id, projectId: quotation.projectId });
    setHistoryOpen(false);
    setToast({ msg: 'Version loaded into the editor — review and click Save to keep it', sev: 'info' });
  };

  const handleDuplicateToRevise = async () => {
    if (isDirty) {
      const proceed = window.confirm(
        'You have unsaved changes. Duplicating now uses the last saved version — your draft edits will be lost.\n\nDuplicate anyway?'
      );
      if (!proceed) return;
    }
    const copy = await duplicateQuotation(quotation.id);
    if (copy) navigate(`/sales/calcsheet/quotations/${copy.id}`);
  };

  // Section A — General Requirements
  const addGeneral = () =>
    commit('generalReqts', [
      ...quotation.generalReqts,
      { id: id(), code: '', description: '', unitPrice: 0, qty: 1, uom: 'lot' },
    ] as GeneralReqLine[]);

  const generalCols: Column<GeneralReqLine>[] = [
    { key: 'code', label: 'Code', width: 90, mono: true },
    { key: 'description', label: 'Description' },
    { key: 'qty', label: 'Qty', width: 70, type: 'number', align: 'right' },
    { key: 'uom', label: 'UOM', width: 70 },
    { key: 'unitPrice', label: 'Unit Price', width: 120, type: 'number', align: 'right', step: 0.01 },
    { key: 'total', label: 'Total', width: 130, align: 'right',
      render: (r) => <Box sx={{ fontFamily: 'monospace' }}>{PHP(lineGeneralTotal(r))}</Box> },
  ];

  // Section B — Components
  const addComponent = () =>
    commit('components', [
      ...quotation.components,
      { id: id(), code: '', description: '', brand: '', partNo: '',
        qty: 1, uom: 'pc', unitCost: 0, forex: 1, contingencyPct: quotation.productContingencyPct ?? 0, contingencyPctOverridden: false, discountPct: 0 },
    ] as ComponentLine[]);

  const compCols: Column<ComponentLine>[] = [
    { key: 'code', label: 'Code', width: 90, mono: true },
    { key: 'description', label: 'Description' },
    { key: 'brand', label: 'Brand', width: 90 },
    { key: 'partNo', label: 'Part No.', width: 100 },
    { key: 'qty', label: 'Qty', width: 60, type: 'number', align: 'right' },
    { key: 'uom', label: 'UOM', width: 60 },
    { key: 'unitCost', label: 'Unit Cost', width: 110, type: 'number', align: 'right', step: 0.01 },
    { key: 'forex', label: 'FX', width: 60, type: 'number', align: 'right', step: 0.0001 },
    { key: 'contingencyPct', label: 'Cont %', width: 80, type: 'number', align: 'right', step: 0.01 },
    { key: 'sellPrice', label: 'Selling/u', width: 110, align: 'right',
      render: (r) => <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{PHP(componentSellingUnit(r, quotation.productMarkupPct))}</Box> },
    { key: 'total', label: 'Total', width: 130, align: 'right',
      render: (r) => <Box sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{PHP(componentLineTotal(r, quotation.productMarkupPct))}</Box> },
  ];

  // Section C — Services
  const addService = () =>
    commit('services', [
      ...quotation.services,
      { id: id(), code: '', description: '', amount: 0 },
    ] as ServiceLine[]);

  const svcCols: Column<ServiceLine>[] = [
    { key: 'code', label: 'Code', width: 90, mono: true },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount', width: 150, type: 'number', align: 'right', step: 0.01 },
  ];

  const addManpower = () =>
    setField('manpower', [
      ...quotation.manpower,
      { id: id(), role: '', group: 'engineering', headcount: 1, mandays: 0, dailyRate: 0, allowance: 0, presetId: null },
    ] as ManpowerEntry[]);

  const applyPreset = (idx: number, presetId: string) => {
    const list = [...quotation.manpower];
    if (presetId === '__custom__') {
      list[idx] = { ...list[idx], presetId: null };
    } else {
      const p = presets.find((x) => x.id === presetId);
      if (!p) return;
      list[idx] = {
        ...list[idx],
        presetId: p.id,
        role: p.role,
        group: p.group,
        dailyRate: p.dailyRate,
        allowance: p.allowance,
      };
    }
    setField('manpower', list);
  };

  const engineeringPresets = presets.filter((p) => p.group === 'engineering');
  const laborPresets = presets.filter((p) => p.group === 'labor');

  const mpCols: Column<ManpowerEntry>[] = [
    { key: 'role', label: 'Role', width: 240,
      render: (r, idx) => {
        const isCustom = !r.presetId;
        return (
          <Stack direction="column" spacing={0.5} sx={{ py: 0.5 }}>
            <TextField
              select
              value={r.presetId ?? '__custom__'}
              onChange={(e) => applyPreset(idx, e.target.value)}
              variant="standard"
              InputProps={{ disableUnderline: true, sx: { fontSize: '0.8125rem', fontWeight: 500 } }}
              fullWidth
            >
              <ListSubheader>Engineering / Automation</ListSubheader>
              {engineeringPresets.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.role}</MenuItem>
              ))}
              <ListSubheader>Laborers</ListSubheader>
              {laborPresets.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.role}</MenuItem>
              ))}
              <Divider />
              <MenuItem value="__custom__">— Custom… —</MenuItem>
            </TextField>
            {isCustom && (
              <TextField
                value={r.role}
                onChange={(e) => updateRow('manpower', idx, 'role', e.target.value)}
                placeholder="Custom role name"
                variant="standard"
                InputProps={{ disableUnderline: true, sx: { fontSize: '0.75rem', color: 'text.secondary', fontStyle: 'italic' } }}
                fullWidth
              />
            )}
          </Stack>
        );
      },
    },
    { key: 'group', label: 'Group', width: 110,
      render: (r, idx) => (
        <TextField select value={r.group} onChange={(e) => updateRow('manpower', idx, 'group', e.target.value)} variant="standard" InputProps={{ disableUnderline: true, sx: { fontSize: '0.75rem' } }} fullWidth disabled={!!r.presetId}>
          <MenuItem value="engineering">Engineering</MenuItem>
          <MenuItem value="labor">Labor</MenuItem>
        </TextField>
      ) },
    { key: 'headcount', label: 'Pax', width: 60, type: 'number', align: 'right' },
    { key: 'mandays', label: 'Mandays', width: 80, type: 'number', align: 'right' },
    { key: 'dailyRate', label: 'Daily Rate', width: 110, type: 'number', align: 'right', step: 0.01 },
    { key: 'allowance', label: 'Allowance', width: 100, type: 'number', align: 'right', step: 0.01 },
    { key: 'cost', label: 'Cost', width: 130, align: 'right',
      render: (r) => <Box sx={{ fontFamily: 'monospace' }}>{PHP(manpowerCost(r))}</Box> },
  ];

  type Section = 'generalReqts' | 'components' | 'services' | 'manpower';
  const codePrefixOf = (s: Section): 'A' | 'B' | 'C' | null =>
    s === 'generalReqts' ? 'A' : s === 'components' ? 'B' : s === 'services' ? 'C' : null;

  const renumber = <T extends { code?: string }>(rows: T[], prefix: 'A' | 'B' | 'C'): T[] =>
    rows.map((r, i) => ({ ...r, code: `${prefix}-${String((i + 1) * 10).padStart(4, '0')}` }));

  const commit = (section: Section, list: any[]) => {
    const prefix = codePrefixOf(section);
    setField(section, prefix ? renumber(list, prefix) : list);
  };

  const updateRow = (section: Section, idx: number, key: any, value: any) => {
    const list = [...(quotation as any)[section]];
    list[idx] = {
      ...list[idx],
      [key]: value,
      ...(section === 'components' && key === 'contingencyPct' ? { contingencyPctOverridden: true } : {}),
    };
    // Don't renumber on field edits — only on structural changes (add/delete/reorder)
    setField(section, list);
  };
  const deleteRow = (section: Section, idx: number) => {
    const list = [...(quotation as any)[section]];
    list.splice(idx, 1);
    commit(section, list);
  };
  const reorderRows = (section: Section, newRows: any[]) => {
    commit(section, newRows);
  };

  const isCustomPayment = !PAYMENT_TERM_OPTIONS.includes(quotation.paymentTerms);
  const generalReqtsExportQty = Math.max(1, quotation.generalReqtsExportQty || 1);
  const generalReqtsExportUnitPrice = totals.generalReqtsSubtotal / generalReqtsExportQty;
  const engineeringServicesQty = Math.max(1, quotation.engineeringServicesQty || 1);
  const engineeringServicesUnitPrice = totals.servicesSubtotal / engineeringServicesQty;

  // OneDrive auto-upload on export. The PDF is always saved locally first;
  // upload to the project's OneDrive folder is best-effort (gated on:
  // corporate config present + signed in + project has a folder linked).
  // (Hook declarations live higher up to satisfy rules-of-hooks ordering.)

  const exportPdf = async () => {
    try {
      const { blob, filename } = await exportQuotationPdf(
        quotation, project, recipient ?? null, customer ?? null, effectiveSalesContacts,
      );

      // Use whichever folder is current. After promotion to 'won', the move
      // preserves the drive item id; either field references the same physical
      // folder. Prefer executionFolderId when the project is won, else proposal.
      const folderId = (project.status === 'won' && project.executionFolderId)
        ? project.executionFolderId
        : project.proposalFolderId;

      if (!isCorporateOneDriveConfigured() || !oneDriveSignedIn || !folderId) {
        setToast({ msg: `Saved ${filename}`, sev: 'info' });
        return;
      }

      // Fire upload; show success/failure toast but never block the local save.
      setToast({ msg: `Saved ${filename} · uploading to OneDrive…`, sev: 'info' });
      try {
        const token = await getOneDriveToken();
        if (!token) {
          setToast({ msg: `Saved ${filename} · OneDrive upload skipped (no token)`, sev: 'warning' });
          return;
        }
        const driveId = await resolveCorporateDriveId(token);
        await uploadFileToFolderById(token, driveId, folderId, filename, blob);
        setToast({ msg: `Saved ${filename} · uploaded to OneDrive ✓`, sev: 'success' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ msg: `Saved ${filename} · OneDrive upload failed: ${msg}`, sev: 'warning' });
        // eslint-disable-next-line no-console
        console.warn('[OneDrive] PDF upload failed (non-blocking)', err);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: `Export failed: ${msg}`, sev: 'warning' });
    }
  };

  const exportXlsx = () => exportQuotationXlsx(quotation, project, recipient ?? null, customer ?? null);

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={`${issuer} → ${recipient?.code ?? '?'}`} color={issuer === 'IOCT' ? 'primary' : 'secondary'} />
            {isLegacy && (
              <Chip
                size="small"
                icon={<HistoryIcon />}
                label="Legacy"
                color="warning"
                variant="outlined"
              />
            )}
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {project.code}-{quotation.revision}
            </Typography>
          </Stack>
          <Typography variant="h5">{project.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Recipient: {recipient?.name ?? '— not set —'}
          </Typography>
          {isDirty && !isLegacy && (
            <Chip
              size="small"
              label="Unsaved changes"
              color="warning"
              variant="outlined"
              sx={{ alignSelf: 'flex-start', mt: 0.5 }}
            />
          )}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {!isLegacy && (
            <>
              <Button
                startIcon={<SaveIcon />}
                variant="contained"
                color="primary"
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                startIcon={<UndoIcon />}
                variant="outlined"
                color="inherit"
                size="small"
                onClick={handleDiscard}
                disabled={!isDirty || saving}
              >
                Discard
              </Button>
            </>
          )}
          <Button
            startIcon={<PictureAsPdfIcon />}
            variant={isLegacy ? 'contained' : 'outlined'}
            onClick={exportPdf}
            disabled={isDirty}
            title={isDirty ? 'Save changes before exporting' : undefined}
          >
            Export PDF
          </Button>
          <Button
            startIcon={<GridOnIcon />}
            variant="outlined"
            onClick={exportXlsx}
            disabled={isDirty}
            title={isDirty ? 'Save changes before exporting' : undefined}
          >
            Export Excel
          </Button>
          <Button
            startIcon={<HistoryIcon />}
            variant="outlined"
            color="inherit"
            onClick={openHistory}
            title="View previously saved versions of this quotation"
          >
            History
          </Button>
          <Button component={Link} to={`/sales/calcsheet/projects/${project.id}`} variant="text" size="small">← Project</Button>
        </Stack>
      </Stack>

      {isLegacy && (
        <Alert
          severity="warning"
          icon={<HistoryIcon />}
          action={
            <Button color="inherit" size="small" startIcon={<ContentCopyIcon />} onClick={handleDuplicateToRevise}>
              Duplicate to revise
            </Button>
          }
        >
          <AlertTitle>Legacy snapshot — totals are frozen</AlertTitle>
          This quotation was imported from an Excel calcsheet that used the previous formulation
          (additive contingency/discount on components, per-role contingency on labor). Inputs are
          locked to preserve the historical record. To create a new revision under the current
          formulation, click <strong>Duplicate to revise</strong>.
          {quotation.importedFrom?.sourceFile && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1, fontFamily: 'monospace', color: 'text.secondary' }}>
              Source: {quotation.importedFrom.sourceFile}
              {quotation.importedFrom.pdfFilename ? ` · PDF: ${quotation.importedFrom.pdfFilename}` : ''}
              {quotation.importedFrom.originalCode ? ` · Original code: ${quotation.importedFrom.originalCode}` : ''}
            </Typography>
          )}
        </Alert>
      )}

      {/* Header / metadata */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
          <TextField
            select
            label="Recipient"
            value={quotation.recipientId ?? ''}
            onChange={(e) => {
              if (isLegacy) return;
              const newRecipientId = e.target.value || null;
              const newClient = clients.find((c) => c.id === newRecipientId) ?? null;
              const newPrimary = newClient?.contacts?.find((c) => c.isPrimary) ?? newClient?.contacts?.[0] ?? null;
              update(quotation.id, {
                recipientId: newRecipientId,
                contactId: newPrimary?.id,
              } as any);
            }}
            disabled={isLegacy}
          >
            {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} — {c.name}</MenuItem>)}
          </TextField>
          <TextField
            select
            label="Contact"
            value={(() => {
              const explicit = quotation.contactId && recipient?.contacts?.find((c) => c.id === quotation.contactId);
              if (explicit) return quotation.contactId;
              const fallback = recipient?.contacts?.find((c) => c.isPrimary) ?? recipient?.contacts?.[0];
              return fallback?.id ?? '';
            })()}
            onChange={(e) => setField('contactId', e.target.value || undefined)}
            disabled={isLegacy || !recipient || !recipient.contacts || recipient.contacts.length === 0}
            helperText={(() => {
              const c = recipient?.contacts?.find((x) => x.id === quotation.contactId)
                ?? recipient?.contacts?.find((x) => x.isPrimary)
                ?? recipient?.contacts?.[0];
              return c ? [c.email, c.phone].filter(Boolean).join(' · ') : 'No contacts';
            })()}
          >
            {(recipient?.contacts ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}{c.isPrimary ? ' ★' : ''}{c.position ? ` — ${c.position}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Revision" value={quotation.revision} onChange={(e) => setField('revision', e.target.value)} disabled={isLegacy} />
          <TextField
            label="Date Sent"
            type="date"
            value={quotation.dateSent || todayDateOnly()}
            onChange={(e) => setField('dateSent', e.target.value || undefined)}
            disabled={isLegacy}
            InputLabelProps={{ shrink: true }}
            helperText={quotation.dateSent ? 'User-defined export date' : 'Defaults to export date'}
          />
          <NumField label="Validity (days)" value={quotation.validityDays} onChange={(v) => setField('validityDays', v)} integer disabled={isLegacy} />
          <NumField label="Warranty (months)" value={quotation.warrantyMonths} onChange={(v) => setField('warrantyMonths', v)} integer disabled={isLegacy} />
          <Box sx={{ gridColumn: 'span 2' }}>
            <TextField
              select
              label="Payment Terms"
              size="small"
              fullWidth
              disabled={isLegacy}
              value={isCustomPayment ? CUSTOM_PAYMENT : quotation.paymentTerms}
              onChange={(e) => setField('paymentTerms', e.target.value === CUSTOM_PAYMENT ? '' : e.target.value)}
            >
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
              <Divider />
              <MenuItem value={CUSTOM_PAYMENT}>— Custom… —</MenuItem>
            </TextField>
            {isCustomPayment && (
              <TextField
                label="Custom Payment Terms"
                size="small"
                fullWidth
                value={quotation.paymentTerms}
                onChange={(e) => setField('paymentTerms', e.target.value)}
                disabled={isLegacy}
                sx={{ mt: 1 }}
              />
            )}
          </Box>
          <TextField
            label="Delivery Terms"
            value={quotation.deliveryTerms}
            onChange={(e) => setField('deliveryTerms', e.target.value)}
            multiline
            minRows={2}
            disabled={isLegacy}
            sx={{ gridColumn: 'span 2' }}
          />
          {(() => {
            const staffOption = (props: any, option: string) => {
              const c = effectiveSalesContacts.find((x) => x.name === option);
              const sub = [c?.position, c?.phone, c?.email].filter(Boolean).join(' · ');
              return (
                <li {...props} key={option}>
                  <Box>
                    <Typography variant="body2">{option}</Typography>
                    {sub && (
                      <Typography variant="caption" color="text.secondary">{sub}</Typography>
                    )}
                  </Box>
                </li>
              );
            };
            const helperFor = (name: string | undefined) => {
              const c = name ? effectiveSalesContacts.find((x) => x.name === name) : undefined;
              return c ? [c.position, c.phone, c.email].filter(Boolean).join(' · ') : ' ';
            };
            return (
              <>
                <Autocomplete
                  freeSolo
                  options={effectiveSalesContacts.map((c) => c.name).filter(Boolean)}
                  value={quotation.preparedBy ?? ''}
                  onChange={(_, v) => setField('preparedBy', v ?? '')}
                  onInputChange={(_, v, reason) => { if (reason === 'input') setField('preparedBy', v); }}
                  disabled={isLegacy}
                  renderOption={staffOption}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Commercially prepared by"
                      placeholder="Pick a team member or type a custom name"
                      helperText={helperFor(quotation.preparedBy)}
                    />
                  )}
                />
                <Tooltip title="Overrides the auto-resolved job title shown in the PDF signature block. Leave blank to use the title from the team member's contact record.">
                  <TextField
                    label="Job Title (PDF signature)"
                    size="small"
                    fullWidth
                    disabled={isLegacy}
                    value={quotation.preparedByTitle ?? ''}
                    onChange={(e) => setField('preparedByTitle', e.target.value || undefined)}
                    placeholder={(() => { const c = quotation.preparedBy ? effectiveSalesContacts.find((x) => x.name === quotation.preparedBy) : undefined; return c?.position || 'e.g. Sales Engineer'; })()}
                    helperText="Leave blank to auto-resolve from team member record"
                  />
                </Tooltip>
                <Autocomplete
                  freeSolo
                  options={effectiveSalesContacts.map((c) => c.name).filter(Boolean)}
                  value={quotation.authorizedBy ?? ''}
                  onChange={(_, v) => setField('authorizedBy', v ?? '')}
                  onInputChange={(_, v, reason) => { if (reason === 'input') setField('authorizedBy', v); }}
                  disabled={isLegacy}
                  renderOption={staffOption}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Authorized by"
                      placeholder="Pick a team member or type a custom name"
                      helperText={helperFor(quotation.authorizedBy)}
                    />
                  )}
                />
              </>
            );
          })()}
        </Box>
      </Paper>

      {/* Terms & Conditions overrides */}
      {!isLegacy && (
        <Accordion disableGutters elevation={1} sx={{ '&:before': { display: 'none' }, borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Terms &amp; Conditions
              {quotation.termsOverrides && Object.values(quotation.termsOverrides).some(Boolean) && (
                <Chip label="custom" size="small" color="warning" sx={{ ml: 1, height: 18, fontSize: 11 }} />
              )}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Leave any field blank to use the default text. Filled fields override the matching section in the exported PDF.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!quotation.pageBreakBeforeTerms}
                    onChange={(e) => setField('pageBreakBeforeTerms', e.target.checked)}
                    disabled={isLegacy}
                  />
                }
                label={<Typography variant="caption">Start Terms on new PDF page</Typography>}
              />
              <TextField
                label="Scope of Work"
                multiline
                minRows={3}
                fullWidth
                value={quotation.termsOverrides?.scopeOfWork ?? ''}
                onChange={(e) => setTermsOverride('scopeOfWork', e.target.value)}
                placeholder="- The scope of work shall be limited strictly to the items, specifications, and services explicitly stated in this proposal. Any additional works, modifications, or deviations not covered herein shall be treated as a Variation Order and shall be subject to separate quotation, approval, and corresponding adjustment in price and delivery schedule."
                helperText="Replaces the default Scope of Work paragraph"
              />
              <TextField
                label="Basis of Proposal"
                multiline
                minRows={3}
                fullWidth
                value={quotation.termsOverrides?.basisOfProposal ?? ''}
                onChange={(e) => setTermsOverride('basisOfProposal', e.target.value)}
                placeholder={`- This offer is based on the technical documents, drawings, specifications, and other references provided by the Client at the time of quotation. ${quotation.kind === 'ACTI' ? 'Advance Controle Technologie Inc.' : 'IO Control Technologie OPC'} reserves the right to revise pricing, scope, and schedule should there be significant changes, inconsistencies, or incomplete information discovered after award.`}
                helperText="Replaces the default Basis of Proposal paragraph"
              />
              <TextField
                label="Delivery — all bullet lines"
                multiline
                minRows={3}
                fullWidth
                value={quotation.termsOverrides?.deliveryLines ?? ''}
                onChange={(e) => setTermsOverride('deliveryLines', e.target.value)}
                placeholder={`- ${quotation.deliveryTerms || 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.'}\n- Delivery terms shall be DDP – Client's Plant Site, unless otherwise specified.`}
                helperText="Replaces ALL delivery bullet lines. Each line on its own row (start with '- '). Leave blank to use the Delivery Terms field above plus the default DDP line."
              />
              <TextField
                label="Warranty exclusion clause"
                multiline
                minRows={2}
                fullWidth
                value={quotation.termsOverrides?.warrantyExclusion ?? ''}
                onChange={(e) => setTermsOverride('warrantyExclusion', e.target.value)}
                placeholder="- Warranty excludes improper installation, unauthorized modifications, misuse, abnormal conditions, power surges, environmental damage, or force majeure events."
                helperText="Replaces the default warranty-exclusion sentence (the coverage sentence above it stays driven by the Warranty months field)"
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Markup, Contingency & Tax */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Markups, Contingency & Tax</Typography>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Product contingency seeds Section B rows and can be overridden per product line.
              Manpower-priced Engineering Services use manpower cost per LOT multiplied by Qty.
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <NumField label="Product Markup %" value={quotation.productMarkupPct} onChange={(v) => setField('productMarkupPct', v)} sx={{ width: 150 }} disabled={isLegacy} />
              <NumField label="Product Contingency %" value={quotation.productContingencyPct ?? 0} onChange={setProductContingency} sx={{ width: 180 }} helperText="Default for product rows" disabled={isLegacy} />
              <NumField label="Labor Markup %" value={quotation.laborMarkupPct} onChange={(v) => setField('laborMarkupPct', v)} sx={{ width: 150 }} helperText="Applied on top of manpower cost" disabled={isLegacy} />
              <NumField label="Gen. Req. Markup %" value={quotation.generalReqMarkupPct} onChange={(v) => setField('generalReqMarkupPct', v)} sx={{ width: 160 }} disabled={isLegacy} />
              <NumField label="Labor Contingency %" value={quotation.globalContingencyPct} onChange={(v) => setField('globalContingencyPct', v)} sx={{ width: 170 }} helperText="Not applied to manpower pricing" disabled={isLegacy} />
              <NumField label="Discount %" value={quotation.discountPct} onChange={(v) => setField('discountPct', v)} sx={{ width: 130 }} disabled={isLegacy} />
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={quotation.vatPct > 0}
                      onChange={(e) => setField('vatPct', e.target.checked ? 12 : 0)}
                      disabled={isLegacy}
                    />
                  }
                  label={<Typography variant="caption">Include VAT</Typography>}
                />
                {quotation.vatPct > 0 && (
                  <NumField label="VAT %" value={quotation.vatPct} onChange={(v) => setField('vatPct', v)} sx={{ width: 100 }} disabled={isLegacy} />
                )}
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {/* Section A */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>A. General Requirements</Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={!!quotation.exportGeneralReqtsAsLot}
                  onChange={(e) => setField('exportGeneralReqtsAsLot', e.target.checked)}
                  disabled={isLegacy}
                />
              }
              label={<Typography variant="caption">Group in PDF/Excel</Typography>}
            />
            {!!quotation.exportGeneralReqtsAsLot && (
              <Stack direction="row" spacing={1} alignItems="center">
                <NumField
                  label="Qty"
                  value={generalReqtsExportQty}
                  onChange={(v) => setField('generalReqtsExportQty', Math.max(1, v))}
                  integer
                  sx={{ width: 86 }}
                  disabled={isLegacy}
                />
                <Typography variant="caption" color="text.secondary">
                  Unit: {PHP(generalReqtsExportUnitPrice)} / LOT
                </Typography>
              </Stack>
            )}
          </Stack>
          {!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addGeneral}>Add row</Button>}
        </Stack>
        <EditableTable
          rows={quotation.generalReqts}
          columns={generalCols}
          onChange={(idx, key, v) => updateRow('generalReqts', idx, key, v)}
          onDelete={(idx) => deleteRow('generalReqts', idx)}
          onReorder={(rows) => reorderRows('generalReqts', rows)}
          emptyMessage="No general requirements"
          readOnly={isLegacy}
          footer={
            <>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={5} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>Cost (no markup)</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(totals.generalReqtsCost)}</TableCell>
                <TableCell />
              </TableRow>
              {!!quotation.exportGeneralReqtsAsLot && (
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                    Unit Price / LOT
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(generalReqtsExportUnitPrice)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>Subtotal (with markup)</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.generalReqtsSubtotal)}</TableCell>
                <TableCell />
              </TableRow>
            </>
          }
        />
      </Paper>

      {/* Section B */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>B. Supply of Components</Typography>
          {!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addComponent}>Add row</Button>}
        </Stack>
        <EditableTable
          rows={quotation.components}
          columns={compCols}
          onChange={(idx, key, v) => updateRow('components', idx, key, v)}
          onDelete={(idx) => deleteRow('components', idx)}
          onReorder={(rows) => reorderRows('components', rows)}
          emptyMessage="No components — typical for IOCT services-only quotes"
          readOnly={isLegacy}
          footer={
            <>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={10} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>Cost (no contingency/markup)</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(totals.componentsCost)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={10} align="right" sx={{ fontWeight: 600 }}>Subtotal (with contingency + markup)</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.componentsSubtotal)}</TableCell>
                <TableCell />
              </TableRow>
            </>
          }
        />
      </Paper>

      {/* Section C — Scope of Works (deliverables) */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>C. Engineering Services</Typography>
            <Typography variant="caption" color="text.secondary">
              {quotation.servicesFromManpower && quotation.servicesPerLinePricing
                ? 'Scope of Works — each deliverable priced individually. Manpower table below is the cost basis.'
                : quotation.servicesFromManpower
                  ? 'Scope of Works — deliverables shown as bullets in the quotation, priced as a lump sum below.'
                  : 'Scope of Works — each deliverable priced individually.'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={<Switch size="small" checked={quotation.servicesFromManpower} onChange={(e) => setField('servicesFromManpower', e.target.checked)} disabled={isLegacy} />}
              label={<Typography variant="caption">Price from manpower</Typography>}
            />
            {quotation.servicesFromManpower && (
              <>
                <FormControlLabel
                  control={<Switch size="small" checked={!!quotation.servicesPerLinePricing} onChange={(e) => setField('servicesPerLinePricing', e.target.checked)} disabled={isLegacy} />}
                  label={<Typography variant="caption">Per-line pricing</Typography>}
                />
                {!quotation.servicesPerLinePricing && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <NumField
                      label="Qty"
                      value={engineeringServicesQty}
                      onChange={(v) => setField('engineeringServicesQty', Math.max(1, v))}
                      integer
                      sx={{ width: 86 }}
                      disabled={isLegacy}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Unit: {PHP(engineeringServicesUnitPrice)} / LOT
                    </Typography>
                  </Stack>
                )}
              </>
            )}
            {!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addService}>Add scope item</Button>}
          </Stack>
        </Stack>
        <EditableTable
          rows={quotation.services}
          columns={
            quotation.servicesFromManpower && !quotation.servicesPerLinePricing
              ? svcCols.filter((c) => c.key !== 'amount')
              : svcCols
          }
          onChange={(idx, key, v) => updateRow('services', idx, key, v)}
          onDelete={(idx) => deleteRow('services', idx)}
          onReorder={(rows) => reorderRows('services', rows)}
          emptyMessage="No scope items — add deliverables (e.g., 'PLC redundancy troubleshooting', 'TIA Portal integration')"
          readOnly={isLegacy}
          footer={
            (!quotation.servicesFromManpower || quotation.servicesPerLinePricing) ? (
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={2} align="right" sx={{ fontWeight: 600 }}>Services Subtotal</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.servicesSubtotal)}</TableCell>
                <TableCell />
              </TableRow>
            ) : undefined
          }
        />

        {quotation.servicesFromManpower && (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Manpower (cost basis)</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {!quotation.servicesPerLinePricing && (
                  <Typography variant="caption" color="text.secondary">
                    Subtotal = Manpower cost / LOT × {engineeringServicesQty} LOT
                  </Typography>
                )}
                {!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addManpower}>Add manpower</Button>}
              </Stack>
            </Stack>
            <EditableTable
              rows={quotation.manpower}
              columns={mpCols}
              onChange={(idx, key, v) => updateRow('manpower', idx, key, v)}
              onDelete={(idx) => deleteRow('manpower', idx)}
              onReorder={(rows) => reorderRows('manpower', rows)}
              emptyMessage="No manpower entries — pick a role from the dropdown to auto-fill rate & allowance"
              readOnly={isLegacy}
              footer={
                quotation.servicesPerLinePricing ? (
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 600 }}>Total Manpower Cost</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.laborCost)}</TableCell>
                    <TableCell />
                  </TableRow>
                ) : (
                <>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                      {engineeringServicesQty > 1 ? 'Manpower Cost / LOT' : 'Manpower Cost'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {PHP(manpowerTotalCost(quotation.manpower))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {engineeringServicesQty > 1 && (
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell colSpan={6} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                        Total Manpower Cost ({engineeringServicesQty} LOT)
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(totals.laborCost)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                      Unit Price / LOT
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(engineeringServicesUnitPrice)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 600 }}>Services Subtotal (lump sum)</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.servicesSubtotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </>
                )
              }
            />
          </Box>
        )}
      </Paper>

      {/* Totals */}
      <Paper sx={{ p: 2.5, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Totals</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1, columnGap: 4, maxWidth: 560, ml: 'auto', mb: 2 }}>
          <Typography variant="body2">A. General Requirements</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(totals.generalReqtsSubtotal)}</Typography>
          <Typography variant="body2">B. Supply of Components</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(totals.componentsSubtotal)}</Typography>
          <Typography variant="body2">C. Engineering Services</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(totals.servicesSubtotal)}</Typography>
          <Divider sx={{ gridColumn: 'span 2', my: 0.5 }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Subtotal (VAT-EX)</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right', fontWeight: 600 }}>{PHP(totals.subtotal)}</Typography>
          {quotation.discountPct > 0 && <>
            <Typography variant="body2">Discount ({quotation.discountPct}%)</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right', color: 'error.main' }}>− {PHP(totals.discount)}</Typography>
          </>}
          {quotation.vatPct > 0 && <>
            <Typography variant="body2">VAT ({quotation.vatPct}%)</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>{PHP(totals.vat)}</Typography>
          </>}
        </Box>
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Box sx={{ p: 2, border: '1px solid', borderColor: 'success.light', borderRadius: 1, bgcolor: 'rgba(46,125,50,0.05)', textAlign: 'right', minWidth: 240 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Total Margin (markup only)</Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'success.dark', fontWeight: 700 }}>
              {PHP(marginSummary?.value ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'success.dark', fontWeight: 600 }}>
              {(marginSummary?.pct ?? 0).toFixed(1)}% margin
            </Typography>
            {marginSummary && marginSummary.contingency > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                + Contingency reserve: {PHP(marginSummary.contingency)} ({marginSummary.contingencyPct.toFixed(1)}%)
              </Typography>
            )}
          </Box>
          <Box sx={{ p: 2, bgcolor: 'primary.main', borderRadius: 1, textAlign: 'right', minWidth: 220 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', display: 'block', mb: 0.5 }}>GRAND TOTAL</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'monospace', color: 'white', fontWeight: 700 }}>
              {PHP(totals.grandTotal)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Cost breakdown — internal only, never appears in PDF */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Internal Breakdown (not shown to client)</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
          <BreakdownCard label="A. General Req." color="primary"
            cost={totals.generalReqtsCost}
            contingency={null}
            contingencyPct={null}
            markup={totals.generalReqtsSubtotal - totals.generalReqtsWithContingency}
            markupPct={quotation.generalReqMarkupPct}
            subtotal={totals.generalReqtsSubtotal}
          />
          <BreakdownCard label="B. Components" color="secondary"
            cost={totals.componentsCost}
            contingency={(totals.componentsWithContingency ?? totals.componentsCost) - totals.componentsCost}
            contingencyPct={quotation.productContingencyPct ?? 0}
            markup={totals.componentsSubtotal - (totals.componentsWithContingency ?? totals.componentsCost)}
            markupPct={quotation.productMarkupPct}
            subtotal={totals.componentsSubtotal}
          />
          <BreakdownCard label="C. Labor" color="primary"
            cost={totals.laborCost}
            contingency={quotation.servicesFromManpower ? totals.laborWithContingency - totals.laborCost : null}
            contingencyPct={quotation.servicesFromManpower ? quotation.globalContingencyPct : null}
            markup={quotation.servicesFromManpower ? totals.servicesSubtotal - totals.laborWithContingency : 0}
            markupPct={quotation.servicesFromManpower
              ? (quotation.servicesPerLinePricing
                ? (totals.laborCost > 0 ? ((totals.servicesSubtotal - totals.laborCost) / totals.laborCost) * 100 : 0)
                : quotation.laborMarkupPct)
              : 0}
            subtotal={totals.servicesSubtotal}
          />
          <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">Total Margin (markup only)</Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'success.main', mt: 0.5, fontWeight: 700 }}>
              {PHP(marginSummary?.value ?? 0)}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontWeight: 600 }}>
              {(marginSummary?.pct ?? 0).toFixed(1)}% margin
            </Typography>
            {marginSummary && marginSummary.contingency > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Contingency reserve: {PHP(marginSummary.contingency)} ({marginSummary.contingencyPct.toFixed(1)}%)
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      {/* Saved-version history */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Version history — {project.code}-{quotation.revision} ({quotation.kind})
          <Typography variant="body2" color="text.secondary">
            A snapshot of the previous state is kept every time this quotation is saved.
            The current state is what you see in the editor.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading ? (
            <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={28} /></Stack>
          ) : historyError ? (
            <Alert severity="error">Could not load history: {historyError}</Alert>
          ) : versions.length === 0 ? (
            <Alert severity="info">
              No earlier versions yet. History starts recording from the next time this quotation is saved.
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Replaced on</TableCell>
                  <TableCell>Saved by</TableCell>
                  <TableCell align="right">Grand Total</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {versions.map((v, i) => {
                  let total = '—';
                  try { total = PHP(computeTotals(v.data).grandTotal); } catch { /* malformed snapshot */ }
                  return (
                    <TableRow key={v.id} hover>
                      <TableCell sx={{ color: 'text.secondary' }}>{versions.length - i}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {v.savedAt ? format(new Date(v.savedAt), 'yyyy-MM-dd HH:mm') : '—'}
                      </TableCell>
                      <TableCell>{v.savedBy || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{total}</TableCell>
                      <TableCell align="right">
                        {!isLegacy && (
                          <Button size="small" startIcon={<UndoIcon />} onClick={() => restoreVersion(v)}>
                            Restore
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.sev === 'success' ? 3500 : 6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert onClose={() => setToast(null)} severity={toast.sev} variant="filled" sx={{ width: '100%' }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}
