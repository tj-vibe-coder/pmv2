import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Client, Project, Quotation, SalesContact } from '../../types/Quotation';
import { resolveContact } from '../../types/Client';
import {
  computeTotals, lineGeneralTotal, componentLineTotal, componentSellingUnit, PHP,
} from './calc';

// ─── Branding ────────────────────────────────────────────────────────────────
const PRIMARY = '#2c5aa0';
const TEXT = '#222';
const TEXT_LIGHT = '#666';
const SECTION_BG = '#EAF0F8';
const BORDER = '#999';

const ISSUER_INFO = {
  IOCT: {
    name: 'IO Control Technologie OPC',
    addressLines: [
      'B63, L7 Dynamism Jubilation Enclave,',
      'Santo Niño, City of Biñan, Laguna,',
      'Region IV-A (Calabarzon), 4024',
    ],
    tin: 'TIN: 697-029-976-00000',
    // Icon-only mark (no "IO Control Technologie" wordmark). Wordmark version is at /logo-ioct.png.
    logo: '/logo-ioct-only.png',
    footer: 'IO Control Technologie, OPC',
  },
  ACTI: {
    name: 'Advance Controle Technologie Inc.',
    addressLines: ['Block 13, Mindanao Ave., Cavite, Philippines'],
    tin: '',
    logo: '/logo-acti.png',
    footer: 'Advance Controle Technologie, Inc.',
  },
};

