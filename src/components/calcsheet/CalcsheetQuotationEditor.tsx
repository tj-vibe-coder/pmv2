import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, AlertTitle, Box, Button, Chip, Divider, FormControlLabel, ListSubheader, MenuItem, Paper,
  Stack, Switch, TableCell, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import GridOnIcon from '@mui/icons-material/GridOn';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useQuotationStore } from '../../store/quotationStore';
import {
  PHP, computeTotals, componentLineTotal,
  componentSellingUnit, lineGeneralTotal, manpowerCost, manpowerTotalCost,
} from '../../utils/calcsheet/calc';
import type {
  ComponentLine, GeneralReqLine, ManpowerEntry, ServiceLine,
} from '../../types/Quotation';
import { EditableTable } from './EditableTable';
import type { Column } from './EditableTable';
import { exportQuotationPdf } from '../../utils/calcsheet/pdfExport';
import { exportQuotationXlsx } from '../../utils/calcsheet/xlsxExport';

const id = () => nanoid(6);

const PAYMENT_TERM_OPTIONS = [
  '30% DP, 70% Progress Billing',
  '30% DP, 60% Progress Billing, 10% Retention',
  '20% DP, 80% Progress Billing',
  '20% DP, 70% Progress Billing, 10% Retention',
  '50% DP, 50% Progress Billing',
  '50% DP, 50% Upon Completion',
  '100% Upon Completion',
];
const CUSTOM_PAYMENT = '__custom__';

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
  const quotation = useQuotationStore((s) => s.quotations.find((q) => q.id === qid));
  const project = useQuotationStore((s) => quotation ? s.projects.find((p) => p.id === quotation.projectId) : undefined);
  const clients = useQuotationStore((s) => s.clients);
  const presets = useQuotationStore((s) => s.laborPresets);
  const update = useQuotationStore((s) => s.updateQuotation);
  const duplicateQuotation = useQuotationStore((s) => s.duplicateQuotation);

  const totals = useMemo(() => quotation ? computeTotals(quotation) : null, [quotation]);

  if (!quotation || !project || !totals) {
    return <Typography>Quotation not found. <Link to="/calcsheet/projects">Back</Link></Typography>;
  }
  const recipient = clients.find((c) => c.id === quotation.recipientId);
  const customer = clients.find((c) => c.id === project.customerId);
  const issuer = quotation.kind;
  const isLegacy = quotation.formulaVersion === 'legacy';

  const setField = <K extends keyof typeof quotation>(k: K, v: any) => {
    if (isLegacy) return;
    update(quotation.id, { [k]: v } as any);
  };

  const handleDuplicateToRevise = async () => {
    const copy = await duplicateQuotation(quotation.id);
    if (copy) navigate(`/calcsheet/quotations/${copy.id}`);
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
        qty: 1, uom: 'pc', unitCost: 0, forex: 1, contingencyPct: 0, discountPct: 0 },
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
    list[idx] = { ...list[idx], [key]: value };
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

  const exportPdf = () => exportQuotationPdf(quotation, project, recipient ?? null, customer ?? null);
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
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<PictureAsPdfIcon />} variant="contained" onClick={exportPdf}>Export PDF</Button>
          <Button startIcon={<GridOnIcon />} variant="outlined" onClick={exportXlsx}>Export Excel</Button>
          <Button component={Link} to={`/calcsheet/projects/${project.id}`} variant="text" size="small">← Project</Button>
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
          <TextField
            label="Commercially prepared by"
            value={quotation.preparedBy ?? ''}
            onChange={(e) => setField('preparedBy', e.target.value)}
            placeholder="e.g. Reuel Joshua T. Rivera"
            disabled={isLegacy}
          />
          <TextField
            label="Authorized by"
            value={quotation.authorizedBy ?? ''}
            onChange={(e) => setField('authorizedBy', e.target.value)}
            placeholder="e.g. Renzel Punongbayan"
            disabled={isLegacy}
          />
        </Box>
      </Paper>

      {/* Markup, Contingency & Tax */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Markups, Contingency & Tax</Typography>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Markup applied per category. Global contingency adds a buffer on Labor and General Requirements only
              (Components carry their own per-line contingency in Section B).
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <NumField label="Product Markup %" value={quotation.productMarkupPct} onChange={(v) => setField('productMarkupPct', v)} sx={{ width: 150 }} disabled={isLegacy} />
              <NumField label="Labor Markup %" value={quotation.laborMarkupPct} onChange={(v) => setField('laborMarkupPct', v)} sx={{ width: 150 }} disabled={isLegacy} />
              <NumField label="Gen. Req. Markup %" value={quotation.generalReqMarkupPct} onChange={(v) => setField('generalReqMarkupPct', v)} sx={{ width: 160 }} disabled={isLegacy} />
              <NumField label="Global Contingency %" value={quotation.globalContingencyPct} onChange={(v) => setField('globalContingencyPct', v)} sx={{ width: 170 }} helperText="Labor + Gen Req only" disabled={isLegacy} />
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
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>A. General Requirements</Typography>
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
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>Subtotal (w/ contingency + markup)</TableCell>
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
                <TableCell colSpan={9} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>Cost (no markup)</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(totals.componentsCost)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell colSpan={9} align="right" sx={{ fontWeight: 600 }}>Subtotal (with markup)</TableCell>
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
              Scope of Works — deliverables shown as bullets in the quotation, priced as a lump sum below.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={<Switch size="small" checked={quotation.servicesFromManpower} onChange={(e) => setField('servicesFromManpower', e.target.checked)} disabled={isLegacy} />}
              label={<Typography variant="caption">Price from manpower</Typography>}
            />
            {!isLegacy && <Button startIcon={<AddIcon />} size="small" onClick={addService}>Add scope item</Button>}
          </Stack>
        </Stack>
        <EditableTable
          rows={quotation.services}
          columns={
            quotation.servicesFromManpower
              ? svcCols.filter((c) => c.key !== 'amount')
              : svcCols
          }
          onChange={(idx, key, v) => updateRow('services', idx, key, v)}
          onDelete={(idx) => deleteRow('services', idx)}
          onReorder={(rows) => reorderRows('services', rows)}
          emptyMessage="No scope items — add deliverables (e.g., 'PLC redundancy troubleshooting', 'TIA Portal integration')"
          readOnly={isLegacy}
          footer={
            !quotation.servicesFromManpower ? (
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
                <Typography variant="caption" color="text.secondary">
                  Subtotal = Manpower cost × (1 + {quotation.laborMarkupPct}%)
                </Typography>
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
                <>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 500, color: 'text.secondary' }}>Manpower Cost</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{PHP(manpowerTotalCost(quotation.manpower))}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 600 }}>Services Subtotal (lump sum)</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{PHP(totals.servicesSubtotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </>
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
          <Box sx={{ p: 2, border: '1px solid', borderColor: 'success.light', borderRadius: 1, bgcolor: 'rgba(46,125,50,0.05)', textAlign: 'right', minWidth: 220 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Total Margin (all categories)</Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'success.dark', fontWeight: 700 }}>
              {PHP(
                (totals.generalReqtsSubtotal - totals.generalReqtsCost) +
                (totals.componentsSubtotal - totals.componentsCost) +
                (totals.servicesSubtotal - totals.laborCost),
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">Contingency + markup combined</Typography>
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
            contingency={totals.generalReqtsWithContingency - totals.generalReqtsCost}
            contingencyPct={quotation.globalContingencyPct}
            markup={totals.generalReqtsSubtotal - totals.generalReqtsWithContingency}
            markupPct={quotation.generalReqMarkupPct}
            subtotal={totals.generalReqtsSubtotal}
          />
          <BreakdownCard label="B. Components" color="secondary"
            cost={totals.componentsCost}
            contingency={null}
            contingencyPct={null}
            markup={totals.componentsSubtotal - totals.componentsCost}
            markupPct={quotation.productMarkupPct}
            subtotal={totals.componentsSubtotal}
          />
          <BreakdownCard label="C. Labor" color="primary"
            cost={totals.laborCost}
            contingency={quotation.servicesFromManpower ? totals.laborWithContingency - totals.laborCost : null}
            contingencyPct={quotation.servicesFromManpower ? quotation.globalContingencyPct : null}
            markup={quotation.servicesFromManpower ? totals.servicesSubtotal - totals.laborWithContingency : 0}
            markupPct={quotation.servicesFromManpower ? quotation.laborMarkupPct : 0}
            subtotal={totals.servicesSubtotal}
          />
          <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">Total Margin (all categories)</Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'success.main', mt: 0.5, fontWeight: 700 }}>
              {PHP(
                (totals.generalReqtsSubtotal - totals.generalReqtsCost) +
                (totals.componentsSubtotal - totals.componentsCost) +
                (totals.servicesSubtotal - totals.laborCost),
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Contingency + markup combined
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Stack>
  );
}
