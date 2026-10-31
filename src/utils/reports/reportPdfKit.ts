/**
 * Shared jsPDF layout kit for the project reports (Certificate of Completion,
 * Delivery Receipt, Progress Report) so all three share one letterhead,
 * typography, table style, signature block and footer.
 *
 * Page model (A4, mm): content flows between CONTENT_TOP and CONTENT_BOTTOM on
 * every page. The letterhead and the "Doc. No. / Page X of Y" footer are drawn
 * in a final pass (`finish`) once the page count is known, so nothing the
 * content does can collide with them.
 */
import jsPDF from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';

export type RGB = [number, number, number];

// Plain business-document palette: all text black, tables in greys.
export const REPORT_COLORS = {
  ink: [0, 0, 0] as RGB,
  rule: [150, 150, 150] as RGB,
  headFill: [217, 217, 217] as RGB,
  groupFill: [242, 242, 242] as RGB,
  totalFill: [217, 217, 217] as RGB,
};

export const PAGE = {
  width: 210,
  height: 297,
  margin: 16,
  contentTop: 42,
  contentBottom: 276,
};
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export type ReportCompanyKey = 'IOCT' | 'ACT';

export interface ReportIssuer {
  name: string;
  addressLines: string[];
  tin?: string;
  /** Public path of the logo; the caller loads it (browser) and passes the data URL in. */
  logoFile: string;
  /** Logo has a dark background that must be knocked out (see logoUtils.loadLogoTransparentBackground). */
  logoNeedsBgRemoval: boolean;
  logoWidth: number;
  logoHeight: number;
}

export const REPORT_ISSUERS: Record<ReportCompanyKey, ReportIssuer> = {
  IOCT: {
    name: 'IO Control Technologie OPC',
    addressLines: [
      'B63, L7 Dynamism Jubilation Enclave, Santo Niño,',
      'City of Biñan, Laguna, Region IV-A (Calabarzon), 4024',
    ],
    tin: 'TIN: 697-029-976-00000',
    logoFile: '/logo-ioct-only.png',
    logoNeedsBgRemoval: false,
    logoWidth: 18,
    logoHeight: 18,
  },
  ACT: {
    name: 'Advance Controle Technologie Inc',
    addressLines: [
      'Blk. 13 Lot 5, Mindanao Ave., Gavino Maderan,',
      'General Mariano Alvarez, Cavite 4117, Philippines',
    ],
    logoFile: '/logo-acti.png',
    logoNeedsBgRemoval: true,
    logoWidth: 24,
    logoHeight: 14.8,
  },
};

export interface ReportSigner {
  /** Caption above the signature line, e.g. "Prepared by". */
  label: string;
  name?: string;
  designation?: string;
  company?: string;
  /** Extra lines such as Date / Place; an empty value prints a blank to fill in by hand. */
  fields?: { label: string; value?: string }[];
}

export interface TextRun {
  text: string;
  bold?: boolean;
}

const PT = 0.3528; // mm per point

/** "2026-10-30" / "10/30/2026" / Date → "October 30, 2026". Unparseable input is returned as-is. */
export function formatLongDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'number') d = new Date(value < 1e12 ? value * 1000 : value);
  else {
    const s = value.trim();
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else if (us) d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    else d = new Date(s);
    if (isNaN(d.getTime())) return s;
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Strip characters that are illegal in file names. */
export const safeFileName = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '-');

export interface ReportOptions {
  /** Arial Narrow TTF (base64) for body text; falls back to Helvetica when absent. */
  bodyFontBase64?: string;
}

/**
 * One report document. Content methods advance `y` and break pages on their own;
 * call `finish` last to stamp the letterhead and footer on every page.
 */
export class ReportDoc {
  readonly doc: jsPDF;
  readonly bodyFont: string;
  y = PAGE.contentTop;

  constructor(opts: ReportOptions = {}) {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (opts.bodyFontBase64) {
      this.doc.addFileToVFS('ArialNarrow.ttf', opts.bodyFontBase64);
      this.doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');
      this.bodyFont = 'ArialNarrow';
    } else {
      this.bodyFont = 'helvetica';
    }
  }

