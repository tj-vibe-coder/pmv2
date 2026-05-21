import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { Client, Project, Quotation } from '../../types/Quotation';
import { resolveContact } from '../../types/Client';
import {
  computeTotals, lineGeneralTotal, componentLineTotal, componentSellingUnit, PHP,
} from './calc';

// ─── Branding ────────────────────────────────────────────────────────────────
const PRIMARY = '#2c5aa0';
const TEXT = '#222';
const TEXT_LIGHT = '#666';
const ROW_ALT = '#F2F4F7';
const BORDER = '#999';
const BORDER_LIGHT = '#DDD';

const ISSUER_INFO = {
  IOCT: {
    name: 'IO Control Technologie OPC',
    addressLines: [
      'B63, L7 Dynamism Jubilation Enclave,',
      'Santo Niño, City of Biñan, Laguna,',
      'Region IV-A (Calabarzon), 4024',
    ],
    tin: 'TIN: 697-029-976-00000',
    logo: '/logo-ioct.png',
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

// Known IOCT staff — provides title/phone/email when authorizedBy matches.
const IOCT_STAFF: Record<string, { title: string; phone: string; email: string }> = {
  'Reuel Joshua T. Rivera': {
    title: 'Solutions Manager',
    phone: '+63 919 082 5434',
    email: 'reuel.rivera@iocontroltech.com',
  },
  'Renzel Punongbayan': {
    title: 'Engineering Supervisor',
    phone: '+63 999 557 0678',
    email: 'renzel.punongbayan@iocontroltech.com',
  },
};

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

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 50, paddingHorizontal: 36,
    fontSize: 9, fontFamily: 'Helvetica', color: TEXT, lineHeight: 1.4,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  headerLeft: { width: '55%' },
  logo: { width: 90, height: 28, objectFit: 'contain', marginBottom: 6 },
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

  // Section bars
  sectionBar: {
    backgroundColor: PRIMARY, color: 'white', fontWeight: 700,
    fontSize: 9, padding: '4 8', marginTop: 8,
  },

  // Table
  th: {
    flexDirection: 'row', backgroundColor: ROW_ALT,
    borderTop: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}`,
    padding: '4 4', fontWeight: 700, fontSize: 8.5,
  },
  tr: {
    flexDirection: 'row', borderBottom: `0.25px solid ${BORDER_LIGHT}`,
    padding: '3 4', fontSize: 8.5,
  },
  trSub: {
    flexDirection: 'row', backgroundColor: ROW_ALT,
    padding: '3 4', fontWeight: 700, fontSize: 8.5,
    borderTop: `0.5px solid ${BORDER}`,
  },

  cItem: { width: '10%' },
  cDesc: { width: '48%' },
  cQty: { width: '8%', textAlign: 'center' },
  cUom: { width: '8%', textAlign: 'center' },
  cUnit: { width: '13%', textAlign: 'right' },
  cTotal: { width: '13%', textAlign: 'right' },

  // Summary
  sumTh: {
    flexDirection: 'row', backgroundColor: PRIMARY, color: 'white',
    padding: '4 6', fontWeight: 700, fontSize: 9,
  },
  sumRow: {
    flexDirection: 'row', borderBottom: `0.25px solid ${BORDER_LIGHT}`,
    padding: '3 6', fontSize: 9,
  },
  sumItem: { flex: 1 },
  sumQty: { width: '10%', textAlign: 'center' },
  sumUom: { width: '10%', textAlign: 'center' },
  sumPrice: { width: '20%', textAlign: 'right' },
  sumFooterRow: {
    flexDirection: 'row', justifyContent: 'flex-end', padding: '3 6', fontSize: 9.5,
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
  footer: {
    position: 'absolute', bottom: 18, left: 36, right: 36,
    fontSize: 8, color: TEXT_LIGHT, flexDirection: 'row',
    justifyContent: 'space-between', borderTop: `0.5px solid ${BORDER_LIGHT}`,
    paddingTop: 6,
  },
});

interface Props {
  quotation: Quotation;
  project: Project;
  recipient: Client | null;
  customer: Client | null;
}

function QuotationDoc({ quotation, project, recipient, customer }: Props) {
  const totals = computeTotals(quotation);
  const issuer = ISSUER_INFO[quotation.kind];
  const refNo = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}`;
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}${issuer.logo}` : issuer.logo;

  // Section presence
  const hasA = quotation.generalReqts.length > 0;
  const hasB = quotation.components.length > 0;
  const hasC = quotation.services.length > 0 || totals.servicesSubtotal > 0;

  // Authorized by (with optional staff contact info)
  const authName = quotation.authorizedBy || '';
  const staff = IOCT_STAFF[authName];

  // Resolve which contact the quotation addresses (explicit contactId or primary)
  const recipContact = resolveContact(recipient, quotation.contactId);
  const recipFirst = firstName(recipContact?.name);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── HEADER ─── */}
        <View style={styles.header} fixed>
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
              <Text style={styles.metaValue}>{format(new Date(project.date), 'd MMMM yyyy')}</Text>
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
            <View style={styles.th}>
              <Text style={styles.cItem}>Item No.</Text>
              <Text style={styles.cDesc}>Description</Text>
              <Text style={styles.cQty}>QTY</Text>
              <Text style={styles.cUom}>UOM</Text>
              <Text style={styles.cUnit}>Unit Price</Text>
              <Text style={styles.cTotal}>Total , PHP</Text>
            </View>
            {quotation.generalReqts.map((l) => (
              <View style={styles.tr} key={l.id}>
                <Text style={styles.cItem}>{l.code}</Text>
                <Text style={styles.cDesc}>{l.description}</Text>
                <Text style={styles.cQty}>{l.qty}</Text>
                <Text style={styles.cUom}>{l.uom}</Text>
                <Text style={styles.cUnit}>{PHP(l.unitPrice)}</Text>
                <Text style={styles.cTotal}>{PHP(lineGeneralTotal(l))}</Text>
              </View>
            ))}
            <View style={styles.trSub}>
              <Text style={[styles.cItem]} />
              <Text style={[styles.cDesc]} />
              <Text style={styles.cQty} />
              <Text style={styles.cUom} />
              <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
              <Text style={styles.cTotal}>{PHP(totals.generalReqtsSubtotal)}</Text>
            </View>
          </>
        )}

        {/* ─── SECTION B — SUPPLY OF COMPONENTS ─── */}
        {hasB && (
          <>
            <Text style={styles.sectionBar}>Supply of Components</Text>
            <View style={styles.th}>
              <Text style={styles.cItem}>Item No.</Text>
              <Text style={styles.cDesc}>Description</Text>
              <Text style={styles.cQty}>QTY</Text>
              <Text style={styles.cUom}>UOM</Text>
              <Text style={styles.cUnit}>Unit Price</Text>
              <Text style={styles.cTotal}>Total , PHP</Text>
            </View>
            {quotation.components.map((l) => (
              <View style={styles.tr} key={l.id}>
                <Text style={styles.cItem}>{l.code}</Text>
                <Text style={styles.cDesc}>
                  {[l.brand, l.description, l.partNo].filter(Boolean).join(' — ')}
                </Text>
                <Text style={styles.cQty}>{l.qty.toFixed(2)}</Text>
                <Text style={styles.cUom}>{l.uom}</Text>
                <Text style={styles.cUnit}>
                  {PHP(componentSellingUnit(l, quotation.productMarkupPct))}
                </Text>
                <Text style={styles.cTotal}>
                  {PHP(componentLineTotal(l, quotation.productMarkupPct))}
                </Text>
              </View>
            ))}
            <View style={styles.trSub}>
              <Text style={styles.cItem} />
              <Text style={styles.cDesc} />
              <Text style={styles.cQty} />
              <Text style={styles.cUom} />
              <Text style={[styles.cUnit, { textAlign: 'right' }]}>sub total (vat-ex)</Text>
              <Text style={styles.cTotal}>{PHP(totals.componentsSubtotal)}</Text>
            </View>
          </>
        )}

        {/* ─── SECTION C — ENGINEERING SERVICES ─── */}
        {hasC && (
          <>
            <Text style={styles.sectionBar}>Engineering Services</Text>
            <View style={styles.th}>
              <Text style={styles.cItem}>Item No.</Text>
              <Text style={styles.cDesc}>Description</Text>
              <Text style={styles.cQty}>QTY</Text>
              <Text style={styles.cUom}>UOM</Text>
              <Text style={styles.cUnit}>Unit Price</Text>
              <Text style={styles.cTotal}>Total , PHP</Text>
            </View>
            {quotation.servicesFromManpower ? (
              quotation.services.map((l, i) => {
                const isLast = i === quotation.services.length - 1;
                return (
                  <View style={styles.tr} key={l.id}>
                    <Text style={styles.cItem}>{l.code}</Text>
                    <Text style={styles.cDesc}>{l.description}</Text>
                    <Text style={styles.cQty}>{isLast ? '1' : ''}</Text>
                    <Text style={styles.cUom}>{isLast ? 'LOT' : ''}</Text>
                    <Text style={styles.cUnit}>{isLast ? PHP(totals.servicesSubtotal) : ''}</Text>
                    <Text style={styles.cTotal}>{isLast ? PHP(totals.servicesSubtotal) : ''}</Text>
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

        {/* ─── SUMMARY TABLE ─── */}
        <Text style={[styles.sectionBar, { marginTop: 12 }]}>Summary</Text>
        <View style={styles.sumTh}>
          <Text style={styles.sumItem}>Item</Text>
          <Text style={styles.sumQty}>QTY</Text>
          <Text style={styles.sumUom}>UOM</Text>
          <Text style={styles.sumPrice}>Price, PHP</Text>
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
        <View style={styles.sumFooterRow}>
          <Text style={styles.sumFooterLabel}>TOTAL PRICE, PHP (VAT-EX)</Text>
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
            <View style={styles.sumFooterRow}>
              <Text style={styles.sumFooterLabel}>TOTAL PRICE, PHP (VAT-IN)</Text>
              <Text style={styles.sumFooterValue}>{PHP(totals.grandTotal)}</Text>
            </View>
          </>
        )}

        {/* ─── TERMS AND CONDITIONS ─── */}
        <View style={styles.terms}>
          <Text style={styles.termsTitle}>Terms and Conditions</Text>

          <Text style={styles.termSubtitle}>Scope of Work</Text>
          <Text style={styles.termText}>
            - The scope of work shall be limited strictly to the items, specifications, and services explicitly stated in this proposal.
            Any additional works, modifications, or deviations not covered herein shall be treated as a Variation Order and shall be
            subject to separate quotation, approval, and corresponding adjustment in price and delivery schedule.
          </Text>

          <Text style={styles.termSubtitle}>Basis of Proposal</Text>
          <Text style={styles.termText}>
            - This offer is based on the technical documents, drawings, specifications, and other references provided by the Client
            at the time of quotation. IO Control Technologie OPC reserves the right to revise pricing, scope, and schedule should
            there be significant changes, inconsistencies, or incomplete information discovered after award.
          </Text>

          <Text style={styles.termSubtitle}>Validity of Offer</Text>
          <Text style={styles.termText}>
            - This quotation is valid for {numToWords(quotation.validityDays)} ({quotation.validityDays}) calendar days from issuance.
          </Text>

          <Text style={styles.termSubtitle}>Delivery</Text>
          <Text style={styles.termText}>- {quotation.deliveryTerms || 'Delivery is 1-2 weeks, upon receipt of a technically and commercially clarified purchase order.'}</Text>
          <Text style={styles.termText}>- Delivery terms shall be DDP – Client's Plant Site, unless otherwise specified.</Text>

          <Text style={styles.termSubtitle}>Payment Terms</Text>
          <Text style={styles.termText}>- {quotation.paymentTerms}.</Text>

          <Text style={styles.termSubtitle}>Warranty</Text>
          <Text style={styles.termText}>
            - {numToWords(quotation.warrantyMonths).charAt(0).toUpperCase() + numToWords(quotation.warrantyMonths).slice(1)} ({quotation.warrantyMonths}) months
            from project completion and acceptance, covering defects in materials and workmanship under normal operating conditions.
          </Text>
          <Text style={styles.termText}>
            - Warranty excludes improper installation, unauthorized modifications, misuse, abnormal conditions, power surges,
            environmental damage, or force majeure events.
          </Text>
        </View>

        {/* ─── CLOSING ─── */}
        <Text style={styles.closing}>
          We hope this proposal meets your requirements. Please feel free to contact us for any clarification.
        </Text>

        {/* ─── SIGNATURES ─── */}
        <View style={styles.signatures}>
          <View style={styles.sigBlock}>
            <Text style={styles.sigHeader}>Authorized by:</Text>
            {authName ? (
              <>
                <Text style={styles.sigName}>{authName}</Text>
                {staff && (
                  <>
                    <Text style={styles.sigSub}>{staff.title}</Text>
                    <Text style={styles.sigSub}>Mobile No.: {staff.phone}</Text>
                    <Text style={styles.sigEmail}>{staff.email}</Text>
                  </>
                )}
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

        {/* ─── FOOTER ─── */}
        <View style={styles.footer} fixed>
          <Text>{issuer.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function exportQuotationPdf(
  quotation: Quotation, project: Project, recipient: Client | null, customer: Client | null,
) {
  const blob = await pdf(
    <QuotationDoc quotation={quotation} project={project} recipient={recipient} customer={customer} />
  ).toBlob();
  const filename = `${project.code.replace(/-[A-Z]{3}-\d{2}$/, '')}-${(recipient?.code ?? 'XXX').slice(0, 3)}-${quotation.revision}.pdf`;
  saveAs(blob, filename);
}
