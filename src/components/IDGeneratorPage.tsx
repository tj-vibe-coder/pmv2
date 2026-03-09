import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
  Checkbox,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Visibility as VisibilityIcon,
  Image as ImageIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import JsBarcode from 'jsbarcode';
import JSZip from 'jszip';
import PdfPreviewDialog from './PdfPreviewDialog';

const BLUE = '#1a6fb5';
const FONT = 'Arial,Helvetica,sans-serif';
const BACK_FONT = 'Arial Narrow,Arial,sans-serif';
const BAR_HEIGHT = 5;
const BAR_FONT_SIZE = 2.7;

/** Landscape CR80: 85.6 × 53.98 mm */
const W = 85.6;
const H = 53.98;

type CompanyKey = 'ACTI' | 'IOCT';

const COMPANY_PRESETS: Record<CompanyKey, { name: string; logo: string; address: string; tin: string }> = {
  ACTI: {
    name: 'Advance Controle Technologie Inc',
    logo: '/logo-acti.png',
    address: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite',
    tin: '008-133-926-000',
  },
  IOCT: {
    name: 'IO Control Technologie OPC',
    logo: '/logo-ioct.png',
    address: 'B63, L7 Dynamism Jubilation Enclave, Santo Niño, City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
    tin: '697-029-976-00000',
  },
};

const DEFAULT_ID = {
  idNumber: '',
  fullName: '',
  phone: '',
  email: '',
  position: '',
  issuedDate: '',
  expiredDate: '',
  bloodType: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  sssNo: '',
  philHealthNo: '',
  pagIbigNo: '',
  employeeTin: '',
  companyName: COMPANY_PRESETS.ACTI.name,
  companyAddress: COMPANY_PRESETS.ACTI.address,
  companyPhone: '',
  companyWebsite: '',
  companyTin: COMPANY_PRESETS.ACTI.tin,
  termsText:
    'This card is the property of the company. If found, please return to the address listed. This card must be worn visibly at all times while on company premises.',
  photoDataUrl: '',
  signatureDataUrl: '',
};

function resizeImage(dataUrl: string, maxDim: number, asJpeg = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(asJpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function cropSquare(dataUrl: string, maxPx = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const px = Math.min(maxPx, side);
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas')); return; }
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, px, px);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed'));
    img.src = dataUrl;
  });
}

