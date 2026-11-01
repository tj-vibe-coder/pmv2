import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { BillingStatement } from '../../types/BillingStatement';
import { computeBlsTotals, DEFAULT_BLS_SUBTITLE, DEFAULT_BLS_TERMS, pesoInWords } from '../../types/BillingStatement';

// One A4 page, same layout as the Finance tab's make-prebilling-pdf.py. Everything
// printed here is customer-facing: no internal notes, price sources or margins.
const BLUE = '#1f5aa6';
const SKY = '#5fa8d3';
const INK = '#1f2933';
const MUTED = '#5b6672';
const LINE = '#d6dde6';
const SOFT = '#f3f6fa';

const PHP = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 22, paddingHorizontal: 43, fontSize: 8.5, fontFamily: 'Helvetica', color: INK, lineHeight: 1.35 },
  hd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { height: 43, width: 43 },
  co: { textAlign: 'right', color: MUTED, fontSize: 7.5, lineHeight: 1.5 },
  coName: { color: BLUE, fontSize: 10, fontWeight: 700 },
  title: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, marginBottom: 8, paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: BLUE },
  h1: { fontSize: 17, letterSpacing: 2, color: BLUE, fontWeight: 700, lineHeight: 1.2 },
  sub: { color: MUTED, fontSize: 8, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', fontSize: 8.5, lineHeight: 1.6 },
  metaKey: { width: 52, color: MUTED, fontWeight: 600 },
  cards: { flexDirection: 'row', marginBottom: 8 },
  card: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8, backgroundColor: SOFT },
  lbl: { fontSize: 7, letterSpacing: 1, color: BLUE, fontWeight: 700, marginBottom: 3 },
  nm: { fontSize: 9.5, fontWeight: 700 },
  sec: { fontSize: 7.5, letterSpacing: 1, color: BLUE, fontWeight: 700, marginTop: 7, marginBottom: 3 },
  refRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  refK: { width: '27%', padding: 3, paddingHorizontal: 6, color: MUTED, fontWeight: 600, backgroundColor: SOFT },
  refV: { flex: 1, padding: 3, paddingHorizontal: 6 },
  th: { flexDirection: 'row', backgroundColor: BLUE },
  thText: { color: '#fff', fontSize: 7.5, letterSpacing: 0.5, padding: 5, paddingHorizontal: 6, fontWeight: 700 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  td: { padding: 5, paddingHorizontal: 6 },
  cNo: { width: 24, textAlign: 'center' },
  cDesc: { flex: 1 },
  cQty: { width: 40, textAlign: 'center' },
  cUnit: { width: 40, textAlign: 'center' },
  cPrice: { width: 84, textAlign: 'right' },
  cAmt: { width: 92, textAlign: 'right' },
  sumWrap: { flexDirection: 'row', marginTop: 8 },
  words: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8, marginRight: 12 },
  wordsText: { fontWeight: 700, marginTop: 2, lineHeight: 1.25 },
  sum: { width: 220 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  sumDue: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, paddingHorizontal: 6, backgroundColor: BLUE },
  sumDueText: { color: '#fff', fontSize: 10, fontWeight: 700 },
  docRow: { flexDirection: 'row', paddingVertical: 2 },
  bullet: { width: 5, height: 5, backgroundColor: SKY, marginRight: 8, marginTop: 3 },
  sigWrap: { flexDirection: 'row', paddingTop: 10 },
  sigBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#8c97a3', height: 24 },
  sigCap: { fontSize: 7, color: MUTED, marginTop: 2, marginBottom: 5 },
  sigWho: { fontWeight: 700, fontSize: 9 },
  sigRole: { color: MUTED, fontSize: 7.5 },
  foot: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: LINE, color: MUTED, fontSize: 7, flexDirection: 'row', justifyContent: 'space-between' },
});

const DEFAULT_BILLED_TO = {
  name: 'Advance Controle Technologie Inc.',
  address: 'Block 13 Lot 8, Mindanao Ave., Gavino Maderan,\nGen. Mariano Alvarez, Cavite 4117',
};

