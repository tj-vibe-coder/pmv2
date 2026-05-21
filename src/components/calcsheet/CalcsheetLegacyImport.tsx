import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, LinearProgress,
  Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { parseLegacyWorkbook } from '../../utils/calcsheet/legacyImport';
import type { ParsedProject } from '../../utils/calcsheet/legacyImport';
import { PHP } from '../../utils/calcsheet/calc';
import { useQuotationStore } from '../../store/quotationStore';
import { nextProjectSequence, assignLegacyCode } from '../../utils/calcsheet/codes';
import { detectIssuerFromPdf } from '../../utils/calcsheet/pdfIssuerDetect';
import type { PdfIssuer } from '../../utils/calcsheet/pdfIssuerDetect';

const API_BASE = process.env.REACT_APP_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

type RowStatus = 'pending' | 'importing' | 'done' | 'error' | 'skipped';

interface PdfClassified {
  filename: string;
  issuer: PdfIssuer;
}

interface PreviewRow {
  filename: string;
  parsed: ParsedProject;
  // Per-kind selection — auto-set from detected PDF issuers.
  selectIOCT: boolean;
  selectACTI: boolean;
  status: RowStatus;
  message?: string;
  effectiveCode: string;
  reassigned: boolean;
  importedProjectId?: string;
  // PDFs with their detected issuer kind (from letterhead text)
  classifiedPdfs: PdfClassified[];
}

function isPCSCode(code: string): boolean {
  return /^PCS\d{4}\d{3}-[A-Z]{3}-\d{2}$/.test(code);
}

// File extension helpers
const isXlsx = (name: string) => /\.xlsx?$/i.test(name) && !name.startsWith('~$');
const isPdf = (name: string) => /\.pdf$/i.test(name);
const isTemplateFilename = (name: string) =>
  /PCSYYMMXXX/i.test(name) || /ACTI25XX-XX-XX/i.test(name);

// Group files by their first path segment (top-level folder name).
function groupByProjectFolder(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();
  for (const f of files) {
    // webkitRelativePath looks like "IO Proposal/PCS2602001-ICI .../Calsheet/xxx.xlsx"
    // or for single-folder pick: "PCS2602001-ICI .../Calsheet/xxx.xlsx"
    const path = (f as any).webkitRelativePath || f.name;
    const parts = path.split('/');
    // Heuristic: if first part is a PCS/ACTI/CMRP project folder, use it directly.
    // Otherwise use the second part (user picked the parent IO Proposal folder).
    const first = parts[0] || '';
    const isProjectFolder = /^(PCS|ACTI|CMRP)/i.test(first);
    const projectFolder = isProjectFolder ? first : (parts[1] || first);
    if (!groups.has(projectFolder)) groups.set(projectFolder, []);
    groups.get(projectFolder)!.push(f);
  }
  return groups;
}

