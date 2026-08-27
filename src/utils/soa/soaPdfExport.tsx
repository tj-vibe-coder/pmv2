import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { StatementOfAccount } from '../../types/StatementOfAccount';
import { computeSoaTotals } from '../../types/StatementOfAccount';

// ─── Colors & Typography ─────────────────────────────────────────────────────
const PRIMARY = '#2c5aa0';
const PRIMARY_DARK = '#1a3f72';
const TEXT_DARK = '#111827';
const TEXT_MUTED = '#4b5563';
const BORDER_LIGHT = '#e5e7eb';
const BORDER_STRONG = '#9ca3af';
const BG_SECTION = '#f8fafc';
const BG_SUBTOTAL = '#eaf0f8';
const BG_TOTAL = '#2c5aa0';

export const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDateDisplay(val?: string): string {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return format(d, 'd MMMM yyyy');
  } catch {
    return val;
  }
}

// ─── Stylesheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: TEXT_DARK,
    lineHeight: 1.3,
  },

  // Header Section
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    width: '56%',
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: 'contain',
    marginBottom: 4,
  },
  issuerName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PRIMARY,
    marginBottom: 2,
  },
  issuerLine: {
    fontSize: 8,
    color: TEXT_MUTED,
    lineHeight: 1.25,
  },
  headerRight: {
    width: '42%',
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TEXT_DARK,
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  metaTable: {
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
  },
  metaLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    fontWeight: 'bold',
    width: '38%',
  },
  metaValue: {
    fontSize: 8,
    color: TEXT_DARK,
    width: '62%',
    textAlign: 'right',
    fontWeight: 'bold',
  },

  // Recipient Block
  recipientBlock: {
    marginBottom: 12,
  },
  recipientName: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: TEXT_DARK,
  },
  recipientDetail: {
    fontSize: 8,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  subjectRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 4,
  },
  subjectLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: TEXT_DARK,
    width: 55,
  },
  subjectValue: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: TEXT_DARK,
    flex: 1,
  },
  bodySalutation: {
    fontSize: 8.5,
    marginTop: 6,
    marginBottom: 3,
  },
  bodyText: {
    fontSize: 8,
    color: TEXT_DARK,
    lineHeight: 1.3,
    marginBottom: 12,
  },

  // Table Section
  tableContainer: {
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    marginBottom: 12,
  },
  tableMainHeader: {
    backgroundColor: PRIMARY,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableMainHeaderTitle: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  tableColHeaderRow: {
    flexDirection: 'row',
    backgroundColor: PRIMARY_DARK,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff',
  },
  colHeaderCell: {
    color: '#ffffff',
    fontSize: 7.5,
    fontWeight: 'bold',
  },

  // Row columns widths
  colPo: { width: '16%' },
  colProject: { width: '22%' },
  colDesc: { width: '38%' },
  colDate: { width: '10%', textAlign: 'center' },
  colAmount: { width: '14%', textAlign: 'right' },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_LIGHT,
  },
  dataRowEven: {
    backgroundColor: '#ffffff',
  },
  dataRowOdd: {
    backgroundColor: BG_SECTION,
  },
  cellText: {
    fontSize: 7.8,
    color: TEXT_DARK,
  },
  cellTextBold: {
    fontSize: 7.8,
    fontWeight: 'bold',
    color: TEXT_DARK,
  },
  cellDescSub: {
    fontSize: 7,
    color: TEXT_MUTED,
    marginTop: 1,
  },

  // Subtotal rows
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: BG_SUBTOTAL,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  subtotalLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PRIMARY_DARK,
    textAlign: 'right',
    width: '86%',
    paddingRight: 6,
  },
  subtotalValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEXT_DARK,
    textAlign: 'right',
    width: '14%',
  },

  // Grand Total Banner
  totalBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BG_TOTAL,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  totalBannerLabel: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  totalBannerValue: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },

  // Footnotes Section
  footnotesContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  footnoteItem: {
    fontSize: 7,
    color: TEXT_MUTED,
    fontStyle: 'italic',
    lineHeight: 1.25,
    marginBottom: 3,
  },

  // Signatures Section
  signaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 14,
    paddingTop: 10,
  },
  sigBlock: {
    width: '45%',
  },
  sigHeader: {
    fontSize: 8,
    fontWeight: 'bold',
    color: TEXT_DARK,
    marginBottom: 12,
  },
  sigName: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: TEXT_DARK,
  },
  sigTitle: {
    fontSize: 8,
    color: TEXT_MUTED,
    marginBottom: 2,
  },
  sigContact: {
    fontSize: 7.5,
    color: TEXT_MUTED,
    lineHeight: 1.2,
  },
  sigReceivedEntity: {
    fontSize: 7.8,
    color: TEXT_MUTED,
    marginBottom: 20,
  },
  sigReceivedLine: {
    borderTopWidth: 0.8,
    borderTopColor: BORDER_STRONG,
    paddingTop: 3,
    fontSize: 7.5,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
});

