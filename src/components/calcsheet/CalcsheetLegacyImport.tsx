import { useRef, useState } from 'react';
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
import type { ParsedProject, ParsedQuotation } from '../../utils/calcsheet/legacyImport';
import { parseLegacyPdf } from '../../utils/calcsheet/legacyPdfImport';
import type { ParsedLegacyPdf } from '../../utils/calcsheet/legacyPdfImport';
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
  // Per-kind VAT inclusion. true = use the workbook/PDF's VAT-IN grand total
  // as-is; false = drop VAT and use the VAT-EX subtotal as the grand total.
  // Defaults reflect whether a non-zero VAT line was found in the source.
  includeVatIOCT: boolean;
  includeVatACTI: boolean;
  status: RowStatus;
  message?: string;
  effectiveCode: string;
  reassigned: boolean;
  importedProjectId?: string;
  // PDFs with their detected issuer kind (from letterhead text)
  classifiedPdfs: PdfClassified[];
  // True when the row was built from PDF parses (no xlsx) — line items
  // intentionally empty, snapshot is the source of truth.
  pdfOnly?: boolean;
}

// Shim a ParsedLegacyPdf (or two — one per kind) into the ParsedProject shape
// the importer already understands, so PDF-only folders flow through the same
// preview/import path as workbooks.
function pdfsToParsedProject(
  pdfs: ParsedLegacyPdf[],
  folderName: string,
): ParsedProject {
  // Prefer the most-complete PDF for project-level metadata: highest grand total
  // tends to be the issued one; ties broken by issuer-known-over-unknown.
  const sorted = [...pdfs].sort((a, b) => {
    const ka = a.kind === 'unknown' ? 0 : 1;
    const kb = b.kind === 'unknown' ? 0 : 1;
    if (ka !== kb) return kb - ka;
    return b.grandTotal - a.grandTotal;
  });
  const meta = sorted[0];

  const toQuotation = (pdf: ParsedLegacyPdf, kind: 'IOCT' | 'ACTI'): ParsedQuotation => ({
    kind,
    revision: pdf.revision || '00',
    recipientCode: '',
    paymentTerms: pdf.paymentTerms,
    deliveryTerms: pdf.deliveryTerms,
    validityDays: pdf.validityDays,
    warrantyMonths: pdf.warrantyMonths,
    preparedBy: '',
    authorizedBy: pdf.authorizedBy,
    productMarkupPct: 0,
    laborMarkupPct: 0,
    generalReqMarkupPct: 0,
    globalContingencyPct: 0,
    discountPct: 0,
    vatPct: pdf.vatPct,
    generalReqts: [],
    components: [],
    services: [],
    manpower: [],
    servicesFromManpower: true,
    legacyTotalsSnapshot: {
      generalReqtsCost: pdf.sectionA,
      generalReqtsWithContingency: pdf.sectionA,
      generalReqtsSubtotal: pdf.sectionA,
      componentsCost: pdf.sectionB,
      componentsSubtotal: pdf.sectionB,
      laborCost: pdf.sectionC,
      laborWithContingency: pdf.sectionC,
      servicesSubtotal: pdf.sectionC,
      subtotal: pdf.subtotal,
      discount: 0,
      vat: pdf.vat,
      grandTotal: pdf.grandTotal,
    },
  });

  const quotations: ParsedQuotation[] = [];
  for (const k of ['IOCT', 'ACTI'] as const) {
    const match = pdfs.find((p) => p.kind === k);
    if (match) quotations.push(toQuotation(match, k));
  }

  // Derive code parts from the metadata PDF's refCode when possible.
  const refMatch = meta.refCode.match(/^(PCS(\d{4})(\d{3}))-([A-Z&]{2,4})-(\d{2})$/);
  const yymm = refMatch ? refMatch[2] : '';
  const seq = refMatch ? parseInt(refMatch[3], 10) : 0;
  const clientCode = refMatch ? refMatch[4] : '';

  const warnings: string[] = ['PDF-only import — line items not extracted; snapshot totals from PDF Summary block.'];
  if (pdfs.some((p) => p.kind === 'unknown')) warnings.push('One or more PDFs had unknown issuer (letterhead unrecognized).');
  for (const p of pdfs) warnings.push(...p.warnings);

  return {
    originalCode: meta.refCode,
    baseCode: meta.baseCode,
    yymm,
    seqFromOriginal: seq,
    clientCode,
    revision: meta.revision || '00',
    projectName: meta.projectName,
    date: meta.date || new Date().toISOString().slice(0, 10),
    customer: {
      code: '',
      name: meta.recipientName,
      contact: meta.recipientContact,
      email: meta.recipientEmail,
      phone: '',
      address: meta.recipientAddress,
      gender: '',
      paymentTerms: meta.paymentTerms,
    },
    quotations,
    warnings,
    sourceFile: pdfs.map((p) => p.sourceFile).join(', '),
    offerPdfs: pdfs.map((p) => p.sourceFile),
    projectFolder: folderName,
  };
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
  // Drag-and-drop state — page-wide overlay
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Recursively walk a dropped FileSystemEntry (folder or file) and produce a
  // flat list of Files whose `webkitRelativePath` reflects the original folder
  // structure, matching what the <input webkitdirectory> picker produces. This
  // is what `groupByProjectFolder` expects.
  const readEntries = (dirReader: any): Promise<any[]> => new Promise((resolve) => {
    const all: any[] = [];
    const readBatch = () => {
      dirReader.readEntries((entries: any[]) => {
        if (entries.length === 0) resolve(all);
        else { all.push(...entries); readBatch(); }
      });
    };
    readBatch();
  });
  const collectFromEntry = async (entry: any, prefix = ''): Promise<File[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      // Patch in webkitRelativePath so downstream grouping works.
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: `${prefix}${entry.name}`,
          configurable: true,
        });
      } catch { /* some browsers freeze File; fall back to plain name */ }
      return [file];
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await readEntries(reader);
      const out: File[] = [];
      for (const child of children) {
        const sub = await collectFromEntry(child, `${prefix}${entry.name}/`);
        out.push(...sub);
      }
      return out;
    }
    return [];
  };

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
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    const items = Array.from(e.dataTransfer.items || []);
    // Prefer entries (preserves folder structure); fall back to plain files.
    const all: File[] = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = typeof (item as any).webkitGetAsEntry === 'function'
        ? (item as any).webkitGetAsEntry()
        : null;
      if (entry) {
        const files = await collectFromEntry(entry);
        all.push(...files);
      } else {
        const f = item.getAsFile();
        if (f) all.push(f);
      }
    }
    if (all.length === 0 && e.dataTransfer.files?.length) {
      all.push(...Array.from(e.dataTransfer.files));
    }
    if (all.length === 0) return;
    await onPick(all);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await onPick(Array.from(files));
  };
  const onPick = async (fileArr: File[]) => {
    if (!fileArr || fileArr.length === 0) return;
    setParsing(true);
    const next: PreviewRow[] = [];
    const existingCodes = projects.map((p) => p.code);
    let nextSeq = nextProjectSequence(existingCodes);
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

      // Detect issuer kind for each PDF (letterhead text on page 1). We do this
      // up-front so the result is available for both the xlsx-driven flow
      // (auto-checking IOCT/ACTI checkboxes) and the PDF-only fallback.
      const classifiedPdfs: PdfClassified[] = [];
      for (const pdfFile of pdfFileObjs) {
        const issuer = await detectIssuerFromPdf(pdfFile);
        classifiedPdfs.push({ filename: pdfFile.name, issuer });
      }
      const detectedKinds = new Set(classifiedPdfs.map((p) => p.issuer));
      const hasIoctPdf = detectedKinds.has('IOCT');
      const hasActiPdf = detectedKinds.has('ACTI');
      const hasUnknownPdf = detectedKinds.has('unknown');

      // PDF-only fallback: no xlsx (or none usable) but the folder has at
      // least one Offer PDF. Parse each PDF for header + Summary-block
      // totals and synthesize a ParsedProject so the row flows through the
      // same preview/import path as workbook rows.
      if (xlsxFiles.length === 0) {
        if (pdfFileObjs.length === 0) continue; // truly nothing to import
        const parsedPdfs: ParsedLegacyPdf[] = [];
        for (const f of pdfFileObjs) {
          try {
            const pdf = await parseLegacyPdf(f);
            // Override the detected kind with the up-front classification when
            // parseLegacyPdf came back as 'unknown' but classifyByLetterhead
            // saw something.
            const classified = classifiedPdfs.find((c) => c.filename === f.name);
            if (pdf.kind === 'unknown' && classified && classified.issuer !== 'unknown') {
              pdf.kind = classified.issuer;
            }
            parsedPdfs.push(pdf);
          } catch (err: any) {
            // Continue — other PDFs in the folder may still work.
          }
        }
        if (parsedPdfs.length === 0) continue;
        const parsed = pdfsToParsedProject(parsedPdfs, folderName);

        // Code resolution (same logic as the xlsx path).
        let effectiveCode = parsed.originalCode;
        let reassigned = false;
        const reconstructed = parsed.yymm && parsed.seqFromOriginal && parsed.clientCode
          ? assignLegacyCode(parsed.yymm, parsed.seqFromOriginal, parsed.clientCode, parsed.revision || '00')
          : null;
        if (isPCSCode(parsed.originalCode)) {
          effectiveCode = parsed.originalCode;
        } else if (reconstructed && isPCSCode(reconstructed)) {
          effectiveCode = reconstructed;
          reassigned = true;
          parsed.warnings.push(`Recovered code from PDF refNo: ${parsed.originalCode} → ${effectiveCode}`);
        } else {
          const yymm = parsed.yymm || '0000';
          effectiveCode = assignLegacyCode(yymm, nextSeq, parsed.clientCode, parsed.revision || '00');
          nextSeq += 1;
          reassigned = true;
          parsed.warnings.push(`Reassigned code (next seq): ${parsed.originalCode || '(none)'} → ${effectiveCode}`);
        }

        const ioctPq = parsed.quotations.find((q) => q.kind === 'IOCT');
        const actiPq = parsed.quotations.find((q) => q.kind === 'ACTI');
        next.push({
          filename: parsedPdfs.map((p) => p.sourceFile).join(', '),
          parsed,
          selectIOCT: !!ioctPq,
          selectACTI: !!actiPq,
          includeVatIOCT: (ioctPq?.legacyTotalsSnapshot.vat ?? 0) > 0,
          includeVatACTI: (actiPq?.legacyTotalsSnapshot.vat ?? 0) > 0,
          status: 'pending',
          effectiveCode,
          reassigned,
          classifiedPdfs,
          pdfOnly: true,
        });
        continue; // done with this folder
      }

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

          const ioctPq = parsed.quotations.find((q) => q.kind === 'IOCT');
          const actiPq = parsed.quotations.find((q) => q.kind === 'ACTI');
          next.push({
            filename: xlsxFile.name,
            parsed,
            // Pre-check based on what the PDF letterheads say. If all PDFs are 'unknown',
            // fall back to checking both so the user can decide.
            selectIOCT: hasIoctPdf || (hasUnknownPdf && !hasActiPdf),
            selectACTI: hasActiPdf || (hasUnknownPdf && !hasIoctPdf),
            // Default VAT inclusion follows the workbook: if the parsed VAT
            // line is > 0, default to including it (VAT-IN total).
            includeVatIOCT: (ioctPq?.legacyTotalsSnapshot.vat ?? 0) > 0,
            includeVatACTI: (actiPq?.legacyTotalsSnapshot.vat ?? 0) > 0,
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
            includeVatIOCT: false,
            includeVatACTI: false,
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

  const toggleIncludeVat = (idx: number, kind: 'IOCT' | 'ACTI') => {
    setRows((rs) => rs.map((r, i) => {
      if (i !== idx) return r;
      return kind === 'IOCT' ? { ...r, includeVatIOCT: !r.includeVatIOCT } : { ...r, includeVatACTI: !r.includeVatACTI };
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
      .map((q) => {
        // Honor the per-kind "Include VAT" toggle: when off, zero out VAT and
        // recompute the grand total as (subtotal − discount). Snapshot is the
        // source of truth for legacy quotations.
        const includeVat = q.kind === 'IOCT' ? row.includeVatIOCT : row.includeVatACTI;
        const snap = q.legacyTotalsSnapshot;
        const snapshot = includeVat ? snap : {
          ...snap,
          vat: 0,
          grandTotal: Math.max(0, snap.subtotal - snap.discount),
        };
        return {
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
          vatPct: includeVat ? q.vatPct : 0,
          generalReqts: q.generalReqts,
          components: q.components,
          services: q.services,
          manpower: q.manpower,
          servicesFromManpower: q.servicesFromManpower,
          preparedBy: q.preparedBy,
          authorizedBy: q.authorizedBy,
          legacyTotalsSnapshot: snapshot,
          importedFrom: {
            sourceFile: row.filename,
            importedAt: new Date().toISOString(),
            originalCode: row.parsed.originalCode,
            pdfFilename: pdfForKind(q.kind),
          },
        };
      });

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
          <Paper elevation={6} sx={{ p: 4, textAlign: 'center', maxWidth: 480 }}>
            <UploadFileIcon sx={{ fontSize: 56, color: 'warning.main', mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Drop to import as legacy</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Drop a project folder, the whole <code>IO Proposal</code> folder, or individual
              <strong> .xlsx / .pdf</strong> files. Folder structure is preserved and PDF
              letterheads are auto-classified IOCT/ACTI.
            </Typography>
          </Paper>
        </Box>
      )}
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
              onChange={(e) => onPickFiles(e.target.files)}
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
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {r.effectiveCode}
                          </Typography>
                          {r.pdfOnly && (
                            <Chip
                              size="small"
                              icon={<PictureAsPdfIcon sx={{ fontSize: '0.7rem' }} />}
                              label="PDF only"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-icon': { ml: 0.25 } }}
                            />
                          )}
                        </Stack>
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
                    {(['IOCT', 'ACTI'] as const).map((k) => {
                      const pq = k === 'IOCT' ? ioct : acti;
                      const checked = k === 'IOCT' ? r.selectIOCT : r.selectACTI;
                      const includeVat = k === 'IOCT' ? r.includeVatIOCT : r.includeVatACTI;
                      const snap = pq?.legacyTotalsSnapshot;
                      const hasVat = (snap?.vat ?? 0) > 0;
                      const liveTotal = !snap ? 0
                        : (includeVat ? snap.grandTotal : Math.max(0, snap.subtotal - snap.discount));
                      return (
                        <TableCell key={k} padding="checkbox" align="center">
                          <Stack alignItems="center" spacing={0.25}>
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={() => toggleKind(idx, k)}
                              disabled={disabled || !pq}
                            />
                            {pq && (
                              <>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem', lineHeight: 1 }}>
                                  {PHP(liveTotal)}
                                </Typography>
                                <Tooltip
                                  title={hasVat
                                    ? `VAT-EX ${PHP(Math.max(0, snap!.subtotal - snap!.discount))} · VAT ${PHP(snap!.vat)} · VAT-IN ${PHP(snap!.grandTotal)}`
                                    : 'No VAT in source — already VAT-EX'}
                                >
                                  <FormControlLabel
                                    sx={{ m: 0, '& .MuiTypography-root': { fontSize: '0.6rem', lineHeight: 1 } }}
                                    control={
                                      <Switch
                                        size="small"
                                        checked={includeVat}
                                        onChange={() => toggleIncludeVat(idx, k)}
                                        disabled={disabled || !checked || !hasVat}
                                        sx={{ transform: 'scale(0.7)' }}
                                      />
                                    }
                                    label={
                                      <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                                        {includeVat ? 'incl. VAT' : 'VAT-EX'}
                                      </Typography>
                                    }
                                  />
                                </Tooltip>
                              </>
                            )}
                          </Stack>
                        </TableCell>
                      );
                    })}
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
          Click <strong>Choose folder</strong> or just <strong>drag-and-drop</strong> a project
          folder (e.g. <code>PCS2602001-ICI ...</code>), the whole <code>IO Proposal</code>
          folder, or individual <code>.xlsx</code> / <code>.pdf</code> files. The parser
          auto-detects each workbook's <code>/Offer/*.pdf</code> and pre-checks IOCT/ACTI based
          on letterhead. Folders without a workbook fall back to PDF-only import (snapshot
          totals only, no line items).
        </Alert>
      )}
    </Stack>
    </Box>
  );
}