// Resolve PDF signature-block details for the named signatory from the
// salesContacts list (single source of truth — `src/data/quotationClients.ts`).
// Returns the formal title, phone, and email when the name matches. Custom
// (free-text) names that aren't in salesContacts return null and the PDF just
// renders the name on its own.
function lookupStaff(
  name: string | undefined,
  salesContacts: SalesContact[],
): { title: string; phone: string; email: string } | null {
  if (!name) return null;
  const trimmed = name.trim().toLowerCase();
  const match = salesContacts.find((c) => c.name.trim().toLowerCase() === trimmed);
  if (!match) return null;
  return {
    title: match.position || '',
    phone: match.phone || '',
    email: match.email || '',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return String(n);
}

function firstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

function honorific(gender: string | undefined): string {
  return gender === 'M' ? 'Sir' : gender === 'F' ? "Ma'am" : 'Sir/Ma\'am';
}

function groupedLotDisplayIndex(rowCount: number): number {
  return Math.max(0, Math.floor((rowCount - 1) / 2));
}

function quotationDate(value: string | undefined): Date {
  const dateOnly = (value || format(new Date(), 'yyyy-MM-dd')).slice(0, 10);
  return new Date(`${dateOnly}T00:00:00`);
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 50, paddingHorizontal: 36,
    fontSize: 9, fontFamily: 'Helvetica', color: TEXT, lineHeight: 1.3,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLeft: { width: '55%' },
  logo: { width: 64, height: 64, objectFit: 'contain', marginBottom: 0 },
  brandName: { color: PRIMARY, fontSize: 11, fontWeight: 700, marginBottom: 1 },
  brandLine: { fontSize: 8.5, color: TEXT, lineHeight: 1.3 },
  headerRight: { width: '45%', alignItems: 'flex-end' },
  qTitle: { fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: 14, letterSpacing: 1, lineHeight: 1 },
  metaRow: { flexDirection: 'row', fontSize: 9, marginBottom: 2 },
  metaLabel: { width: 56, fontWeight: 700, textAlign: 'right', marginRight: 6, color: TEXT_LIGHT },
  metaValue: { minWidth: 110, textAlign: 'left' },

  // Recipient + project
  recipient: { marginBottom: 12, marginTop: 4 },
  recipientName: { fontSize: 10, fontWeight: 700, marginBottom: 1 },
  recipientLine: { fontSize: 9 },

  projectRow: { flexDirection: 'row', marginBottom: 10 },
  projectLabel: { fontSize: 9.5, fontWeight: 700, color: PRIMARY, width: 56 },
  projectName: { fontSize: 9.5, color: PRIMARY, fontWeight: 700, flex: 1 },

  greeting: { fontSize: 9, marginBottom: 4 },
  intro: { fontSize: 9, marginBottom: 8 },

  // Section bars — solid PRIMARY fill, white text
  sectionBar: {
    backgroundColor: PRIMARY, color: 'white', fontWeight: 700,
    fontSize: 9, padding: '2 8', marginTop: 8,
  },
  // Summary label — same solid PRIMARY treatment
  summaryBar: {
    backgroundColor: PRIMARY, color: 'white', fontWeight: 700,
    fontSize: 9.5, padding: '2 8',
  },

  // Table — vertical column lines only, no horizontal row borders
  tableWrap: {
    borderLeft: `0.5px solid ${BORDER}`,
    borderRight: `0.5px solid ${BORDER}`,
    borderBottom: `0.5px solid ${BORDER}`,
  },
  th: {
    flexDirection: 'row', backgroundColor: SECTION_BG,
    borderBottom: `0.5px solid ${BORDER}`,
    padding: '2 0', fontWeight: 700, fontSize: 8.5,
  },
  tr: {
    flexDirection: 'row',
    padding: '2 0', fontSize: 8.5,
    alignItems: 'center',
  },
  trSub: {
    flexDirection: 'row',
    padding: '1 0', fontSize: 8.5,
    borderTop: `0.5px solid ${BORDER}`,
  },

  cItem: { width: '10%', paddingLeft: 4 },
  cDesc: { width: '48%', borderLeft: `0.5px solid ${BORDER}`, paddingLeft: 4, paddingRight: 2 },
  cQty: { width: '8%', textAlign: 'center', lineHeight: 1.05, borderLeft: `0.5px solid ${BORDER}` },
  cUom: { width: '8%', textAlign: 'center', lineHeight: 1.05, borderLeft: `0.5px solid ${BORDER}` },
  cUnit: { width: '13%', textAlign: 'right', lineHeight: 1.05, borderLeft: `0.5px solid ${BORDER}`, paddingRight: 4 },
  cTotal: { width: '13%', textAlign: 'right', lineHeight: 1.05, borderLeft: `0.5px solid ${BORDER}`, paddingRight: 4 },

  // Summary — same vertical-line style
  summaryBlock: { marginTop: 4 },
  sumWrap: {
    borderLeft: `0.5px solid ${BORDER}`,
    borderRight: `0.5px solid ${BORDER}`,
    borderBottom: `0.5px solid ${BORDER}`,
  },
  sumTh: {
    flexDirection: 'row', backgroundColor: SECTION_BG, color: TEXT,
    borderBottom: `0.5px solid ${BORDER}`,
    padding: '2 0', fontWeight: 700, fontSize: 9,
  },
  sumRow: {
    flexDirection: 'row',
    padding: '2 0', fontSize: 9,
  },
  sumItem: { flex: 1, paddingLeft: 6 },
  sumQty: { width: '10%', textAlign: 'center', borderLeft: `0.5px solid ${BORDER}` },
  sumUom: { width: '10%', textAlign: 'center', borderLeft: `0.5px solid ${BORDER}` },
  sumPrice: { width: '20%', textAlign: 'right', borderLeft: `0.5px solid ${BORDER}`, paddingRight: 6 },
  sumFooterRow: {
    flexDirection: 'row', justifyContent: 'flex-end', padding: '2 6', fontSize: 9.5,
  },
  sumTotalRow: {
    borderTop: `0.5px solid ${BORDER}`,
  },
  sumFooterLabel: { fontWeight: 700, marginRight: 16 },
  sumFooterValue: { fontWeight: 700, width: '20%', textAlign: 'right' },

  // Terms
  terms: { marginTop: 14 },
  termsTitle: { fontWeight: 700, fontSize: 10, marginBottom: 4 },
  termSubtitle: { fontWeight: 700, marginTop: 8, marginBottom: 2, fontSize: 9 },
  termText: { fontSize: 8.5, lineHeight: 1.4, marginTop: 1 },

  // Closing
  closing: { marginTop: 14, fontSize: 9 },

  // Signatures
  signatures: { flexDirection: 'row', marginTop: 18, gap: 32 },
  sigBlock: { flex: 1 },
  sigHeader: { fontWeight: 700, fontSize: 9.5, marginBottom: 30 },
  sigName: { fontSize: 9, fontWeight: 700 },
  sigSub: { fontSize: 8.5 },
  sigEmail: { fontSize: 8.5, color: PRIMARY, textDecoration: 'underline', marginTop: 1 },

  // Footer
  footerRule: {
    position: 'absolute', bottom: 40, left: 36, right: 36,
    borderTop: `0.75px solid ${BORDER}`,
  },
  footerLeft: {
    position: 'absolute', bottom: 27, left: 36, width: 210,
    fontSize: 8.5, color: TEXT, textAlign: 'left',
  },
  footerCenter: {
    position: 'absolute', bottom: 27, left: 36, right: 36,
    fontSize: 8.5, color: TEXT, textAlign: 'center',
  },
});