export function BillingStatementDocument({ bls }: { bls: BillingStatement }) {
  const lines = bls.lines ?? [];
  const wht = bls.whtPct ?? 0;
  const { gross, wht: whtAmt, net } = computeBlsTotals(lines, wht);
  const billedTo = bls.billedToName || DEFAULT_BILLED_TO.name;
  const address = bls.billedToName ? bls.billedToAddress ?? '' : bls.billedToAddress || DEFAULT_BILLED_TO.address;
  const dateText = bls.date ? format(new Date(`${bls.date}T00:00:00`), 'MMMM d, yyyy') : '';
  const refRows = (bls.refRows ?? []).filter((r) => r.label.trim() || r.value.trim());
  const docs = (bls.supportingDocs ?? []).filter(Boolean);

  return (
    <Document title={`${bls.docNo} - Billing Statement`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.hd}>
          <Image src="/logo-ioct-only.png" style={styles.logo} />
          <View style={styles.co}>
            <Text style={styles.coName}>IO CONTROL TECHNOLOGIE OPC</Text>
            <Text>NON-VAT Reg. TIN: 697-029-976-00000</Text>
            <Text>Blk. 63 Lot 7 Dynamism St., Jubilation Enclave</Text>
            <Text>Santo Niño, 4024 City of Biñan, Laguna</Text>
          </View>
        </View>

        <View style={styles.title}>
          <View>
            <Text style={styles.h1}>BILLING STATEMENT</Text>
            <Text style={styles.sub}>{bls.subtitle || DEFAULT_BLS_SUBTITLE}</Text>
          </View>
          <View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Date</Text><Text>{dateText}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Doc. No.</Text><Text>{bls.docNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Billing</Text><Text>{bls.billingLabel || 'Final (100%)'}</Text></View>
          </View>
        </View>

        <View style={styles.cards}>
          <View style={[styles.card, { marginRight: 12 }]}>
            <Text style={styles.lbl}>BILLED TO</Text>
            <Text style={styles.nm}>{billedTo}</Text>
            {address.split('\n').filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
          </View>
          <View style={styles.card}>
            <Text style={styles.lbl}>ATTENTION</Text>
            <Text style={styles.nm}>{bls.attention || ' '}</Text>
            <Text>{billedTo}</Text>
          </View>
        </View>

        {refRows.length > 0 && (
          <View>
            <Text style={styles.sec}>PROJECT REFERENCE</Text>
            {refRows.map((r, i) => (
              <View key={i} style={styles.refRow} wrap={false}>
                <Text style={styles.refK}>{r.label}</Text>
                <Text style={styles.refV}>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sec}>BILLING DETAILS</Text>
        <View style={styles.th}>
          <Text style={[styles.thText, styles.cNo]}>#</Text>
          <Text style={[styles.thText, styles.cDesc]}>DESCRIPTION</Text>
          <Text style={[styles.thText, styles.cQty]}>QTY</Text>
          <Text style={[styles.thText, styles.cUnit]}>UNIT</Text>
          <Text style={[styles.thText, styles.cPrice]}>UNIT PRICE (PHP)</Text>
          <Text style={[styles.thText, styles.cAmt]}>AMOUNT (PHP)</Text>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.cNo]}>{i + 1}</Text>
            <Text style={[styles.td, styles.cDesc]}>{l.description}</Text>
            <Text style={[styles.td, styles.cQty]}>{l.qty}</Text>
            <Text style={[styles.td, styles.cUnit]}>{l.unit}</Text>
            <Text style={[styles.td, styles.cPrice]}>{PHP(l.unitPrice)}</Text>
            <Text style={[styles.td, styles.cAmt]}>{PHP(Math.round(l.qty * l.unitPrice * 100) / 100)}</Text>
          </View>
        ))}

        <View style={styles.sumWrap} wrap={false}>
          <View style={styles.words}>
            <Text style={styles.lbl}>AMOUNT DUE IN WORDS</Text>
            <Text style={styles.wordsText}>{pesoInWords(net)}</Text>
          </View>
          <View style={styles.sum}>
            <View style={styles.sumRow}><Text>Total sales (Non-VAT)</Text><Text>{PHP(gross)}</Text></View>
            {wht > 0 && (
              <View style={styles.sumRow}><Text>Less: withholding tax ({wht}%)</Text><Text>({PHP(whtAmt)})</Text></View>
            )}
            <View style={styles.sumDue}><Text style={styles.sumDueText}>TOTAL AMOUNT DUE</Text><Text style={styles.sumDueText}>PHP {PHP(net)}</Text></View>
          </View>
        </View>

        {docs.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sec}>SUPPORTING DOCUMENTS ATTACHED</Text>
            {docs.map((d, i) => (
              <View key={i} style={styles.docRow}><View style={styles.bullet} /><Text>{d}</Text></View>
            ))}
          </View>
        )}

        <Text style={styles.sec}>TERMS</Text>
        <Text>{bls.terms || DEFAULT_BLS_TERMS}</Text>

        <View wrap={false}>
        <View style={styles.sigWrap}>
          <View style={[styles.sigBox, { marginRight: 28 }]}>
            <Text style={styles.lbl}>PREPARED BY</Text>
            <View style={styles.sigLine} />
            <Text style={styles.sigCap}>Signature</Text>
            <Text style={styles.sigWho}>{bls.preparedByName || 'Reuel Rivera'}</Text>
            <Text style={styles.sigRole}>{bls.preparedByTitle || 'Managing Partner - Operations'}</Text>
            <Text style={styles.sigRole}>IO Control Technologie OPC</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.lbl}>{(bls.approverLabel || 'Verified / approved by').toUpperCase()}</Text>
            <View style={styles.sigLine} />
            <Text style={styles.sigCap}>Signature over printed name</Text>
            <Text style={styles.sigWho}> </Text>
            <Text style={styles.sigRole}>Position / Date: ______________________</Text>
          </View>
        </View>

        <View style={styles.foot}>
          <Text>The Service Invoice for this billing is attached. Amounts are in Philippine pesos. IO Control Technologie OPC is non-VAT registered.</Text>
          <Text>{bls.docNo}</Text>
        </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateBlsPdfBlob(bls: BillingStatement): Promise<Blob> {
  return pdf(<BillingStatementDocument bls={bls} />).toBlob();
}

export async function downloadBlsPdf(bls: BillingStatement): Promise<void> {
  saveAs(await generateBlsPdfBlob(bls), `${bls.docNo}.pdf`);
}