export default function CalcsheetLegacyImport() {
  const navigate = useNavigate();
  const projects = useQuotationStore((s) => s.projects);
  const clients = useQuotationStore((s) => s.clients);
  const init = useQuotationStore((s) => s.init);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    const next: PreviewRow[] = [];
    const existingCodes = projects.map((p) => p.code);
    let nextSeq = nextProjectSequence(existingCodes);

    const fileArr = Array.from(files);
    const groups = groupByProjectFolder(fileArr);

    // Sort groups by name so previews come back in folder order.
    const sortedFolders = Array.from(groups.keys()).sort();

    for (const folderName of sortedFolders) {
      const filesInGroup = groups.get(folderName)!;
      const xlsxFiles = filesInGroup.filter((f) => isXlsx(f.name) && !isTemplateFilename(f.name));
      const pdfFileObjs = filesInGroup.filter((f) => {
        const path = (f as any).webkitRelativePath || f.name;
        return isPdf(f.name) && /\/Offer\//i.test(path);
      });
      const pdfFilenames = pdfFileObjs.map((f) => f.name);

      if (xlsxFiles.length === 0) continue; // skip folders without a calcsheet (e.g. CMRP screenshots-only)

      // Detect issuer kind for each PDF (letterhead text on page 1).
      const classifiedPdfs: PdfClassified[] = [];
      for (const pdfFile of pdfFileObjs) {
        const issuer = await detectIssuerFromPdf(pdfFile);
        classifiedPdfs.push({ filename: pdfFile.name, issuer });
      }
      const detectedKinds = new Set(classifiedPdfs.map((p) => p.issuer));
      const hasIoctPdf = detectedKinds.has('IOCT');
      const hasActiPdf = detectedKinds.has('ACTI');
      const hasUnknownPdf = detectedKinds.has('unknown');

      for (const xlsxFile of xlsxFiles) {
        try {
          const buf = await xlsxFile.arrayBuffer();
          const parsed = parseLegacyWorkbook(buf, {
            filename: xlsxFile.name,
            offerPdfs: pdfFilenames,
            projectFolder: folderName,
          });

          let effectiveCode = parsed.originalCode;
          let reassigned = false;
          // Try to reconstruct a clean PCS code from parsed parts (which include folder-name fallback).
          const reconstructed = parsed.yymm && parsed.seqFromOriginal && parsed.clientCode
            ? assignLegacyCode(parsed.yymm, parsed.seqFromOriginal, parsed.clientCode, parsed.revision || '00')
            : null;
          if (isPCSCode(parsed.originalCode)) {
            // originalCode already follows the PCS scheme — keep it
            effectiveCode = parsed.originalCode;
          } else if (reconstructed && isPCSCode(reconstructed)) {
            // recovered from folder/filename — keep original sequence number
            effectiveCode = reconstructed;
            reassigned = true;
            parsed.warnings.push(`Recovered code from folder/filename: ${parsed.originalCode} → ${effectiveCode}`);
          } else {
            // truly non-PCS (e.g. ACTI-format folder) — assign a fresh global sequence
            const yymm = parsed.yymm || '0000';
            effectiveCode = assignLegacyCode(yymm, nextSeq, parsed.clientCode, parsed.revision || '00');
            nextSeq += 1;
            reassigned = true;
            parsed.warnings.push(`Reassigned code (next seq): ${parsed.originalCode} → ${effectiveCode}`);
          }

          if (pdfFileObjs.length === 0) {
            parsed.warnings.push('No PDFs found in /Offer/ — verify whether either quotation was actually issued');
          } else if (hasUnknownPdf && !hasIoctPdf && !hasActiPdf) {
            parsed.warnings.push('Could not detect issuer in PDF letterhead — verify manually');
          }

          next.push({
            filename: xlsxFile.name,
            parsed,
            // Pre-check based on what the PDF letterheads say. If all PDFs are 'unknown',
            // fall back to checking both so the user can decide.
            selectIOCT: hasIoctPdf || (hasUnknownPdf && !hasActiPdf),
            selectACTI: hasActiPdf || (hasUnknownPdf && !hasIoctPdf),
            status: 'pending',
            effectiveCode,
            reassigned,
            classifiedPdfs,
          });
        } catch (err: any) {
          next.push({
            filename: xlsxFile.name,
            parsed: {
              originalCode: xlsxFile.name, baseCode: '', yymm: '', seqFromOriginal: 0, clientCode: '',
              revision: '00', projectName: '(parse failed)', date: new Date().toISOString().slice(0, 10),
              customer: { code: '', name: '', contact: '' }, quotations: [],
              warnings: [`Parse error: ${err.message || err}`], sourceFile: xlsxFile.name,
              offerPdfs: pdfFilenames, projectFolder: folderName,
            },
            selectIOCT: false,
            selectACTI: false,
            status: 'error',
            message: err.message || String(err),
            effectiveCode: xlsxFile.name,
            reassigned: false,
            classifiedPdfs,
          });
        }
      }
    }
    setRows(next);
    setParsing(false);
  };

  const toggleKind = (idx: number, kind: 'IOCT' | 'ACTI') => {
    setRows((rs) => rs.map((r, i) => {
      if (i !== idx) return r;
      return kind === 'IOCT' ? { ...r, selectIOCT: !r.selectIOCT } : { ...r, selectACTI: !r.selectACTI };
    }));
  };

  const importRow = async (row: PreviewRow): Promise<PreviewRow> => {
    const code = row.effectiveCode;
    const customerMatch = clients.find((c) => c.code === row.parsed.customer.code);
    const project = {
      code,
      name: row.parsed.projectName,
      location: row.parsed.customer.address || '',
      date: row.parsed.date,
      customerId: customerMatch?.id ?? null,
      partnerId: null,
      salesContactId: null,
      status: 'sent' as const,
    };

    // Pick the matching PDF for the given kind: first try detected-issuer match, then
    // fall back to filename heuristics.
    const pdfForKind = (kind: 'IOCT' | 'ACTI'): string | undefined => {
      const detected = row.classifiedPdfs.filter((p) => p.issuer === kind).map((p) => p.filename);
      if (detected.length > 0) return detected.join(', ');
      if (row.parsed.offerPdfs.length === 0) return undefined;
      const byRev = row.parsed.offerPdfs.find((p) => p.includes(`-${row.parsed.revision}.pdf`));
      return byRev || row.parsed.offerPdfs.join(', ');
    };

    const wantKinds: Array<'IOCT' | 'ACTI'> = [];
    if (row.selectIOCT) wantKinds.push('IOCT');
    if (row.selectACTI) wantKinds.push('ACTI');

    const quotations = row.parsed.quotations
      .filter((q) => wantKinds.includes(q.kind))
      .map((q) => ({
        kind: q.kind,
        revision: q.revision,
        recipientId: customerMatch?.id ?? null,
        validityDays: q.validityDays,
        paymentTerms: q.paymentTerms,
        deliveryTerms: q.deliveryTerms,
        warrantyMonths: q.warrantyMonths,
        productMarkupPct: q.productMarkupPct,
        laborMarkupPct: q.laborMarkupPct,
        generalReqMarkupPct: q.generalReqMarkupPct,
        globalContingencyPct: q.globalContingencyPct,
        discountPct: q.discountPct,
        vatPct: q.vatPct,
        generalReqts: q.generalReqts,
        components: q.components,
        services: q.services,
        manpower: q.manpower,
        servicesFromManpower: q.servicesFromManpower,
        preparedBy: q.preparedBy,
        authorizedBy: q.authorizedBy,
        legacyTotalsSnapshot: q.legacyTotalsSnapshot,
        importedFrom: {
          sourceFile: row.filename,
          importedAt: new Date().toISOString(),
          originalCode: row.parsed.originalCode,
          pdfFilename: pdfForKind(q.kind),
        },
      }));

    if (quotations.length === 0) {
      return { ...row, status: 'skipped', message: 'No kinds selected' };
    }

    const client = customerMatch ? undefined : {
      code: row.parsed.customer.code,
      name: row.parsed.customer.name,
      address: row.parsed.customer.address,
      paymentTerms: row.parsed.customer.paymentTerms,
      contacts: row.parsed.customer.contact ? [{
        id: Math.random().toString(36).slice(2, 10),
        name: row.parsed.customer.contact,
        email: row.parsed.customer.email,
        phone: row.parsed.customer.phone,
        gender: row.parsed.customer.gender,
        isPrimary: true,
      }] : [],
    };

    const token = localStorage.getItem('netpacific_token');
    const url = `${API_BASE}/api/calcsheet/import/legacy?mode=${overwrite ? 'overwrite' : 'skip'}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ project, quotations, client }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ...row, status: 'error', message: data.error || 'Import failed' };
    }
    return {
      ...row, status: 'done',
      message: `${data.action}, ${data.quotations?.length || 0} quotation(s)`,
      importedProjectId: data.projectId,
    };
  };

  const importSelected = async () => {
    setImporting(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if ((!r.selectIOCT && !r.selectACTI) || r.status === 'done') continue;
      setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, status: 'importing' as RowStatus } : x)));
      try {
        const updated = await importRow(r);
        setRows((rs) => rs.map((x, idx) => (idx === i ? updated : x)));
      } catch (err: any) {
        setRows((rs) => rs.map((x, idx) => (
          idx === i ? { ...x, status: 'error' as RowStatus, message: err.message || String(err) } : x
        )));
      }
    }
    setImporting(false);
    useQuotationStore.setState({ initialized: false });
    await init().catch(() => {});
  };

  const selectedCount = rows.filter((r) => (r.selectIOCT || r.selectACTI) && r.status !== 'done').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const doneCount = rows.filter((r) => r.status === 'done').length;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryIcon color="warning" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Import legacy calcsheets</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Pick a project folder (or the whole IO Proposal folder). The parser reads each
            <code> Calsheet/*.xlsx </code>, then opens each <code>/Offer/*.pdf </code> and
            <strong>auto-detects IOCT vs ACTI from the letterhead text</strong>. Only the kinds
            that have a matching PDF get pre-checked. Imports save as <strong>legacy</strong>
            with frozen totals.
          </Typography>
        </Stack>
        <Button component={Link} to="/calcsheet/projects" variant="text" size="small">← Projects</Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button variant="contained" startIcon={<UploadFileIcon />} component="label" disabled={parsing}>
            {parsing ? 'Parsing…' : 'Choose folder'}
            <input
              hidden
              type="file"
              // @ts-ignore — non-standard but supported in Chromium/WebKit
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => onPick(e.target.files)}
            />
          </Button>
          <FormControlLabel
            control={<Switch size="small" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />}
            label={<Typography variant="caption">Overwrite existing projects with same code</Typography>}
          />
          {rows.length > 0 && (
            <>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary">
                {rows.length} workbook(s) · {selectedCount} selected · {doneCount} done · {errorCount} error
              </Typography>
              <Button
                variant="contained"
                color="warning"
                onClick={importSelected}
                disabled={importing || selectedCount === 0}
              >
                Import selected ({selectedCount})
              </Button>
            </>
          )}
        </Stack>
        {(parsing || importing) && <LinearProgress sx={{ mt: 2 }} />}
      </Paper>

      {rows.length > 0 && (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>File / Code</TableCell>
                <TableCell>Project</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell padding="checkbox" align="center">IOCT</TableCell>
                <TableCell padding="checkbox" align="center">ACTI</TableCell>
                <TableCell>/Offer/ PDFs (auto-detected issuer)</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Open</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, idx) => {
                const ioct = r.parsed.quotations.find((q) => q.kind === 'IOCT');
                const acti = r.parsed.quotations.find((q) => q.kind === 'ACTI');
                const customerMatch = clients.find((c) => c.code === r.parsed.customer.code);
                const disabled = r.status === 'importing' || r.status === 'done';
                return (
                  <TableRow key={idx} hover>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {r.effectiveCode}
                        </Typography>
                        {r.reassigned && (
                          <Typography variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
                            from {r.parsed.originalCode}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {r.parsed.projectFolder || r.filename}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{r.parsed.projectName || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.parsed.date}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2">{r.parsed.customer.name || '—'}</Typography>
                        {customerMatch ? (
                          <Chip size="small" label="matched" color="success" variant="outlined" sx={{ height: 18 }} />
                        ) : r.parsed.customer.code ? (
                          <Chip size="small" label="will create" color="info" variant="outlined" sx={{ height: 18 }} />
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell padding="checkbox" align="center">
                      <Stack alignItems="center" spacing={0}>
                        <Checkbox
                          size="small"
                          checked={r.selectIOCT}
                          onChange={() => toggleKind(idx, 'IOCT')}
                          disabled={disabled || !ioct}
                        />
                        {ioct && (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            {PHP(ioct.legacyTotalsSnapshot.grandTotal)}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell padding="checkbox" align="center">
                      <Stack alignItems="center" spacing={0}>
                        <Checkbox
                          size="small"
                          checked={r.selectACTI}
                          onChange={() => toggleKind(idx, 'ACTI')}
                          disabled={disabled || !acti}
                        />
                        {acti && (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            {PHP(acti.legacyTotalsSnapshot.grandTotal)}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {r.classifiedPdfs.length === 0 ? (
                        <Typography variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
                          none — verify
                        </Typography>
                      ) : (
                        <Stack spacing={0.25}>
                          {r.classifiedPdfs.map((p, i) => (
                            <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                              <PictureAsPdfIcon fontSize="inherit" color="action" />
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                                {p.filename}
                              </Typography>
                              <Chip
                                size="small"
                                label={p.issuer === 'unknown' ? '?' : p.issuer}
                                color={p.issuer === 'IOCT' ? 'primary' : p.issuer === 'ACTI' ? 'secondary' : 'default'}
                                variant={p.issuer === 'unknown' ? 'outlined' : 'filled'}
                                sx={{ height: 18, fontSize: '0.6rem' }}
                              />
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {r.status === 'done' && <CheckCircleIcon fontSize="small" color="success" />}
                        {r.status === 'error' && <ErrorOutlineIcon fontSize="small" color="error" />}
                        {r.status === 'skipped' && <Typography variant="caption" color="text.disabled">skipped</Typography>}
                        {r.status === 'importing' && <LinearProgress sx={{ width: 60 }} />}
                        {r.parsed.warnings.length > 0 && r.status !== 'error' && (
                          <Tooltip title={r.parsed.warnings.join('\n')}>
                            <WarningAmberIcon fontSize="small" color="warning" />
                          </Tooltip>
                        )}
                        <Typography variant="caption" color="text.secondary">{r.message || ''}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      {r.importedProjectId && (
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/calcsheet/projects/${r.importedProjectId}`)}
                          title="Open imported project"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      {rows.length === 0 && (
        <Alert severity="info" icon={<HistoryIcon />}>
          Click <strong>Choose folder</strong> and pick either one project folder
          (e.g. <code>PCS2602001-ICI ...</code>) or the whole <code>IO Proposal</code> folder.
          The parser auto-detects each workbook's <code>/Offer/*.pdf</code> and pre-checks the
          IOCT/ACTI kinds when at least one PDF is found.
        </Alert>
      )}
    </Stack>
  );
}