  // ── Typography ──────────────────────────────────────────────────────────
  body(size = 9.5, color: RGB = REPORT_COLORS.ink) {
    this.doc.setFont(this.bodyFont, 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  /** Helvetica regular — prose, letterhead and signatures (pairs with the Helvetica bold runs). */
  prose(size = 9.5, color: RGB = REPORT_COLORS.ink) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  bold(size = 9.5, color: RGB = REPORT_COLORS.ink) {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  static lineHeight(size: number) {
    return size * PT * 1.45;
  }

  get pageCount() {
    return this.doc.getNumberOfPages();
  }

  get remaining() {
    return PAGE.contentBottom - this.y;
  }

  // ── Pagination ──────────────────────────────────────────────────────────
  addPage() {
    this.doc.addPage();
    this.y = PAGE.contentTop;
  }

  /** Start a new page unless `height` mm still fits. Returns true when it broke. */
  ensure(height: number): boolean {
    if (this.y + height <= PAGE.contentBottom || this.y <= PAGE.contentTop + 0.01) return false;
    this.addPage();
    return true;
  }

  gap(mm: number) {
    this.y += mm;
  }

  // ── Blocks ──────────────────────────────────────────────────────────────
  /** Bold section heading, kept with at least `keepWithNext` mm of what follows. */
  heading(text: string, keepWithNext = 18) {
    const h = 8;
    this.ensure(h + keepWithNext);
    this.bold(10.5);
    this.doc.text(text, PAGE.margin, this.y + 4);
    this.y += h;
  }

  /** Height a paragraph will take, without drawing it. */
  measureParagraph(runs: TextRun[] | string, size = 9.5, width = CONTENT_WIDTH): number {
    return this.layoutRuns(typeof runs === 'string' ? [{ text: runs }] : runs, size, width).length * ReportDoc.lineHeight(size);
  }

  /** Word-wrapped paragraph with optional bold runs; breaks pages between lines. */
  paragraph(runs: TextRun[] | string, size = 9.5, opts: { width?: number; color?: RGB; after?: number } = {}) {
    const width = opts.width ?? CONTENT_WIDTH;
    const lh = ReportDoc.lineHeight(size);
    const lines = this.layoutRuns(typeof runs === 'string' ? [{ text: runs }] : runs, size, width);
    for (const line of lines) {
      this.ensure(lh);
      for (const piece of line) {
        if (piece.bold) this.bold(size, opts.color);
        else this.prose(size, opts.color);
        this.doc.text(piece.text, PAGE.margin + piece.x, this.y + lh * 0.72);
      }
      this.y += lh;
    }
    this.y += opts.after ?? 3;
  }

  private layoutRuns(runs: TextRun[], size: number, width: number) {
    type Piece = { text: string; bold?: boolean; x: number };
    const lines: Piece[][] = [[]];
    let x = 0;
    let pendingSpace = false;
    for (const run of runs) {
      if (run.bold) this.bold(size);
      else this.prose(size);
      const space = this.doc.getTextWidth(' ') + 0.25;
      for (const token of run.text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) { pendingSpace = true; continue; }
        const w = this.doc.getTextWidth(token);
        const sp = pendingSpace && x > 0 ? space : 0;
        pendingSpace = false;
        if (x + sp + w > width && x > 0) {
          lines.push([]);
          x = 0;
        } else {
          x += sp;
        }
        // A single word wider than the line is split by characters.
        if (w > width) {
          const parts = this.doc.splitTextToSize(token, width) as string[];
          for (let pi = 0; pi < parts.length; pi++) {
            if (pi > 0) { lines.push([]); x = 0; }
            lines[lines.length - 1].push({ text: parts[pi], bold: run.bold, x });
            x += this.doc.getTextWidth(parts[pi]);
          }
          continue;
        }
        // Words are placed one by one: Helvetica isn't embedded, and viewers whose
        // Helvetica runs slightly wider (macOS Preview) would otherwise eat the gaps.
        lines[lines.length - 1].push({ text: token, bold: run.bold, x });
        x += w;
      }
    }
    return lines.filter((l, i) => l.length > 0 || i === 0);
  }

  /** Standard autoTable options shared by every report table. */
  tableDefaults(): UserOptions {
    return {
      theme: 'grid',
      margin: { top: PAGE.contentTop, bottom: PAGE.height - PAGE.contentBottom, left: PAGE.margin, right: PAGE.margin },
      tableWidth: CONTENT_WIDTH,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: this.bodyFont,
        fontSize: 9,
        textColor: REPORT_COLORS.ink,
        lineColor: REPORT_COLORS.rule,
        lineWidth: 0.15,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        font: 'helvetica',
        fontStyle: 'bold',
        fontSize: 8.5,
        fillColor: REPORT_COLORS.headFill,
        textColor: REPORT_COLORS.ink,
        lineColor: REPORT_COLORS.rule,
      },
    };
  }

  /** Body rows the most recent `table` drew on its final page (0 when it drew none). */
  lastTableRowsOnFinalPage = 0;

  /** Draw a table at the cursor and move the cursor below it. */
  table(options: UserOptions, after = 5) {
    const defaults = this.tableDefaults();
    const rowsPerPage = new Map<number, Set<number>>();
    autoTable(this.doc, {
      ...defaults,
      ...options,
      didDrawCell: (h) => {
        if (h.section === 'body') {
          const page = this.doc.getCurrentPageInfo().pageNumber;
          if (!rowsPerPage.has(page)) rowsPerPage.set(page, new Set());
          rowsPerPage.get(page)!.add(h.row.index);
        }
        options.didDrawCell?.(h);
      },
      styles: { ...defaults.styles, ...options.styles },
      headStyles: { ...defaults.headStyles, ...options.headStyles },
      startY: options.startY ?? this.y,
    });
    const last = (this.doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    this.y = (last?.finalY ?? this.y) + after;
    this.lastTableRowsOnFinalPage = rowsPerPage.get(this.pageCount)?.size ?? 0;
  }

  /**
   * Plain "Label: value" lines — no boxes, one per line. Every value starts at
   * the same x (just past the widest label) and long values wrap under themselves.
   */
  details(rows: [string, string][], after = 6) {
    const size = 9.5;
    const lh = ReportDoc.lineHeight(size);
    const rowGap = 1.4;
    this.bold(size);
    // Same value column in every report; widens only for an unusually long label.
    const labelW = Math.max(36, ...rows.map(([l]) => this.doc.getTextWidth(`${l}:`) + 5));
    for (const [label, value] of rows) {
      this.prose(size);
      const lines = this.doc.splitTextToSize(value?.trim() || '—', CONTENT_WIDTH - labelW) as string[];
      this.ensure(lines.length * lh);
      this.bold(size);
      this.doc.text(`${label}:`, PAGE.margin, this.y + lh * 0.72);
      this.prose(size);
      lines.forEach((line, i) => this.doc.text(line, PAGE.margin + labelW, this.y + lh * 0.72 + i * lh));
      this.y += lines.length * lh + rowGap;
    }
    this.y += after - rowGap;
  }

  // ── Signatures ──────────────────────────────────────────────────────────
  private signerLines(s: ReportSigner, colW: number) {
    this.bold(9.5);
    const name = s.name?.trim() ? (this.doc.splitTextToSize(s.name.trim(), colW) as string[]) : [];
    this.prose(8.5);
    const sub = [s.designation, s.company]
      .map((t) => (t || '').trim())
      .filter(Boolean)
      .flatMap((t) => this.doc.splitTextToSize(t, colW) as string[]);
    return { name, sub };
  }

  private signerHeight(s: ReportSigner, colW: number) {
    const { name, sub } = this.signerLines(s, colW);
    return 4 /* label */ + 14 /* signing space */ + 1.5
      + Math.max(1, name.length) * ReportDoc.lineHeight(9.5)
      + sub.length * ReportDoc.lineHeight(8.5)
      + (s.fields?.length || 0) * 6.5;
  }

  /** Height the whole signature section needs (rows of up to `perRow` signers). */
  measureSignatures(signers: ReportSigner[], perRow = signers.length === 3 ? 3 : 2) {
    const colW = (CONTENT_WIDTH - (perRow - 1) * 12) / perRow;
    let h = 0;
    for (let i = 0; i < signers.length; i += perRow) {
      h += Math.max(...signers.slice(i, i + perRow).map((s) => this.signerHeight(s, colW))) + 6;
    }
    return h;
  }

  /**
   * Signature blocks laid out in columns; the whole section is kept on one page
   * together with `leadIn` (e.g. an acceptance statement) so neither is orphaned.
   * Returns true when it had to start a new page.
   */
  signatures(signers: ReportSigner[], opts: { perRow?: number; leadIn?: string } = {}): boolean {
    const perRow = opts.perRow ?? (signers.length === 3 ? 3 : 2);
    const colGap = 12;
    const colW = (CONTENT_WIDTH - (perRow - 1) * colGap) / perRow;
    const leadInH = opts.leadIn ? this.measureParagraph(opts.leadIn, 9.5) + 3 : 0;
    const broke = this.ensure(leadInH + this.measureSignatures(signers, perRow) + 2);
    if (opts.leadIn) this.paragraph(opts.leadIn, 9.5, { after: 3 });

    for (let i = 0; i < signers.length; i += perRow) {
      const row = signers.slice(i, i + perRow);
      const top = this.y + 2;
      let rowBottom = top;
      row.forEach((s, ci) => {
        const x = PAGE.margin + ci * (colW + colGap);
        let y = top;
        this.prose(9);
        this.doc.text(`${s.label}:`, x, y + 3);
        y += 4 + 14;
        this.doc.setDrawColor(...REPORT_COLORS.ink);
        this.doc.setLineWidth(0.3);
        this.doc.line(x, y, x + colW, y);
        y += 1.5;
        const { name, sub } = this.signerLines(s, colW);
        if (name.length) {
          this.bold(9.5);
          name.forEach((l) => { y += ReportDoc.lineHeight(9.5); this.doc.text(l, x, y - 1.2); });
        } else {
          this.prose(7.5);
          y += ReportDoc.lineHeight(9.5);
          this.doc.text('Signature over printed name', x, y - 1.2);
        }
        this.prose(8.5);
        sub.forEach((l) => { y += ReportDoc.lineHeight(8.5); this.doc.text(l, x, y - 1); });
        (s.fields || []).forEach((f) => {
          y += 6.5;
          this.prose(8.5);
          const lbl = `${f.label}:`;
          this.doc.text(lbl, x, y - 1);
          const vx = x + Math.max(14, this.doc.getTextWidth(lbl) + 2);
          this.doc.setDrawColor(...REPORT_COLORS.ink);
          this.doc.setLineWidth(0.2);
          this.doc.line(vx, y, x + colW, y);
          if (f.value?.trim()) {
            this.prose(9);
            const v = (this.doc.splitTextToSize(f.value.trim(), x + colW - vx) as string[])[0];
            this.doc.text(v, vx + 1, y - 1);
          }
        });
        rowBottom = Math.max(rowBottom, y);
      });
      this.y = rowBottom + 6;
    }
    return broke;
  }

  // ── Letterhead + footer (final pass) ────────────────────────────────────
  finish(opts: {
    issuer: ReportIssuer;
    logoDataUrl?: string | null;
    title: string;
    /** Small right-aligned lines under the title, e.g. "Doc. No. …", "Date: …". */
    meta: string[];
    docNo: string;
  }) {
    const { doc } = this;
    const total = doc.getNumberOfPages();
    const right = PAGE.width - PAGE.margin;
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      const top = 12;
      // Logo + issuer block (left)
      let textX = PAGE.margin;
      if (opts.logoDataUrl) {
        try {
          const lw = opts.issuer.logoWidth;
          const lh = opts.issuer.logoHeight;
          doc.addImage(opts.logoDataUrl, 'PNG', PAGE.margin, top + (18 - lh) / 2, lw, lh, `logo-${opts.issuer.logoFile}`, 'FAST');
          textX = PAGE.margin + lw + 4;
        } catch {
          // Missing/corrupt logo: keep the text letterhead.
        }
      }
      this.bold(11.5);
      doc.text(opts.issuer.name, textX, top + 4.5);
      this.prose(7.5);
      const info = [...opts.issuer.addressLines, ...(opts.issuer.tin ? [opts.issuer.tin] : [])];
      info.forEach((l, i) => doc.text(l, textX, top + 9 + i * 3.4));

      // Document title (right). A title that would crowd the issuer name wraps to two lines.
      this.bold(11.5);
      const free = right - (textX + doc.getTextWidth(opts.issuer.name) + 8);
      const title = opts.title.toUpperCase();
      this.bold(15);
      let titleLines = [title];
      if (doc.getTextWidth(title) > free) {
        const words = title.split(' ');
        const cut = Math.ceil(words.length / 2);
        titleLines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')].filter(Boolean);
        this.bold(13.5);
      }
      titleLines.forEach((l, i) => doc.text(l, right, top + 5.5 + i * 5.6, { align: 'right' }));
      this.prose(8);
      const metaTop = top + 11 + (titleLines.length - 1) * 5.6;
      opts.meta.forEach((m, i) => doc.text(m, right, metaTop + i * 3.8, { align: 'right' }));

      doc.setDrawColor(...REPORT_COLORS.ink);
      doc.setLineWidth(0.4);
      doc.line(PAGE.margin, 35, right, 35);

      // Footer
      const fy = PAGE.height - 11;
      doc.setDrawColor(...REPORT_COLORS.rule);
      doc.setLineWidth(0.25);
      doc.line(PAGE.margin, fy - 4, right, fy - 4);
      this.prose(7.5);
      doc.text(`Doc. No.: ${opts.docNo}`, PAGE.margin, fy);
      doc.text(opts.issuer.name, PAGE.width / 2, fy, { align: 'center' });
      doc.text(`Page ${p} of ${total}`, right, fy, { align: 'right' });
    }
    doc.setTextColor(0, 0, 0);
  }
}