interface Props {
  quotation: Quotation;
  project: Project;
  recipient: Client | null;
  customer: Client | null;
  salesContacts: SalesContact[];
}

function QuotationDoc({ quotation, project, recipient, customer, salesContacts }: Props) {
  const totals = computeTotals(quotation);
  const issuer = ISSUER_INFO[quotation.kind];
  const refNo = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}`;
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}${issuer.logo}` : issuer.logo;
  const dateSent = quotationDate(quotation.dateSent);

  // Section presence
  const hasA = quotation.generalReqts.length > 0;
  const hasB = quotation.components.length > 0;
  const hasC = quotation.services.length > 0 || totals.servicesSubtotal > 0;
  const exportGeneralReqtsAsLot = !!quotation.exportGeneralReqtsAsLot;
  const generalReqtsExportQty = Math.max(1, quotation.generalReqtsExportQty || 1);
  const generalReqtsExportUnitPrice = totals.generalReqtsSubtotal / generalReqtsExportQty;
  const engineeringServicesQty = Math.max(1, quotation.engineeringServicesQty || 1);
  const engineeringServicesUnitPrice = totals.servicesSubtotal / engineeringServicesQty;

  // Authorized by (with optional staff contact info from the salesContacts seed)
  // Signatory shown on the PDF is the "Prepared by" name from the quotation editor.
  // (The legacy "Authorized by" slot was repurposed as "Prepared by" — only one
  // signatory is shown on the issuer side.)
  const prepName = quotation.preparedBy || '';
  const staff = lookupStaff(prepName, salesContacts);
  // Job title: explicit override wins, then resolved from salesContacts, then nothing.
  const prepTitle = quotation.preparedByTitle?.trim() || staff?.title || '';
  const to = quotation.termsOverrides ?? {};

  // Resolve which contact the quotation addresses (explicit contactId or primary)
  const recipContact = resolveContact(recipient, quotation.contactId);
  const recipFirst = firstName(recipContact?.name);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.footerRule} fixed />
        <Text style={styles.footerLeft} fixed>{issuer.name}</Text>
        <Text style={styles.footerCenter} fixed>QTN Ref: {refNo}</Text>



        {/* ─── HEADER ─── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={logoUrl} style={styles.logo} />
            <Text style={styles.brandName}>{issuer.name}</Text>
            {issuer.addressLines.map((line, i) => (
              <Text key={i} style={styles.brandLine}>{line}</Text>
            ))}
            {issuer.tin && <Text style={styles.brandLine}>{issuer.tin}</Text>}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.qTitle}>QUOTATION</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Ref No.</Text>
              <Text style={styles.metaValue}>{refNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{format(dateSent, 'd MMMM yyyy')}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Validity</Text>
              <Text style={styles.metaValue}>{quotation.validityDays} days</Text>
            </View>
          </View>
        </View>

        {/* ─── RECIPIENT BLOCK ─── */}
        <View style={styles.recipient}>
          <Text style={styles.recipientName}>{recipient?.name ?? '—'}</Text>
          {recipContact?.name && <Text style={styles.recipientLine}>{recipContact.name}{recipContact.position ? `, ${recipContact.position}` : ''}</Text>}
          {recipContact?.email && <Text style={styles.recipientLine}>{recipContact.email}</Text>}
          {recipContact?.phone && <Text style={styles.recipientLine}>{recipContact.phone}</Text>}
          {recipient?.address && <Text style={styles.recipientLine}>{recipient.address}</Text>}
        </View>

        {/* ─── PROJECT LINE ─── */}
        <View style={styles.projectRow}>
          <Text style={styles.projectLabel}>Project</Text>
          <Text style={styles.projectName}>{project.name}</Text>
        </View>

        {/* ─── GREETING ─── */}
        <Text style={styles.greeting}>
          Dear {honorific(recipContact?.gender)}{recipFirst ? ` ${recipFirst}` : ''},
        </Text>
        <Text style={styles.intro}>
          We greatly appreciate your inquiry and are delighted to present our formal quotation for your review.
        </Text>

        {/* ─── SECTION A — GENERAL REQUIREMENTS ─── */}
        {hasA && (
          <>
            <Text style={styles.sectionBar}>General Requirements</Text>
            <View style={styles.tableWrap}>
            <View style={styles.th}>
              <Text style={styles.cItem}>Item No.</Text>
              <Text style={styles.cDesc}>Description</Text>
              <Text style={styles.cQty}>QTY</Text>
              <Text style={styles.cUom}>UOM</Text>
              <Text style={styles.cUnit}>Unit Price</Text>
              <Text style={styles.cTotal}>Total , PhP</Text>
            </View>
            {exportGeneralReqtsAsLot ? (
              quotation.generalReqts.map((l, i) => {
                const showLotTotal = i === groupedLotDisplayIndex(quotation.generalReqts.length);
                return (
                  <View style={styles.tr} key={l.id}>
                    <Text style={styles.cItem}>{l.code}</Text>
                    <Text style={styles.cDesc}>{l.description}</Text>
                    <Text style={styles.cQty}>{showLotTotal ? String(generalReqtsExportQty) : ''}</Text>
                    <Text style={styles.cUom}>{showLotTotal ? 'LOT' : ''}</Text>
                    <Text style={styles.cUnit}>{showLotTotal ? PHP(generalReqtsExportUnitPrice) : ''}</Text>
                    <Text style={styles.cTotal}>{showLotTotal ? PHP(totals.generalReqtsSubtotal) : ''}</Text>
                  </View>
                );
              })
            ) : (
              quotation.generalReqts.map((l) => (
                <View style={styles.tr} key={l.id}>
                  <Text style={styles.cItem}>{l.code}</Text>
                  <Text style={styles.cDesc}>{l.description}</Text>
                  <Text style={styles.cQty}>{l.qty}</Text>
                  <Text style={styles.cUom}>{(l.uom ?? '').toUpperCase()}</Text>
                  <Text style={styles.cUnit}>{PHP(l.unitPrice)}</Text>
                  <Text style={styles.cTotal}>{PHP(lineGeneralTotal(l))}</Text>
                </View>
              ))
            )}
            <View style={styles.trSub}>
              <Text style={[styles.cItem]} />
              <Text style={[styles.cDesc]} />
              <Text style={styles.cQty} />
              <Text style={styles.cUom} />
              <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
              <Text style={styles.cTotal}>{PHP(totals.generalReqtsSubtotal)}</Text>
            </View>
            </View>
          </>
        )}

        {/* ─── SECTION B — SUPPLY OF COMPONENTS ─── */}
        {hasB && (
          (() => {
            const compGroups = new Map<string, typeof quotation.components>();
            quotation.components.forEach((l) => {
              if (l.group) {
                const arr = compGroups.get(l.group) || [];
                arr.push(l);
                compGroups.set(l.group, arr);
              }
            });
            return (
              <>
                <Text style={styles.sectionBar}>Supply of Components</Text>
                <View style={styles.tableWrap}>
                <View style={styles.th}>
                  <Text style={styles.cItem}>Item No.</Text>
                  <Text style={styles.cDesc}>Description</Text>
                  <Text style={styles.cQty}>QTY</Text>
                  <Text style={styles.cUom}>UOM</Text>
                  <Text style={styles.cUnit}>Unit Price</Text>
                  <Text style={styles.cTotal}>Total , PhP</Text>
                </View>
                {quotation.components.map((l) => {
                  if (l.group) {
                    const members = compGroups.get(l.group)!;
                    const midIdx = groupedLotDisplayIndex(members.length);
                    const isMid = members[midIdx].id === l.id;
                    const groupTotal = isMid
                      ? members.reduce((s, m) => s + componentLineTotal(m, quotation.productMarkupPct), 0)
                      : 0;
                    return (
                      <View style={styles.tr} key={l.id}>
                        <Text style={styles.cItem}>{l.code}</Text>
                        <Text style={styles.cDesc}>
                          {[l.brand, l.description, l.partNo].filter(Boolean).join(' — ')}
                        </Text>
                        <Text style={styles.cQty}>{isMid ? '1' : ''}</Text>
                        <Text style={styles.cUom}>{isMid ? 'LOT' : ''}</Text>
                        <Text style={styles.cUnit}>{isMid ? PHP(groupTotal) : ''}</Text>
                        <Text style={styles.cTotal}>{isMid ? PHP(groupTotal) : ''}</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.tr} key={l.id}>
                      <Text style={styles.cItem}>{l.code}</Text>
                      <Text style={styles.cDesc}>
                        {[l.brand, l.description, l.partNo].filter(Boolean).join(' — ')}
                      </Text>
                      <Text style={styles.cQty}>{l.qty.toFixed(2)}</Text>
                      <Text style={styles.cUom}>{(l.uom ?? '').toUpperCase()}</Text>
                      <Text style={styles.cUnit}>
                        {PHP(componentSellingUnit(l, quotation.productMarkupPct))}
                      </Text>
                      <Text style={styles.cTotal}>
                        {PHP(componentLineTotal(l, quotation.productMarkupPct))}
                      </Text>
                    </View>
                  );
                })}
                <View style={styles.trSub}>
                  <Text style={styles.cItem} />
                  <Text style={styles.cDesc} />
                  <Text style={styles.cQty} />
                  <Text style={styles.cUom} />
                  <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
                  <Text style={styles.cTotal}>{PHP(totals.componentsSubtotal)}</Text>
                </View>
                </View>
              </>
            );
          })()
        )}

        {/* ─── SECTION C — ENGINEERING SERVICES ─── */}
        {hasC && (
          <>
            <Text style={styles.sectionBar}>Engineering Services</Text>
            <View style={styles.tableWrap}>
            {quotation.servicesPerLinePricing ? (
              (() => {
                // Collect unique groups and track which items are grouped
                const groups = new Map<string, typeof quotation.services>();
                const ungrouped: typeof quotation.services = [];
                quotation.services.forEach((l) => {
                  if (l.group) {
                    const arr = groups.get(l.group) || [];
                    arr.push(l);
                    groups.set(l.group, arr);
                  } else {
                    ungrouped.push(l);
                  }
                });
                return (
                  <>
                    <View style={styles.th}>
                      <Text style={styles.cItem}>Item No.</Text>
                      <Text style={styles.cDesc}>Description</Text>
                      <Text style={styles.cQty}>QTY</Text>
                      <Text style={styles.cUom}>UOM</Text>
                      <Text style={styles.cUnit}>Unit Price</Text>
                      <Text style={styles.cTotal}>Total , PhP</Text>
                    </View>
                    {/* Render items; grouped items show pricing on the middle row */}
                    {(() => {
                      const rendered: React.ReactNode[] = [];
                      quotation.services.forEach((l) => {
                        if (l.group) {
                          const members = groups.get(l.group)!;
                          const midIdx = groupedLotDisplayIndex(members.length);
                          const isMid = members[midIdx].id === l.id;
                          const groupTotal = isMid ? members.reduce((s, m) => s + (m.amount || 0), 0) : 0;
                          rendered.push(
                            <View style={styles.tr} key={l.id}>
                              <Text style={styles.cItem}>{l.code}</Text>
                              <Text style={styles.cDesc}>{l.description}</Text>
                              <Text style={styles.cQty}>{isMid ? '1' : ''}</Text>
                              <Text style={styles.cUom}>{isMid ? 'LOT' : ''}</Text>
                              <Text style={styles.cUnit}>{isMid ? PHP(groupTotal) : ''}</Text>
                              <Text style={styles.cTotal}>{isMid ? PHP(groupTotal) : ''}</Text>
                            </View>,
                          );
                        } else {
                          // Ungrouped: show as individual 1 LOT line
                          rendered.push(
                            <View style={styles.tr} key={l.id}>
                              <Text style={styles.cItem}>{l.code}</Text>
                              <Text style={styles.cDesc}>{l.description}</Text>
                              <Text style={styles.cQty}>1</Text>
                              <Text style={styles.cUom}>LOT</Text>
                              <Text style={styles.cUnit}>{PHP(l.amount)}</Text>
                              <Text style={styles.cTotal}>{PHP(l.amount)}</Text>
                            </View>,
                          );
                        }
                      });
                      return rendered;
                    })()}
                    <View style={styles.trSub}>
                      <Text style={styles.cItem} />
                      <Text style={styles.cDesc} />
                      <Text style={styles.cQty} />
                      <Text style={styles.cUom} />
                      <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
                      <Text style={styles.cTotal}>{PHP(totals.servicesSubtotal)}</Text>
                    </View>
                  </>
                );
              })()
            ) : (
              <>
                <View style={styles.th}>
                  <Text style={styles.cItem}>Item No.</Text>
                  <Text style={styles.cDesc}>Description</Text>
                  <Text style={styles.cQty}>QTY</Text>
                  <Text style={styles.cUom}>UOM</Text>
                  <Text style={styles.cUnit}>Unit Price</Text>
                  <Text style={styles.cTotal}>Total , PhP</Text>
                </View>
                {quotation.servicesFromManpower ? (
                  quotation.services.map((l, i) => {
                    const showLotTotal = i === groupedLotDisplayIndex(quotation.services.length);
                    return (
                      <View style={styles.tr} key={l.id}>
                        <Text style={styles.cItem}>{l.code}</Text>
                        <Text style={styles.cDesc}>{l.description}</Text>
                        <Text style={styles.cQty}>{showLotTotal ? String(engineeringServicesQty) : ''}</Text>
                        <Text style={styles.cUom}>{showLotTotal ? 'LOT' : ''}</Text>
                        <Text style={styles.cUnit}>{showLotTotal ? PHP(engineeringServicesUnitPrice) : ''}</Text>
                        <Text style={styles.cTotal}>{showLotTotal ? PHP(totals.servicesSubtotal) : ''}</Text>
                      </View>
                    );
                  })
                ) : (
                  quotation.services.map((l) => (
                    <View style={styles.tr} key={l.id}>
                      <Text style={styles.cItem}>{l.code}</Text>
                      <Text style={styles.cDesc}>{l.description}</Text>
                      <Text style={styles.cQty}>1</Text>
                      <Text style={styles.cUom}>LOT</Text>
                      <Text style={styles.cUnit}>{PHP(l.amount)}</Text>
                      <Text style={styles.cTotal}>{PHP(l.amount)}</Text>
                    </View>
                  ))
                )}
                <View style={styles.trSub}>
                  <Text style={styles.cItem} />
                  <Text style={styles.cDesc} />
                  <Text style={styles.cQty} />
                  <Text style={styles.cUom} />
                  <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
                  <Text style={styles.cTotal}>{PHP(totals.servicesSubtotal)}</Text>
                </View>
              </>
            )}
            </View>
          </>
        )}

        {/* ─── SUMMARY TABLE ─── */}
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryBar}>Summary</Text>
          <View style={styles.sumWrap}>
          <View style={styles.sumTh}>
            <Text style={styles.sumItem}>Item</Text>
            <Text style={styles.sumQty}>QTY</Text>
            <Text style={styles.sumUom}>UOM</Text>
            <Text style={styles.sumPrice}>Price, PhP</Text>
          </View>
          {hasA && (
            <View style={styles.sumRow}>
              <Text style={styles.sumItem}>General Requirements</Text>
              <Text style={styles.sumQty}>1</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.generalReqtsSubtotal)}</Text>
            </View>
          )}
          {hasB && (
            <View style={styles.sumRow}>
              <Text style={styles.sumItem}>Supply of Components</Text>
              <Text style={styles.sumQty}>1</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.componentsSubtotal)}</Text>
            </View>
          )}
          {hasC && (
            <View style={styles.sumRow}>
              <Text style={styles.sumItem}>Engineering Services</Text>
              <Text style={styles.sumQty}>1</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.servicesSubtotal)}</Text>
            </View>
          )}
          <View style={[styles.sumFooterRow, styles.sumTotalRow]}>
            <Text style={styles.sumFooterLabel}>TOTAL PRICE, PhP (VAT-EX)</Text>
            <Text style={styles.sumFooterValue}>{PHP(totals.subtotal)}</Text>
          </View>
          {quotation.discountPct > 0 && (
            <>
              <View style={styles.sumFooterRow}>
                <Text style={styles.sumFooterLabel}>DISCOUNT({quotation.discountPct}%)</Text>
                <Text style={styles.sumFooterValue}>{PHP(totals.discount)}</Text>
              </View>
              <View style={styles.sumFooterRow}>
                <Text style={styles.sumFooterLabel}>DISCOUNTED PRICE (VAT-EX)</Text>
                <Text style={styles.sumFooterValue}>{PHP(totals.subtotal - totals.discount)}</Text>
              </View>
            </>
          )}
          {quotation.vatPct > 0 && (
            <>
              <View style={styles.sumFooterRow}>
                <Text style={styles.sumFooterLabel}>{quotation.vatPct}% VAT</Text>
                <Text style={styles.sumFooterValue}>{PHP(totals.vat)}</Text>
              </View>
              <View style={[styles.sumFooterRow, styles.sumTotalRow]}>
                <Text style={styles.sumFooterLabel}>TOTAL PRICE, PhP (VAT-IN)</Text>
                <Text style={styles.sumFooterValue}>{PHP(totals.grandTotal)}</Text>
              </View>
            </>
          )}
          </View>
        </View>

        {/* ─── TERMS AND CONDITIONS ─── */}
        <View style={styles.terms} break={!!quotation.pageBreakBeforeTerms}>
          <View wrap={false}>
            <Text style={styles.termsTitle}>Terms and Conditions</Text>
            <Text style={styles.termSubtitle}>Scope of Work</Text>
            <Text style={styles.termText}>
              {to.scopeOfWork
                ? to.scopeOfWork
                : '- The scope of work shall be limited strictly to the items, specifications, and services explicitly stated in this proposal. Any additional works, modifications, or deviations not covered herein shall be treated as a Variation Order and shall be subject to separate quotation, approval, and corresponding adjustment in price and delivery schedule.'}
            </Text>
          </View>

          <Text style={styles.termSubtitle}>Basis of Proposal</Text>
          <Text style={styles.termText}>
            {to.basisOfProposal
              ? to.basisOfProposal
              : `- This offer is based on the technical documents, drawings, specifications, and other references provided by the Client at the time of quotation. ${issuer.name} reserves the right to revise pricing, scope, and schedule should there be significant changes, inconsistencies, or incomplete information discovered after award.`}
          </Text>

          <Text style={styles.termSubtitle}>Validity of Offer</Text>
          <Text style={styles.termText}>
            - This quotation is valid for {numToWords(quotation.validityDays)} ({quotation.validityDays}) calendar days from issuance.
          </Text>

          <Text style={styles.termSubtitle}>Delivery</Text>
          {to.deliveryLines
            ? to.deliveryLines.split('\n').filter(Boolean).map((line, i) => (
                <Text key={i} style={styles.termText}>{line}</Text>
              ))
            : (
              <>
                <Text style={styles.termText}>- {quotation.deliveryTerms || 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.'}</Text>
                <Text style={styles.termText}>- Delivery terms shall be DDP – Client's Plant Site, unless otherwise specified.</Text>
              </>
            )}

          <Text style={styles.termSubtitle}>Payment Terms</Text>
          <Text style={styles.termText}>- {quotation.paymentTerms}.</Text>

          <Text style={styles.termSubtitle}>Warranty</Text>
          <Text style={styles.termText}>
            - {numToWords(quotation.warrantyMonths).charAt(0).toUpperCase() + numToWords(quotation.warrantyMonths).slice(1)} ({quotation.warrantyMonths}) months
            from project completion and acceptance, covering defects in materials and workmanship under normal operating conditions.
          </Text>
          <Text style={styles.termText}>
            {to.warrantyExclusion
              ? to.warrantyExclusion
              : '- Warranty excludes improper installation, unauthorized modifications, misuse, abnormal conditions, power surges, environmental damage, or force majeure events.'}
          </Text>
        </View>

        {/* ─── CLOSING ─── */}
        <Text style={styles.closing}>
          We hope this proposal meets your requirements. Please feel free to contact us for any clarification.
        </Text>

        {/* ─── SIGNATURES ─── */}
        <View style={styles.signatures}>
          <View style={styles.sigBlock}>
            <Text style={styles.sigHeader}>Prepared by:</Text>
            {prepName ? (
              <>
                <Text style={styles.sigName}>{prepName}</Text>
                {prepTitle && <Text style={styles.sigSub}>{prepTitle}</Text>}
                {staff?.phone && <Text style={styles.sigSub}>Mobile No.: {staff.phone}</Text>}
                {staff?.email && <Text style={styles.sigEmail}>{staff.email}</Text>}
              </>
            ) : (
              <Text style={styles.sigSub}>{issuer.name}</Text>
            )}
          </View>
          <View style={styles.sigBlock}>
            <Text style={styles.sigHeader}>Accepted by:</Text>
            <Text style={styles.sigSub}>For and on behalf of {recipient?.name ?? '—'}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Render a quotation to a PDF blob. By default also triggers a local download
 * via file-saver, preserving the previous behavior of this function.
 *
 * Pass `{ save: false }` to skip the local download (useful when the caller
 * wants to handle saving themselves — e.g. uploading the blob to OneDrive and
 * showing a custom toast).
 *
 * Returns `{ blob, filename }` so callers can re-use the rendered PDF for both
 * local download and remote upload without rendering twice.
 */
export async function exportQuotationPdf(
  quotation: Quotation,
  project: Project,
  recipient: Client | null,
  customer: Client | null,
  salesContacts: SalesContact[],
  options: { save?: boolean } = {},
): Promise<{ blob: Blob; filename: string }> {
  const blob = await pdf(
    <QuotationDoc
      quotation={quotation}
      project={project}
      recipient={recipient}
      customer={customer}
      salesContacts={salesContacts}
    />,
  ).toBlob();

  const arrayBuffer = await blob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const text = `Page ${i + 1} of ${totalPages}`;
    const size = 8.5;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: width - 36 - textWidth,
      y: 27,
      size,
      font,
      color: rgb(0.133, 0.133, 0.133),
    });
  }

  const modifiedBytes = await pdfDoc.save();
  const modifiedBlob = new Blob([modifiedBytes], { type: 'application/pdf' });
  const filename = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}.pdf`;
  if (options.save !== false) {
    saveAs(modifiedBlob, filename);
  }
  return { blob: modifiedBlob, filename };
}
