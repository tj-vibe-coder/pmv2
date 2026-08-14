import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Client, ComponentLine, Project, QuotationKind, Quotation, SalesContact } from '../../types/Quotation';
import { resolveContact } from '../../types/Client';
import {
  computeTotals, lineGeneralTotal, componentLineTotal, componentSellingUnit, PHP, NUM,
  formatDiscountPct,
} from './calc';
import { DEFAULT_SCOPE_OF_WORK, defaultBasisOfProposal, defaultDeliveryText, DEFAULT_WARRANTY_EXCLUSION } from './defaultTerms';
import { quotationRefNo } from './codes';

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
// When the quotation is issued under ACTI, prefer each contact's
// actiPosition/actiEmail (their designation under the ACTI partnership),
// falling back to the IOCT position/email when no ACTI override is set.
function lookupStaff(
  name: string | undefined,
  salesContacts: SalesContact[],
  kind: QuotationKind,
): { title: string; phone: string; email: string } | null {
  if (!name) return null;
  const trimmed = name.trim().toLowerCase();
  const match = salesContacts.find((c) => c.name.trim().toLowerCase() === trimmed);
  if (!match) return null;
  const isActi = kind === 'ACTI';
  return {
    title: (isActi ? match.actiPosition : undefined) || match.position || '',
    phone: match.phone || '',
    email: (isActi ? match.actiEmail : undefined) || match.email || '',
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
// Autocompact: short quotations (few item rows) render with a lot of empty
// vertical space, which can still push the Terms/Signatures block onto a
// second page depending on how long the terms text is. `buildStyles(scale)`
// scales font sizes, paddings, and margins down uniformly so the whole
// document is more likely to fit on a single A4 page. `compactionScale()`
// below picks the scale tier from the item-row count; 1 = no compaction.
function buildStyles(scale: number) {
  // Round to 2dp so react-pdf gets clean numbers, not float noise.
  const s = (n: number) => Math.round(n * scale * 100) / 100;

  return StyleSheet.create({
    page: {
      paddingTop: s(36), paddingBottom: s(50), paddingHorizontal: s(36),
      fontSize: s(9), fontFamily: 'Helvetica', color: TEXT, lineHeight: 1.3,
    },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: s(12) },
    headerLeft: { width: '55%' },
    logo: { width: s(64), height: s(64), objectFit: 'contain', marginBottom: 0 },
    brandName: { color: PRIMARY, fontSize: s(11), fontWeight: 700, marginBottom: 1 },
    brandLine: { fontSize: s(8.5), color: TEXT, lineHeight: 1.3 },
    headerRight: { width: '45%', alignItems: 'flex-end' },
    qTitle: { fontSize: s(24), fontWeight: 700, color: TEXT, marginBottom: s(14), letterSpacing: 1, lineHeight: 1 },
    metaRow: { flexDirection: 'row', fontSize: s(9), marginBottom: 2 },
    metaLabel: { width: s(56), fontWeight: 700, textAlign: 'right', marginRight: 6, color: TEXT_LIGHT },
    metaValue: { minWidth: s(110), textAlign: 'left' },

    // Recipient + project
    recipient: { marginBottom: s(12), marginTop: s(4) },
    recipientName: { fontSize: s(10), fontWeight: 700, marginBottom: 1 },
    recipientLine: { fontSize: s(9) },

    projectRow: { flexDirection: 'row', marginBottom: s(10) },
    projectLabel: { fontSize: s(9.5), fontWeight: 700, color: PRIMARY, width: s(56) },
    projectName: { fontSize: s(9.5), color: PRIMARY, fontWeight: 700, flex: 1 },

    greeting: { fontSize: s(9), marginBottom: s(4) },
    intro: { fontSize: s(9), marginBottom: s(8) },

    // Section bars — solid PRIMARY fill, white text
    sectionBar: {
      backgroundColor: PRIMARY, color: 'white', fontWeight: 700,
      fontSize: s(9), padding: `${s(2)} ${s(8)}`, marginTop: s(8),
    },
    // Dark-gray variant used for the "Optional Items" header, to visually set it
    // apart from the contract (navy) sections.
    sectionBarGray: {
      backgroundColor: '#4a4f57', color: 'white', fontWeight: 700,
      fontSize: s(9), padding: `${s(2)} ${s(8)}`, marginTop: s(8),
    },
    // Summary label — same solid PRIMARY treatment
    summaryBar: {
      backgroundColor: PRIMARY, color: 'white', fontWeight: 700,
      fontSize: s(9.5), padding: `${s(2)} ${s(8)}`,
    },

    // Table — clean, no cell borders
    tableWrap: {},
    th: {
      flexDirection: 'row', backgroundColor: SECTION_BG,
      borderBottom: `0.5px solid ${BORDER}`,
      fontWeight: 700, fontSize: s(8.5),
    },
    tr: {
      flexDirection: 'row',
      fontSize: s(8.5),
    },
    // Sub-total band — tinted like the table header so the money row stands
    // out from plain item rows without competing with the navy section bars.
    trSub: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: `${s(3)} ${s(6)}`, fontSize: s(8.5),
      backgroundColor: SECTION_BG,
      borderTop: `0.5px solid ${BORDER}`,
    },

    cItem: { width: '10%', paddingLeft: s(4), paddingVertical: s(2) },
    cDesc: { width: '48%', paddingLeft: s(8), paddingRight: s(2), paddingVertical: s(2) },
    // Muted brand/part-number sub-line under the item name.
    cDescSub: { fontSize: s(7.5), color: TEXT_LIGHT, marginTop: 1 },
    cQty: { width: '8%', paddingVertical: s(2), textAlign: 'center' },
    cUom: { width: '8%', paddingVertical: s(2), textAlign: 'center' },
    cUnit: { width: '13%', paddingRight: s(4), paddingVertical: s(2), textAlign: 'right' },
    cTotal: { width: '13%', paddingRight: s(4), paddingVertical: s(2), textAlign: 'right' },

    // Summary
    summaryBlock: { marginTop: s(4) },
    sumWrap: {},
    sumTh: {
      flexDirection: 'row', backgroundColor: SECTION_BG, color: TEXT,
      borderBottom: `0.5px solid ${BORDER}`,
      fontWeight: 700, fontSize: s(9),
    },
    sumRow: {
      flexDirection: 'row',
      fontSize: s(9),
    },
    sumItem: { flex: 1, paddingLeft: s(6), paddingVertical: s(2) },
    sumQty: { width: '10%', paddingVertical: s(2), textAlign: 'center' },
    sumUom: { width: '10%', paddingVertical: s(2), textAlign: 'center' },
    sumPrice: { width: '20%', paddingRight: s(6), paddingVertical: s(2), textAlign: 'right' },
    sumFooterRow: {
      flexDirection: 'row', justifyContent: 'flex-end', padding: `${s(3)} ${s(6)}`, fontSize: s(9.5),
    },
    sumTotalRow: {
      borderTop: `0.5px solid ${BORDER}`,
    },
    sumFooterLabel: { fontWeight: 700, marginRight: s(16) },
    sumFooterValue: { fontWeight: 700, width: '20%', textAlign: 'right' },

    // Terms
    terms: { marginTop: s(14) },
    termsTitle: { fontWeight: 700, fontSize: s(10), marginBottom: s(4) },
    termSubtitle: { fontWeight: 700, marginTop: s(8), marginBottom: s(2), fontSize: s(9) },
    termText: { fontSize: s(8.5), lineHeight: 1.4, marginTop: 1 },

    // Closing
    closing: { marginTop: s(14), fontSize: s(9) },

    // Signatures
    signatures: { flexDirection: 'row', marginTop: s(18), gap: s(32) },
    sigBlock: { flex: 1 },
    sigHeader: { fontWeight: 700, fontSize: s(9.5), marginBottom: s(30) },
    sigName: { fontSize: s(9), fontWeight: 700 },
    sigSub: { fontSize: s(8.5) },
    sigEmail: { fontSize: s(8.5), color: PRIMARY, textDecoration: 'underline', marginTop: 1 },

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
}

// Picks a compaction tier from how much content the quotation actually has —
// item row count plus a rough terms-text length estimate. Few rows and short
// terms → shrink more aggressively; a normal multi-line quotation stays at
// full size (scale 1) since it likely spans multiple pages anyway.
function compactionScale(totalRows: number, termsCharCount: number): number {
  if (totalRows <= 3 && termsCharCount < 900) return 0.82;
  if (totalRows <= 6 && termsCharCount < 1200) return 0.9;
  if (totalRows <= 10 && termsCharCount < 1500) return 0.96;
  return 1;
}

// Component description cell: item name as the main line, brand + part number
// as a muted sub-line underneath (reads like a hand-written spec sheet, not a
// dash-joined string).
function ComponentDesc({ l, styles }: { l: ComponentLine; styles: ReturnType<typeof buildStyles> }) {
  const sub = [l.brand, l.partNo].filter(Boolean).join(', ');
  return (
    <View style={styles.cDesc}>
      <Text>{l.description || ''}</Text>
      {sub ? <Text style={styles.cDescSub}>{sub}</Text> : null}
    </View>
  );
}

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

  const totalRows = quotation.generalReqts.length + quotation.components.length + quotation.services.length;
  const to0 = quotation.termsOverrides ?? {};
  const termsCharCount = [
    to0.scopeOfWork, to0.exclusions, to0.basisOfProposal, to0.deliveryLines, to0.warrantyExclusion,
  ].reduce((sum, t) => sum + (t?.length || 0), 0);
  const scale = compactionScale(totalRows, termsCharCount);
  const styles = buildStyles(scale);
  const refNo = quotationRefNo(project.code, recipient?.code, quotation.revision);
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}${issuer.logo}` : issuer.logo;
  const dateSent = quotationDate(quotation.dateSent);

  // Auto-numbering helper: assigns sequential codes (A-0010, A-0020...).
  // Grouped items share one code — only the first item in each group gets a new number.
  function autoNumber(prefix: string, items: { id: string; group?: string }[]): Map<string, string> {
    const codes = new Map<string, string>();
    let seq = 0;
    const groupCodes = new Map<string, string>();
    items.forEach((item) => {
      if (item.group) {
        if (!groupCodes.has(item.group)) {
          seq += 10;
          groupCodes.set(item.group, `${prefix}-${String(seq).padStart(4, '0')}`);
        }
        codes.set(item.id, groupCodes.get(item.group)!);
      } else {
        seq += 10;
        codes.set(item.id, `${prefix}-${String(seq).padStart(4, '0')}`);
      }
    });
    return codes;
  }

  const codesA = autoNumber('A', quotation.generalReqts);
  const codesC = autoNumber('C', quotation.services);

  // Optional components are priced for reference only — pulled out of Section B
  // and listed in their own "Optional Items" section (not in the contract total).
  const contractComponents = quotation.components.filter((l) => !l.optional);
  const optionalComponents = quotation.components.filter((l) => l.optional);
  const codesB = autoNumber('B', contractComponents);
  const codesOpt = autoNumber('OP', optionalComponents);

  // Section presence
  const hasA = quotation.generalReqts.length > 0;
  const hasB = contractComponents.length > 0;
  const hasOptional = optionalComponents.length > 0;
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
  const staff = lookupStaff(prepName, salesContacts, quotation.kind);
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
          {recipContact?.name && <Text style={styles.recipientLine}>{recipContact.name}</Text>}
          {recipContact?.position && <Text style={styles.recipientLine}>{recipContact.position}</Text>}
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
                    <Text style={styles.cItem}>{codesA.get(l.id)}</Text>
                    <Text style={styles.cDesc}>{l.description}</Text>
                    <Text style={styles.cQty}>{showLotTotal ? NUM(generalReqtsExportQty) : ''}</Text>
                    <Text style={styles.cUom}>{showLotTotal ? 'LOT' : ''}</Text>
                    <Text style={styles.cUnit}>{showLotTotal ? NUM(generalReqtsExportUnitPrice) : ''}</Text>
                    <Text style={styles.cTotal}>{showLotTotal ? NUM(totals.generalReqtsSubtotal) : ''}</Text>
                  </View>
                );
              })
            ) : (
              quotation.generalReqts.map((l) => (
                <View style={styles.tr} key={l.id}>
                  <Text style={styles.cItem}>{codesA.get(l.id)}</Text>
                  <Text style={styles.cDesc}>{l.description}</Text>
                  <Text style={styles.cQty}>{NUM(l.qty)}</Text>
                  <Text style={styles.cUom}>{(l.uom ?? '').toUpperCase()}</Text>
                  <Text style={styles.cUnit}>{NUM(l.unitPrice)}</Text>
                  <Text style={styles.cTotal}>{NUM(lineGeneralTotal(l))}</Text>
                </View>
              ))
            )}
            </View>
            <View style={styles.trSub}>
              <Text style={{ fontWeight: 500 }}>sub total (vat-ex)</Text>
              <Text style={{ fontWeight: 700, marginLeft: 12, color: PRIMARY }}>{PHP(totals.generalReqtsSubtotal)}</Text>
            </View>
          </>
        )}

        {/* ─── SECTION B — SUPPLY OF COMPONENTS ─── */}
        {hasB && (
          (() => {
            const compGroups = new Map<string, typeof quotation.components>();
            contractComponents.forEach((l) => {
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
                {contractComponents.map((l) => {
                  if (l.group) {
                    const members = compGroups.get(l.group)!;
                    const midIdx = groupedLotDisplayIndex(members.length);
                    const isMid = members[midIdx].id === l.id;
                    const isFirst = members[0].id === l.id;
                    const groupTotal = isMid
                      ? members.reduce((s, m) => s + componentLineTotal(m, quotation.productMarkupPct), 0)
                      : 0;
                    // 'itemized' shows each member's own qty + UOM; the group is
                    // still priced as one combined amount on the middle row, so
                    // no per-unit price is disclosed for the members.
                    const itemized = quotation.componentGroupDisplay?.[l.group] === 'itemized';
                    return (
                      <View style={styles.tr} key={l.id}>
                        <Text style={styles.cItem}>{isFirst ? codesB.get(l.id) : ''}</Text>
                        <ComponentDesc l={l} styles={styles} />
                        <Text style={styles.cQty}>{itemized ? NUM(l.qty) : (isMid ? NUM(1) : '')}</Text>
                        <Text style={styles.cUom}>{itemized ? (l.uom ?? '').toUpperCase() : (isMid ? 'LOT' : '')}</Text>
                        <Text style={styles.cUnit}>{isMid ? NUM(groupTotal) : ''}</Text>
                        <Text style={styles.cTotal}>{isMid ? NUM(groupTotal) : ''}</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.tr} key={l.id}>
                      <Text style={styles.cItem}>{codesB.get(l.id)}</Text>
                      <ComponentDesc l={l} styles={styles} />
                      <Text style={styles.cQty}>{NUM(l.qty)}</Text>
                      <Text style={styles.cUom}>{(l.uom ?? '').toUpperCase()}</Text>
                      <Text style={styles.cUnit}>{NUM(componentSellingUnit(l, quotation.productMarkupPct))}</Text>
                      <Text style={styles.cTotal}>{NUM(componentLineTotal(l, quotation.productMarkupPct))}</Text>
                    </View>
                  );
                })}
                </View>
                <View style={styles.trSub}>
                  <Text style={{ fontWeight: 500 }}>sub total (vat-ex)</Text>
                  <Text style={{ fontWeight: 700, marginLeft: 12, color: PRIMARY }}>{PHP(totals.componentsSubtotal)}</Text>
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
                          const isFirst = members[0].id === l.id;
                          const groupTotal = isMid ? members.reduce((s, m) => s + (m.amount || 0), 0) : 0;
                          rendered.push(
                            <View style={styles.tr} key={l.id}>
                              <Text style={styles.cItem}>{isFirst ? codesC.get(l.id) : ''}</Text>
                              <Text style={styles.cDesc}>{l.description}</Text>
                              <Text style={styles.cQty}>{isMid ? NUM(1) : ''}</Text>
                              <Text style={styles.cUom}>{isMid ? 'LOT' : ''}</Text>
                              <Text style={styles.cUnit}>{isMid ? NUM(groupTotal) : ''}</Text>
                              <Text style={styles.cTotal}>{isMid ? NUM(groupTotal) : ''}</Text>
                            </View>,
                          );
                        } else {
                          // Ungrouped: show as individual 1 LOT line
                          rendered.push(
                            <View style={styles.tr} key={l.id}>
                              <Text style={styles.cItem}>{codesC.get(l.id)}</Text>
                              <Text style={styles.cDesc}>{l.description}</Text>
                              <Text style={styles.cQty}>{NUM(1)}</Text>
                              <Text style={styles.cUom}>LOT</Text>
                              <Text style={styles.cUnit}>{NUM(l.amount)}</Text>
                              <Text style={styles.cTotal}>{NUM(l.amount)}</Text>
                            </View>,
                          );
                        }
                      });
                      return rendered;
                    })()}
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
                        <Text style={styles.cItem}>{codesC.get(l.id)}</Text>
                        <Text style={styles.cDesc}>{l.description}</Text>
                        <Text style={styles.cQty}>{showLotTotal ? NUM(engineeringServicesQty) : ''}</Text>
                        <Text style={styles.cUom}>{showLotTotal ? 'LOT' : ''}</Text>
                        <Text style={styles.cUnit}>{showLotTotal ? NUM(engineeringServicesUnitPrice) : ''}</Text>
                        <Text style={styles.cTotal}>{showLotTotal ? NUM(totals.servicesSubtotal) : ''}</Text>
                      </View>
                    );
                  })
                ) : (
                  quotation.services.map((l) => (
                    <View style={styles.tr} key={l.id}>
                      <Text style={styles.cItem}>{codesC.get(l.id)}</Text>
                      <Text style={styles.cDesc}>{l.description}</Text>
                      <Text style={styles.cQty}>{NUM(1)}</Text>
                      <Text style={styles.cUom}>LOT</Text>
                      <Text style={styles.cUnit}>{NUM(l.amount)}</Text>
                      <Text style={styles.cTotal}>{NUM(l.amount)}</Text>
                    </View>
                  ))
                )}
              </>
            )}
            </View>
            <View style={styles.trSub}>
              <Text style={{ fontWeight: 500 }}>sub total (vat-ex)</Text>
              <Text style={{ fontWeight: 700, marginLeft: 12, color: PRIMARY }}>{PHP(totals.servicesSubtotal)}</Text>
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
              <Text style={styles.sumQty}>{NUM(1)}</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.generalReqtsSubtotal)}</Text>
            </View>
          )}
          {hasB && (
            <View style={styles.sumRow}>
              <Text style={styles.sumItem}>Supply of Components</Text>
              <Text style={styles.sumQty}>{NUM(1)}</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.componentsSubtotal)}</Text>
            </View>
          )}
          {hasC && (
            <View style={styles.sumRow}>
              <Text style={styles.sumItem}>Engineering Services</Text>
              <Text style={styles.sumQty}>{NUM(1)}</Text>
              <Text style={styles.sumUom}>LOT</Text>
              <Text style={styles.sumPrice}>{PHP(totals.servicesSubtotal)}</Text>
            </View>
          )}
          </View>
          <View style={[styles.sumFooterRow, styles.sumTotalRow]}>
            <Text style={styles.sumFooterLabel}>TOTAL PRICE, PhP (VAT-EX)</Text>
            <Text style={styles.sumFooterValue}>{PHP(totals.subtotal)}</Text>
          </View>
          {quotation.discountPct > 0 && (
            <>
              <View style={styles.sumFooterRow}>
                {/* Round % for clients — exact discount is the peso amount */}
                <Text style={styles.sumFooterLabel}>DISCOUNT ({formatDiscountPct(quotation.discountPct)}%)</Text>
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
                <Text style={styles.sumFooterLabel}>TOTAL PRICE, PhP (VAT-IN)</Text>
                <Text style={styles.sumFooterValue}>{PHP(totals.grandTotal)}</Text>
              </View>
            </>
          )}
        </View>

        {/* ─── OPTIONAL ITEMS (priced for reference, not in contract total) ─── */}
        {hasOptional && (
          <View style={styles.tableWrap} wrap={false}>
            <Text style={styles.sectionBarGray}>Optional Items</Text>
            <Text style={[styles.termText, { marginBottom: 4, fontStyle: 'italic' }]}>
              The items below are optional and are NOT included in the total contract price above. They may be availed separately at the prices indicated.
            </Text>
            <View style={styles.th}>
              <Text style={styles.cItem}>Item No.</Text>
              <Text style={styles.cDesc}>Description</Text>
              <Text style={styles.cQty}>QTY</Text>
              <Text style={styles.cUom}>UOM</Text>
              <Text style={styles.cUnit}>Unit Price</Text>
              <Text style={styles.cTotal}>Total , PhP</Text>
            </View>
            {optionalComponents.map((l) => (
              <View style={styles.tr} key={l.id}>
                <Text style={styles.cItem}>{codesOpt.get(l.id)}</Text>
                <ComponentDesc l={l} styles={styles} />
                <Text style={styles.cQty}>{NUM(l.qty)}</Text>
                <Text style={styles.cUom}>{(l.uom ?? '').toUpperCase()}</Text>
                <Text style={styles.cUnit}>{NUM(componentSellingUnit(l, quotation.productMarkupPct))}</Text>
                <Text style={styles.cTotal}>{NUM(componentLineTotal(l, quotation.productMarkupPct))}</Text>
              </View>
            ))}
            <View style={styles.trSub}>
              <Text style={{ fontWeight: 500 }}>optional total (vat-ex)</Text>
              <Text style={{ fontWeight: 700, marginLeft: 12, color: PRIMARY }}>{PHP(totals.componentsOptionalSubtotal ?? 0)}</Text>
            </View>
          </View>
        )}

        {/* ─── TERMS AND CONDITIONS ─── */}
        <View style={styles.terms} break={!!quotation.pageBreakBeforeTerms}>
          <View wrap={false}>
            <Text style={styles.termsTitle}>Terms and Conditions</Text>
            <Text style={styles.termSubtitle}>Scope of Work</Text>
            <Text style={styles.termText}>
              {to.scopeOfWork || DEFAULT_SCOPE_OF_WORK}
            </Text>
          </View>

          {to.exclusions && (
            <>
              <Text style={styles.termSubtitle}>Exclusions</Text>
              {to.exclusions.split('\n').filter(Boolean).map((line, i) => (
                <Text key={i} style={styles.termText}>{line}</Text>
              ))}
            </>
          )}

          <Text style={styles.termSubtitle}>Basis of Proposal</Text>
          <Text style={styles.termText}>
            {to.basisOfProposal || defaultBasisOfProposal(issuer.name)}
          </Text>

          <Text style={styles.termSubtitle}>Validity of Offer</Text>
          <Text style={styles.termText}>
            - This quotation is valid for {numToWords(quotation.validityDays)} ({quotation.validityDays}) calendar days from issuance.
          </Text>

          <Text style={styles.termSubtitle}>Delivery</Text>
          {(to.deliveryLines || defaultDeliveryText(quotation.deliveryTerms)).split('\n').filter(Boolean).map((line, i) => (
            <Text key={i} style={styles.termText}>{line}</Text>
          ))}

          <Text style={styles.termSubtitle}>Payment Terms</Text>
          <Text style={styles.termText}>- {quotation.paymentTerms}.</Text>

          <Text style={styles.termSubtitle}>Warranty</Text>
          <Text style={styles.termText}>
            - {numToWords(quotation.warrantyMonths).charAt(0).toUpperCase() + numToWords(quotation.warrantyMonths).slice(1)} ({quotation.warrantyMonths}) months
            from project completion and acceptance, covering defects in materials and workmanship under normal operating conditions.
          </Text>
          <Text style={styles.termText}>
            {to.warrantyExclusion || DEFAULT_WARRANTY_EXCLUSION}
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
  const filename = `${quotationRefNo(project.code, recipient?.code, quotation.revision)}.pdf`;
  if (options.save !== false) {
    saveAs(modifiedBlob, filename);
  }
  return { blob: modifiedBlob, filename };
}