function generateBarcodeSvg(text: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  try {
    JsBarcode(svg, text || '0', { format: 'CODE128', width: 2, height: 30, displayValue: false });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return '';
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if (cur.length + word.length + 1 > maxChars) {
      if (cur) lines.push(cur);
      cur = word;
    } else {
      cur = cur ? cur + ' ' + word : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type IdFormData = typeof DEFAULT_ID;

async function loadLogoForCompany(company: CompanyKey): Promise<string | null> {
  try {
    const { loadLogoTransparentBackground } = await import('../utils/logoUtils');
    const logoPath = COMPANY_PRESETS[company].logo;
    const url = `${process.env.PUBLIC_URL || ''}${logoPath}`;
    const transparent = await loadLogoTransparentBackground(url);
    return await resizeImage(transparent, 200, false);
  } catch { return null; }
}

function buildFrontSvgFor(data: IdFormData, logoDataUrl: string | null, photoImg: string | null): string {
  const clip = 'cF' + Math.random().toString(36).slice(2, 7);
  const photoClip = 'pF' + Math.random().toString(36).slice(2, 7);
  const barH = BAR_HEIGHT;

  const photoSize = 20;
  const photoX = 5;
  const photoY = 15;
  const photoCx = photoX + photoSize / 2;
  const photoCy = photoY + photoSize / 2;
  const photoEl = photoImg
    ? `<defs><clipPath id="${photoClip}"><circle cx="${photoCx}" cy="${photoCy}" r="${photoSize / 2}"/></clipPath></defs>
       <g clip-path="url(#${photoClip})"><image href="${photoImg}" xlink:href="${photoImg}" x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" preserveAspectRatio="xMidYMid slice"/></g>
       <circle cx="${photoCx}" cy="${photoCy}" r="${photoSize / 2}" fill="none" stroke="#ccc" stroke-width="0.25"/>`
    : `<circle cx="${photoCx}" cy="${photoCy}" r="${photoSize / 2}" fill="#f5f5f5" stroke="#ccc" stroke-width="0.25"/>
       <text x="${photoCx}" y="${photoCy - 0.5}" fill="#bbb" font-size="2.5" text-anchor="middle" font-family="${FONT}">1X1</text>
       <text x="${photoCx}" y="${photoCy + 2}" fill="#bbb" font-size="2.5" text-anchor="middle" font-family="${FONT}">Picture</text>`;

  const logoEl = logoDataUrl
    ? `<image href="${logoDataUrl}" xlink:href="${logoDataUrl}" x="${W - 20}" y="1" width="18" height="10" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  const infoX = 35;
  const nameText = (data.fullName || 'NAME SURNAME').toUpperCase();
  const nameLen = nameText.length;
  const nameFontSize = nameLen > 26 ? 2.8 : nameLen > 20 ? 3.2 : 3.8;

  const idNum = data.idNumber || '000 000 000';
  const issuedY = 28;
  const expiresY = 31;
  const dateFont = 1.6;
  const idLineEl = `<text x="${infoX}" y="${issuedY}" fill="#444" font-size="${dateFont}" font-family="${BACK_FONT}">ISSUED: ${esc(data.issuedDate || 'MM/DD/YYYY')}</text>
  <text x="${infoX}" y="${expiresY}" fill="#444" font-size="${dateFont}" font-family="${BACK_FONT}">EXPIRES: ${esc(data.expiredDate || 'MM/DD/YYYY')}</text>`;

  const barcodeSvg = generateBarcodeSvg(data.idNumber || '0');
  const barcodeInner = barcodeSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  const barcodeRawW = parseFloat((barcodeSvg.match(/width="([\d.]+)"/) || ['', '200'])[1]);
  const barcodeRawH = parseFloat((barcodeSvg.match(/height="([\d.]+)"/) || ['', '30'])[1]);
  const targetBW = 20;
  const targetBH = 5.5;
  const barcodeScale = Math.min(targetBW / barcodeRawW, targetBH / barcodeRawH);
  const barcodeW = barcodeRawW * barcodeScale;
  const barcodeH = barcodeRawH * barcodeScale;
  const barcodeX = photoX;
  const barcodeY = photoY + photoSize + 2.5;
  const barcodeEl = barcodeInner
    ? `<g transform="translate(${barcodeX}, ${barcodeY}) scale(${barcodeScale.toFixed(5)})">${barcodeInner}</g>` : '';
  const barcodeNumY = barcodeY + barcodeH + 2;
  const barcodeNumEl = `<text x="${barcodeX + barcodeW / 2}" y="${barcodeNumY}" fill="#444" font-size="${dateFont}" text-anchor="middle" font-family="${BACK_FONT}">${esc(idNum)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
   width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<defs><clipPath id="${clip}"><rect width="${W}" height="${H}" rx="2"/></clipPath></defs>
<g clip-path="url(#${clip})">
  <rect width="${W}" height="${H}" fill="white"/>
  ${logoEl}
  ${photoEl}
  <text x="${infoX}" y="20" fill="#222" font-size="${nameFontSize}" font-weight="bold" font-family="${BACK_FONT}">${esc(nameText)}</text>
  <text x="${infoX}" y="24" fill="#222" font-size="2.2" font-weight="bold" font-family="${BACK_FONT}">${esc((data.position || 'Designation').toUpperCase())}</text>
  ${idLineEl}
  ${barcodeEl}
  ${barcodeNumEl}
  <rect y="${H - barH}" width="${W}" height="${barH}" fill="${BLUE}"/>
  <text x="4" y="${H - barH / 2 + 1.2}" fill="white" font-size="${BAR_FONT_SIZE}" font-weight="bold" font-family="${BACK_FONT}">${esc(data.companyName || '')}</text>
</g>
</svg>`;
}

function buildBackSvgFor(data: IdFormData, logoDataUrl: string | null, signatureImg: string | null): string {
  const clip = 'cB' + Math.random().toString(36).slice(2, 7);
  const barH = BAR_HEIGHT;

  const logoEl = logoDataUrl
    ? `<image href="${logoDataUrl}" xlink:href="${logoDataUrl}" x="${W / 2 - 6}" y="2" width="12" height="10" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const lineH = 2;
  const companyEl = `<text x="${W / 2}" y="15" fill="#222" font-size="3.2" font-weight="bold" text-anchor="middle" font-family="${BACK_FONT}">${esc(data.companyName || '')}</text>`;

  const addrLines = wrapText(data.companyAddress || '', 55);
  const addrStartY = 16.8;
  const addrEls = addrLines.slice(0, 2).map((line, i) =>
    `<text x="${W / 2}" y="${addrStartY + i * lineH}" fill="#444" font-size="1.9" text-anchor="middle" font-family="${BACK_FONT}">${esc(line)}</text>`
  ).join('\n');

  const tinY = addrStartY + addrLines.slice(0, 2).length * lineH;
  const tinEl = data.companyTin
    ? `<text x="${W / 2}" y="${tinY}" fill="#444" font-size="1.9" text-anchor="middle" font-family="${BACK_FONT}">TIN # ${esc(data.companyTin)}</text>`
    : '';

  const contactParts: string[] = [];
  if (data.companyPhone) contactParts.push(data.companyPhone);
  if (data.companyWebsite) contactParts.push(data.companyWebsite);
  const contactY = tinY + (data.companyTin ? lineH : 0) + 1;
  const contactEl = contactParts.length
    ? `<text x="${W / 2}" y="${contactY}" fill="#444" font-size="1.9" text-anchor="middle" font-family="${BACK_FONT}">${esc(contactParts.join('  |  '))}</text>`
    : '';

  const empStartY = contactY + (contactParts.length ? 1.8 : 1);
  const empLineH = 2.2;
  const empInfoEl = `<text x="${W / 2}" y="${empStartY}" fill="#444" font-size="1.9" text-anchor="middle" font-family="${BACK_FONT}">Email: ${esc(data.email || '')}</text>
  <text x="${W / 2}" y="${empStartY + empLineH}" fill="#444" font-size="1.9" text-anchor="middle" font-family="${BACK_FONT}">Contact #: ${esc(data.phone || '+000 000 000')}</text>`;

  const sigAreaY = empStartY + empLineH * 2 + 1;
  const sigW = 30;
  const sigH = 9;
  const sigX = W / 2 - sigW / 2;
  const signatureEl = signatureImg
    ? `<image href="${signatureImg}" xlink:href="${signatureImg}" x="${sigX}" y="${sigAreaY}" width="${sigW}" height="${sigH}" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const sigLineY = sigAreaY + sigH + 0.3;
  const sigLabelY = sigLineY + 1.8;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
   width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<defs><clipPath id="${clip}"><rect width="${W}" height="${H}" rx="2"/></clipPath></defs>
<g clip-path="url(#${clip})">
  <rect width="${W}" height="${H}" fill="white"/>
  ${logoEl}
  ${companyEl}
  ${addrEls}
  ${tinEl}
  ${contactEl}
  ${empInfoEl}
  ${signatureEl}
  <line x1="${sigX}" y1="${sigLineY}" x2="${sigX + sigW}" y2="${sigLineY}" stroke="#333" stroke-width="0.3"/>
  <text x="${W / 2}" y="${sigLabelY}" fill="#555" font-size="2" text-anchor="middle" font-family="${BACK_FONT}">Employee Signature</text>
  <rect y="${H - barH}" width="${W}" height="${barH}" fill="${BLUE}"/>
  <text x="4" y="${H - barH / 2 + 1.2}" fill="white" font-size="${BAR_FONT_SIZE}" font-weight="bold" font-family="${BACK_FONT}">${esc(data.companyName || '')}</text>
</g>
</svg>`;
}

const SAVED_IDS_KEY = 'savedIdCards';

const ID_SEQ_KEY_PREFIX = 'idGenerator_lastSeq_';

function getNextIdNumber(company: CompanyKey): string {
  const key = ID_SEQ_KEY_PREFIX + company;
  try {
    const raw = localStorage.getItem(key);
    const next = (raw ? parseInt(raw, 10) : 0) + 1;
    localStorage.setItem(key, String(next));
    const prefix = company === 'IOCT' ? 'IOCT' : 'ACTI';
    return `${prefix}-${String(next).padStart(3, '0')}`;
  } catch {
    return company === 'IOCT' ? 'IOCT-001' : 'ACTI-001';
  }
}

interface SavedIdRecord {
  id: string;
  savedAt: string;
  company: CompanyKey;
  form: typeof DEFAULT_ID;
}

function loadSavedIds(): SavedIdRecord[] {
  try {
    const raw = localStorage.getItem(SAVED_IDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function persistSavedIds(list: SavedIdRecord[]): boolean {
  try {
    localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    const isQuota = e instanceof DOMException && (e.code === 22 || e.name === 'QuotaExceededError');
    console.warn('Could not save IDs to localStorage', isQuota ? '(storage full)' : '', e);
    return false;
  }
}

/** Shrink photo/signature for storage to avoid localStorage quota (export still uses these so keep decent size). */
async function prepareFormForStorage(form: typeof DEFAULT_ID): Promise<typeof DEFAULT_ID> {
  let photo = form.photoDataUrl;
  let signature = form.signatureDataUrl;
  if (photo) {
    try { photo = await cropSquare(photo, 280); } catch { /* keep original */ }
  }
  if (signature) {
    try { signature = await resizeImage(signature, 200, false); } catch { /* keep original */ }
  }
  return { ...form, photoDataUrl: photo, signatureDataUrl: signature };
}

const IDGeneratorPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(DEFAULT_ID);
  const [selectedCompany, setSelectedCompany] = useState<CompanyKey>('ACTI');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<SavedIdRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'warning' }>({ open: false, message: '', severity: 'success' });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  useEffect(() => { setSavedIds(loadSavedIds()); }, []);

  const update = (field: keyof typeof DEFAULT_ID, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCompanyChange = (key: CompanyKey) => {
    setSelectedCompany(key);
    const preset = COMPANY_PRESETS[key];
    setForm((prev) => ({
      ...prev,
      companyName: preset.name,
      companyAddress: preset.address,
      companyTin: preset.tin,
    }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('photoDataUrl', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('signatureDataUrl', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const list = loadSavedIds();
    const formToStore = await prepareFormForStorage(form);
    if (editingId) {
      const idx = list.findIndex((r) => r.id === editingId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], savedAt: new Date().toISOString(), company: selectedCompany, form: formToStore };
      }
    } else {
      const record: SavedIdRecord = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        savedAt: new Date().toISOString(),
        company: selectedCompany,
        form: formToStore,
      };
      list.unshift(record);
      setEditingId(record.id);
    }
    const ok = persistSavedIds(list);
    setSavedIds(list);
    if (ok) {
      setSnack({ open: true, message: `ID for "${form.fullName || 'Unnamed'}" saved.`, severity: 'success' });
    } else {
      setSnack({ open: true, message: 'Save failed (browser storage may be full). Try removing some saved IDs or use smaller photos/signatures.', severity: 'warning' });
    }
  };

  const handleLoadSaved = (record: SavedIdRecord) => {
    setForm(record.form);
    setSelectedCompany(record.company);
    setEditingId(record.id);
    setSnack({ open: true, message: `Loaded "${record.form.fullName || 'Unnamed'}".`, severity: 'info' });
  };

  const handleDeleteSaved = (id: string) => {
    const list = loadSavedIds().filter((r) => r.id !== id);
    persistSavedIds(list);
    setSavedIds(list);
    if (editingId === id) setEditingId(null);
    setSnack({ open: true, message: 'Saved ID deleted.', severity: 'warning' });
  };

  const handleNew = () => {
    const nextId = getNextIdNumber(selectedCompany);
    setForm({ ...DEFAULT_ID, idNumber: nextId });
    setSelectedCompany(selectedCompany);
    setEditingId(null);
  };

  const handleGenerateId = () => {
    update('idNumber', getNextIdNumber(selectedCompany));
  };

  const toggleRecordSelection = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRecordIds.size === savedIds.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(savedIds.map((r) => r.id)));
    }
  };

  const handleExportSelected = async () => {
    const selected = savedIds.filter((r) => selectedRecordIds.has(r.id));
    if (!selected.length) return;

    setExporting(true);
    try {
      const [actiLogo, ioctLogo] = await Promise.all([
        loadLogoForCompany('ACTI'),
        loadLogoForCompany('IOCT'),
      ]);

      const zip = new JSZip();
      const actiFolder = zip.folder('ACTI')!;
      const ioctFolder = zip.folder('IOCT')!;

      for (const rec of selected) {
        let photoImg: string | null = null;
        if (rec.form.photoDataUrl) {
          try { photoImg = await cropSquare(rec.form.photoDataUrl, 600); } catch { /* skip */ }
        }
        let sigImg: string | null = null;
        if (rec.form.signatureDataUrl) {
          try { sigImg = await resizeImage(rec.form.signatureDataUrl, 300, false); } catch { /* skip */ }
        } else if ((rec.form.fullName || '').trim().toLowerCase() === 'tyrone james caballero') {
          try {
            const url = `${process.env.PUBLIC_URL || ''}/signature-tyrone-james-caballero.png`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(r.result as string);
              r.onerror = rej;
              r.readAsDataURL(blob);
            });
            sigImg = await resizeImage(dataUrl, 300, false);
          } catch { /* skip */ }
        }

        const safeName = (rec.form.fullName || 'Unnamed').replace(/\s+/g, '_');
        const actiPreset = COMPANY_PRESETS.ACTI;
        const ioctPreset = COMPANY_PRESETS.IOCT;

        const actiForm: IdFormData = { ...rec.form, companyName: actiPreset.name, companyAddress: actiPreset.address, companyTin: actiPreset.tin };
        const ioctForm: IdFormData = { ...rec.form, companyName: ioctPreset.name, companyAddress: ioctPreset.address, companyTin: ioctPreset.tin };

        actiFolder.file(`${safeName}_Front.svg`, buildFrontSvgFor(actiForm, actiLogo, photoImg));
        actiFolder.file(`${safeName}_Back.svg`, buildBackSvgFor(actiForm, actiLogo, sigImg));
        ioctFolder.file(`${safeName}_Front.svg`, buildFrontSvgFor(ioctForm, ioctLogo, photoImg));
        ioctFolder.file(`${safeName}_Back.svg`, buildBackSvgFor(ioctForm, ioctLogo, sigImg));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ID_Cards_${selected.length}_employees.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setSnack({ open: true, message: `Exported ${selected.length} employee(s) — ACTI + IOCT (front & back).`, severity: 'success' });
    } catch (err) {
      setSnack({ open: true, message: 'Export failed. See console for details.', severity: 'warning' });
      console.error('Batch export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const loadAssets = useCallback(async () => {
    const logoDataUrl = await loadLogoForCompany(selectedCompany);
    let photoImg: string | null = null;
    if (form.photoDataUrl) {
      try { photoImg = await cropSquare(form.photoDataUrl, 600); } catch { /* no photo */ }
    }
    let signatureImg: string | null = null;
    if (form.signatureDataUrl) {
      try { signatureImg = await resizeImage(form.signatureDataUrl, 300, false); } catch { /* no sig */ }
    } else if (
      (form.fullName || '').trim().toLowerCase() === 'tyrone james caballero'
    ) {
      try {
        const url = `${process.env.PUBLIC_URL || ''}/signature-tyrone-james-caballero.png`;
        const resp = await fetch(url);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        signatureImg = await resizeImage(dataUrl, 300, false);
      } catch { /* ignore */ }
    }
    return { logoDataUrl, photoImg, signatureImg };
  }, [form.photoDataUrl, form.signatureDataUrl, form.fullName, selectedCompany]);

  /* ── Handlers ── */
  const handlePreview = async () => {
    const { logoDataUrl, photoImg, signatureImg } = await loadAssets();
    const frontSvg = buildFrontSvgFor(form, logoDataUrl, photoImg);
    const backSvg = buildBackSvgFor(form, logoDataUrl, signatureImg);
    const strip = (s: string) => s.replace(/^<\?xml[^?]*\?>\s*/, '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const gap = 6;
    const totalH = H * 2 + gap + 10;
    const combined = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}mm" height="${totalH}mm" viewBox="0 0 ${W} ${totalH}">
  <text x="${W / 2}" y="4" fill="#bbb" font-size="2.5" text-anchor="middle" font-family="${FONT}">FRONT</text>
  <g transform="translate(0,6)">${strip(frontSvg)}</g>
  <text x="${W / 2}" y="${H + gap + 4}" fill="#bbb" font-size="2.5" text-anchor="middle" font-family="${FONT}">BACK</text>
  <g transform="translate(0,${H + gap + 6})">${strip(backSvg)}</g>
</svg>`;
    setPreviewBlob(new Blob([combined], { type: 'image/svg+xml' }));
    setPreviewTitle('ID Card Preview');
    setPreviewOpen(true);
  };

  const downloadSvg = (svg: string, filename: string) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFront = async () => {
    const { logoDataUrl, photoImg } = await loadAssets();
    downloadSvg(buildFrontSvgFor(form, logoDataUrl, photoImg), `ID_${(form.fullName || 'Card').replace(/\s+/g, '_')}_Front.svg`);
  };

  const handleExportBack = async () => {
    const { logoDataUrl, signatureImg } = await loadAssets();
    downloadSvg(buildBackSvgFor(form, logoDataUrl, signatureImg), `ID_${(form.fullName || 'Card').replace(/\s+/g, '_')}_Back.svg`);
  };

  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: -2, backgroundColor: '#f5f5f5' }}>
      <Box sx={{ flexShrink: 0, p: 2, borderBottom: '1px solid #e0e0e0', bgcolor: '#fff' }}>
        <Box display="flex" alignItems="center" mb={1}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
            ID Generator
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Generate employee ID cards (SVG, landscape CR80 85.6 × 53.98 mm). Front and back exported as separate files.
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Company Selection</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Company</InputLabel>
                <Select
                  value={selectedCompany}
                  label="Company"
                  onChange={(e) => handleCompanyChange(e.target.value as CompanyKey)}
                >
                  <MenuItem value="ACTI">ACTI — Advance Controle Technologie Inc</MenuItem>
                  <MenuItem value="IOCT">IOCT — IO Control Technologie OPC</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Employee Details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField fullWidth size="small" label="ID Number" value={form.idNumber} onChange={(e) => update('idNumber', e.target.value)} placeholder="e.g. IOCT-001" />
                <Button variant="outlined" size="small" onClick={handleGenerateId} sx={{ flexShrink: 0 }}>Generate</Button>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Full Name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="e.g. Clone James Caballeros" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Position / Designation" value={form.position} onChange={(e) => update('position', e.target.value)} placeholder="e.g. Technical Manager" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Contact #" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="e.g. +123-456-7890" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Email Address (shown on back)" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="e.g. name@company.com" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Issued (front)" value={form.issuedDate} onChange={(e) => update('issuedDate', e.target.value)} placeholder="e.g. 01/01/2023" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Expires (front)" value={form.expiredDate} onChange={(e) => update('expiredDate', e.target.value)} placeholder="e.g. 01/01/2025" />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth size="small" label="Blood Type" value={form.bloodType} onChange={(e) => update('bloodType', e.target.value)} placeholder="e.g. O+" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4.5 }}>
              <TextField fullWidth size="small" label="Emergency Contact Name" value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} placeholder="e.g. Juan Dela Cruz" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4.5 }}>
              <TextField fullWidth size="small" label="Emergency Contact #" value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} placeholder="e.g. 0917-123-4567" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="SSS No." value={form.sssNo} onChange={(e) => update('sssNo', e.target.value)} placeholder="e.g. 00-0000000-0" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="PhilHealth No." value={form.philHealthNo} onChange={(e) => update('philHealthNo', e.target.value)} placeholder="e.g. 00-000000000-0" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Pag-IBIG No." value={form.pagIbigNo} onChange={(e) => update('pagIbigNo', e.target.value)} placeholder="e.g. 0000-0000-0000" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Employee TIN" value={form.employeeTin} onChange={(e) => update('employeeTin', e.target.value)} placeholder="e.g. 000-000-000-000" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Photo</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'block' }} />
                {form.photoDataUrl && (
                  <>
                    <img src={form.photoDataUrl} alt="Preview" style={{ maxWidth: 64, maxHeight: 64, objectFit: 'cover', borderRadius: '50%' }} />
                    <Button size="small" onClick={() => update('photoDataUrl', '')}>Clear</Button>
                  </>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Signature (for back of ID)</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <input type="file" accept="image/*" onChange={handleSignatureChange} style={{ display: 'block' }} />
                {form.signatureDataUrl && (
                  <>
                    <img src={form.signatureDataUrl} alt="Signature" style={{ maxWidth: 100, maxHeight: 40, objectFit: 'contain' }} />
                    <Button size="small" onClick={() => update('signatureDataUrl', '')}>Clear</Button>
                  </>
                )}
              </Box>
            </Grid>
          </Grid>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 2 }}>Company</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Company Name" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Company Phone" value={form.companyPhone} onChange={(e) => update('companyPhone', e.target.value)} placeholder="+123-456-7890" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Website" value={form.companyWebsite} onChange={(e) => update('companyWebsite', e.target.value)} placeholder="www.company.com" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Address" value={form.companyAddress} onChange={(e) => update('companyAddress', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="TIN #" value={form.companyTin} onChange={(e) => update('companyTin', e.target.value)} placeholder="e.g. 000-000-000-000" />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} color="success">
              {editingId ? 'Update' : 'Save'}
            </Button>
            {editingId && (
              <Button variant="outlined" size="small" onClick={handleNew}>
                + New
              </Button>
            )}
            <Button variant="outlined" size="small" startIcon={<VisibilityIcon />} onClick={handlePreview}>
              Preview
            </Button>
            <Button variant="contained" size="small" startIcon={<ImageIcon />} onClick={handleExportFront} sx={{ bgcolor: BLUE, '&:hover': { bgcolor: '#1a4a8a' } }}>
              Export Front
            </Button>
            <Button variant="contained" size="small" startIcon={<ImageIcon />} onClick={handleExportBack} sx={{ bgcolor: BLUE, '&:hover': { bgcolor: '#1a4a8a' } }}>
              Export Back
            </Button>
          </Box>
        </Paper>

        {savedIds.length > 0 && (
          <Paper sx={{ p: 3, mt: 2, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Saved IDs ({savedIds.length})
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadIcon />}
                disabled={selectedRecordIds.size === 0 || exporting}
                onClick={handleExportSelected}
                sx={{ bgcolor: BLUE, '&:hover': { bgcolor: '#1a4a8a' } }}
              >
                {exporting ? 'Exporting...' : `Export Selected (${selectedRecordIds.size}) — ACTI + IOCT`}
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        indeterminate={selectedRecordIds.size > 0 && selectedRecordIds.size < savedIds.length}
                        checked={savedIds.length > 0 && selectedRecordIds.size === savedIds.length}
                        onChange={toggleSelectAll}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Photo</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>ID No.</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Position</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Company</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Saved</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {savedIds.map((rec) => (
                    <TableRow
                      key={rec.id}
                      hover
                      selected={selectedRecordIds.has(rec.id)}
                      sx={editingId === rec.id ? { bgcolor: '#e3f2fd' } : undefined}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedRecordIds.has(rec.id)}
                          onChange={() => toggleRecordSelection(rec.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        {rec.form.photoDataUrl ? (
                          <img src={rec.form.photoDataUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                        ) : (
                          <Box sx={{ width: 36, height: 36, bgcolor: '#f0f0f0', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" color="text.disabled">N/A</Typography>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>{rec.form.fullName || '—'}</TableCell>
                      <TableCell>{rec.form.idNumber || '—'}</TableCell>
                      <TableCell>{rec.form.position || '—'}</TableCell>
                      <TableCell>
                        <Chip label={rec.company} size="small" variant="outlined" color={rec.company === 'IOCT' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(rec.savedAt).toLocaleDateString()} {new Date(rec.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Load">
                          <IconButton size="small" onClick={() => handleLoadSaved(rec)} color="primary">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDeleteSaved(rec.id)} color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>

      <PdfPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} pdfBlob={previewBlob} title={previewTitle} />
    </Box>
  );
};

export default IDGeneratorPage;