// ─── PDF Document Component ──────────────────────────────────────────────────
export interface SoaPdfProps {
  soa: StatementOfAccount;
}

export function StatementOfAccountDocument({ soa }: SoaPdfProps) {
  const totals = computeSoaTotals(soa.items || []);
  const itemsWithPo = (soa.items || []).filter((i) => i.hasPo);
  const itemsPendingPo = (soa.items || []).filter((i) => !i.hasPo);

  const contactSalutation = soa.salutation || `Dear Sir/Ma'am ${soa.recipientContactName || ''},`;
  const defaultBody =
    soa.bodyText ||
    'Please find below the consolidated statement of account for engineering services rendered across the following projects, whether or not a Purchase Order has been formally issued. All work reflected herein has been completed.';

  return (
    <Document title={`${soa.soaNo} - Statement of Account`}>
      <Page size="A4" style={styles.page}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Image src="/logo-ioct-only.png" style={styles.logo} />
            <Text style={styles.issuerName}>IO Control Technologie OPC</Text>
            <Text style={styles.issuerLine}>B63, L7 Dynamism Jubilation Enclave,</Text>
            <Text style={styles.issuerLine}>Santo Niño, City of Biñan, Laguna,</Text>
            <Text style={styles.issuerLine}>Region IV-A (Calabarzon), 4024</Text>
            <Text style={styles.issuerLine}>TIN: 697-029-976-00000</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>STATEMENT OF ACCOUNT</Text>
            <View style={styles.metaTable}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>SOA No.</Text>
                <Text style={styles.metaValue}>{soa.soaNo}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date</Text>
                <Text style={styles.metaValue}>{formatDateDisplay(soa.date)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Currency</Text>
                <Text style={styles.metaValue}>{soa.currency || 'PHP'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Status</Text>
                <Text style={styles.metaValue}>
                  {soa.status === 'for_payment' ? 'For Payment' : soa.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Recipient Block */}
        <View style={styles.recipientBlock}>
          <Text style={styles.recipientName}>{soa.recipientName}</Text>
          {soa.recipientContactName && <Text style={styles.recipientDetail}>{soa.recipientContactName}</Text>}
          {soa.recipientContactPhone && (
            <Text style={styles.recipientDetail}>Contact No.: {soa.recipientContactPhone}</Text>
          )}
          {soa.recipientAddress && <Text style={styles.recipientDetail}>{soa.recipientAddress}</Text>}

          <View style={styles.subjectRow}>
            <Text style={styles.subjectLabel}>Subject</Text>
            <Text style={styles.subjectValue}>{soa.subject}</Text>
          </View>

          <Text style={styles.bodySalutation}>{contactSalutation}</Text>
          <Text style={styles.bodyText}>{defaultBody}</Text>
        </View>

        {/* Account Summary Table */}
        <View style={styles.tableContainer}>
          <View style={styles.tableMainHeader}>
            <Text style={styles.tableMainHeaderTitle}>Account Summary</Text>
          </View>
          <View style={styles.tableColHeaderRow}>
            <Text style={[styles.colHeaderCell, styles.colPo]}>PO No.</Text>
            <Text style={[styles.colHeaderCell, styles.colProject]}>Project / WBS</Text>
            <Text style={[styles.colHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.colHeaderCell, styles.colDate]}>Date</Text>
            <Text style={[styles.colHeaderCell, styles.colAmount]}>Amount, PhP</Text>
          </View>

          {/* Group 1: With PO Items */}
          {itemsWithPo.map((item, idx) => (
            <View key={item.id || idx} style={[styles.dataRow, idx % 2 === 0 ? styles.dataRowEven : styles.dataRowOdd]}>
              <Text style={[styles.cellText, styles.colPo]}>{item.poNumber || '-'}</Text>
              <Text style={[styles.cellTextBold, styles.colProject]}>{item.projectName}</Text>
              <View style={styles.colDesc}>
                <Text style={styles.cellText}>{item.description}</Text>
                {item.completionDateText && <Text style={styles.cellDescSub}>{item.completionDateText}</Text>}
              </View>
              <Text style={[styles.cellText, styles.colDate]}>{item.poDate || '-'}</Text>
              <Text style={[styles.cellTextBold, styles.colAmount]}>{NUM(item.amount)}</Text>
            </View>
          ))}

          {/* Subtotal (with PO) */}
          {itemsWithPo.length > 0 && (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Sub-total (with PO)</Text>
              <Text style={styles.subtotalValue}>{NUM(totals.subtotalWithPo)}</Text>
            </View>
          )}

          {/* Group 2: Pending PO Items */}
          {itemsPendingPo.map((item, idx) => {
            const rowIdx = itemsWithPo.length + idx;
            const footnoteTag = item.footnoteSymbol ? ` ${item.footnoteSymbol}` : '';
            return (
              <View key={item.id || rowIdx} style={[styles.dataRow, rowIdx % 2 === 0 ? styles.dataRowEven : styles.dataRowOdd]}>
                <Text style={[styles.cellText, styles.colPo]}>
                  {item.poNumber ? item.poNumber : `N/A${footnoteTag}`}
                </Text>
                <Text style={[styles.cellTextBold, styles.colProject]}>{item.projectName}</Text>
                <View style={styles.colDesc}>
                  <Text style={styles.cellText}>{item.description}{footnoteTag}</Text>
                  {item.completionDateText && <Text style={styles.cellDescSub}>{item.completionDateText}</Text>}
                </View>
                <Text style={[styles.cellText, styles.colDate]}>{item.poDate || '-'}</Text>
                <Text style={[styles.cellTextBold, styles.colAmount]}>
                  {item.footnoteSymbol ? `${item.footnoteSymbol}${NUM(item.amount)}` : NUM(item.amount)}
                </Text>
              </View>
            );
          })}

          {/* Subtotal (pending PO) */}
          {itemsPendingPo.length > 0 && (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Sub-total (pending PO)</Text>
              <Text style={styles.subtotalValue}>{NUM(totals.subtotalPendingPo)}</Text>
            </View>
          )}

          {/* Grand Total Banner */}
          <View style={styles.totalBannerRow}>
            <Text style={styles.totalBannerLabel}>TOTAL OUTSTANDING, PhP (VAT-EX)</Text>
            <Text style={styles.totalBannerValue}>{NUM(totals.totalOutstanding)}</Text>
          </View>
        </View>

        {/* Footnotes */}
        {soa.footnotes && soa.footnotes.length > 0 && (
          <View style={styles.footnotesContainer}>
            {soa.footnotes.map((fn, idx) => (
              <Text key={idx} style={styles.footnoteItem}>
                {fn.symbol} {fn.text}
              </Text>
            ))}
          </View>
        )}

        {/* Signatures */}
        <View style={styles.signaturesRow}>
          <View style={styles.sigBlock}>
            <Text style={styles.sigHeader}>Prepared by:</Text>
            <Text style={styles.sigName}>{soa.preparedByName || 'Reuel Joshua Rivera'}</Text>
            <Text style={styles.sigTitle}>{soa.preparedByTitle || 'Managing Partner - Operations'}</Text>
            {soa.preparedByPhone && (
              <Text style={styles.sigContact}>Mobile No.: {soa.preparedByPhone}</Text>
            )}
            {soa.preparedByEmail && (
              <Text style={styles.sigContact}>{soa.preparedByEmail}</Text>
            )}
          </View>

          <View style={styles.sigBlock}>
            <Text style={styles.sigHeader}>Received by:</Text>
            <Text style={styles.sigReceivedEntity}>
              For and on behalf of {soa.recipientName || 'Advance Controle Technologie Inc'}
            </Text>
            <Text style={styles.sigReceivedLine}>Name / Signature / Date</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ─── Export Functions with pdf-lib Page Stamping ─────────────────────────────

/**
 * Generate PDF blob with 2-pass pdf-lib page numbering ("Page X of Y")
 */
export async function generateSoaPdfBlob(soa: StatementOfAccount): Promise<Blob> {
  const reactDoc = <StatementOfAccountDocument soa={soa} />;
  const rawBlob = await pdf(reactDoc).toBlob();

  try {
    const rawBuffer = await rawBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(rawBuffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 7;
    const footerColor = rgb(0.4, 0.4, 0.4);

    pages.forEach((page, idx) => {
      const { width } = page.getSize();
      const pageNumberText = `Page ${idx + 1} of ${totalPages}`;
      const leftText = 'IO Control Technologie OPC';
      const centerText = `SOA Ref: ${soa.soaNo || ''}`;

      page.drawText(leftText, { x: 36, y: 22, size: fontSize, font, color: footerColor });

      const centerWidth = font.widthOfTextAtSize(centerText, fontSize);
      page.drawText(centerText, { x: (width - centerWidth) / 2, y: 22, size: fontSize, font, color: footerColor });

      const pageNumWidth = font.widthOfTextAtSize(pageNumberText, fontSize);
      page.drawText(pageNumberText, { x: width - 36 - pageNumWidth, y: 22, size: fontSize, font, color: footerColor });
    });

    const stampedBytes = await pdfDoc.save();
    return new Blob([stampedBytes], { type: 'application/pdf' });
  } catch (err) {
    console.warn('[SOA PDF] pdf-lib footer stamping failed, returning raw blob:', err);
    return rawBlob;
  }
}

/**
 * Trigger browser download of Statement of Account PDF
 */
export async function downloadSoaPdf(soa: StatementOfAccount): Promise<void> {
  const blob = await generateSoaPdfBlob(soa);
  const filename = `${soa.soaNo || 'SOA'}.pdf`;
  saveAs(blob, filename);
}
