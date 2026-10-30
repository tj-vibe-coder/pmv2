import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { BillingStatement } from '../../types/BillingStatement';
import { computeSoaSummary, DEFAULT_SOA_REMITTANCE } from '../../types/BillingStatement';

// Running-account Statement of Account: the Finance tab's make-belmont-soa.py layout
// (invoice rows, billing %, PAID/DUE, summary, remittance/remarks, three signature
// blocks). Customer-facing — no internal notes, price sources or margins.
const BLUE = '#1f5aa6';
const INK = '#1f2933';
const MUTED = '#5b6672';
const LINE = '#d6dde6';
const SOFT = '#f3f6fa';
const GREEN = '#1a7f4b';
const RED = '#b42318';

const PHP = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso?: string) => (iso ? format(new Date(`${iso}T00:00:00`), 'MMMM d, yyyy') : '');

const styles = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 22, paddingHorizontal: 43, fontSize: 8.5, fontFamily: 'Helvetica', color: INK, lineHeight: 1.35 },
  hd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  logo: { height: 43, width: 43, marginRight: 8 },
  coName: { color: BLUE, fontSize: 11, fontWeight: 700 },
  tagline: { color: MUTED, fontSize: 7.5, marginTop: 1 },
  addr: { textAlign: 'right', color: MUTED, fontSize: 7.5, lineHeight: 1.5 },
  title: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, marginBottom: 8, paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: BLUE },
  h1: { fontSize: 17, letterSpacing: 2, color: BLUE, fontWeight: 700, lineHeight: 1.2 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', fontSize: 8.5, lineHeight: 1.6 },
  metaKey: { width: 52, color: MUTED, fontWeight: 600 },
  grid: { flexDirection: 'row', marginBottom: 8 },
  box: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: LINE, borderRadius: 3, backgroundColor: SOFT },
  boxHd: { fontSize: 7, letterSpacing: 1, color: '#fff', backgroundColor: BLUE, fontWeight: 700, padding: 4, paddingHorizontal: 8 },
  boxBody: { padding: 8, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' },
  nm: { fontSize: 9.5, fontWeight: 700 },
  kv: { flexDirection: 'row' },
  kvK: { width: 58, color: MUTED, fontWeight: 600 },
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6, marginBottom: 6 },
  badge: { backgroundColor: BLUE, color: '#fff', fontWeight: 700, fontSize: 7.5, padding: 3, paddingHorizontal: 6, borderRadius: 2, marginRight: 8 },
  sec: { fontSize: 7.5, letterSpacing: 1, color: BLUE, fontWeight: 700, marginTop: 5, marginBottom: 3 },
  th: { flexDirection: 'row', backgroundColor: BLUE },
  thText: { color: '#fff', fontSize: 7, letterSpacing: 0.4, padding: 4, paddingHorizontal: 5, fontWeight: 700 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  td: { padding: 5, paddingHorizontal: 5 },
  cDate: { width: 62 }, cSi: { width: 44 }, cDesc: { flex: 1 }, cAmt: { width: 78, textAlign: 'right' },
  cPct: { width: 40, textAlign: 'center' }, cBilled: { width: 78, textAlign: 'right' }, cStatus: { width: 44, textAlign: 'center' },
  descSub: { color: MUTED, fontSize: 7.5, marginTop: 1 },
  nothing: { textAlign: 'center', color: MUTED, fontSize: 7, padding: 4, letterSpacing: 1 },
  sumWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  sum: { width: 270, borderWidth: 1, borderColor: LINE, borderRadius: 3 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  sumTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, paddingHorizontal: 8, backgroundColor: BLUE },
  sumTotalText: { color: '#fff', fontSize: 10, fontWeight: 700 },
  sumNote: { padding: 6, paddingHorizontal: 8, fontSize: 7.5, color: MUTED, lineHeight: 1.45 },
  notes: { flexDirection: 'row', marginTop: 8 },
  noteBox: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: LINE, borderRadius: 3 },
  sigRow: { flexDirection: 'row', paddingTop: 10 },
  sig: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  lbl: { fontSize: 7, letterSpacing: 1, color: BLUE, fontWeight: 700, marginBottom: 3 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#8c97a3', height: 22 },
  sigWho: { fontWeight: 700, fontSize: 8.5, marginTop: 3 },
  sigRole: { color: MUTED, fontSize: 7 },
  foot: { marginTop: 8, paddingTop: 5, borderTopWidth: 1, borderTopColor: LINE, color: MUTED, fontSize: 6.5, flexDirection: 'row', justifyContent: 'space-between' },
});

export function RunningSoaDocument({ soa }: { soa: BillingStatement }) {
  const txns = soa.txns ?? [];
  const s = computeSoaSummary(txns, soa.contractValue);
  const lastDue = [...txns].reverse().find((t) => t.status !== 'PAID');
  const address = (soa.billedToAddress ?? '').split('\n').filter(Boolean);
  const remittance = (soa.remittance ?? DEFAULT_SOA_REMITTANCE).split('\n');

  return (
    <Document title={`${soa.docNo} - Statement of Account`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.hd}>
          <View style={styles.brand}>
            <Image src="/logo-ioct-only.png" style={styles.logo} />
            <View>
              <Text style={styles.coName}>IO CONTROL TECHNOLOGIE OPC</Text>
              <Text style={styles.tagline}>Empowering industries with intelligent control solutions.</Text>
            </View>
          </View>
          <View style={styles.addr}>
            <Text>B63 L7 Dynamism Jubilation Enclave,</Text>
            <Text>Santo Niño, Biñan, Laguna 4024</Text>
            <Text>projects@iocontroltech.com</Text>
            <Text>TIN: 697-029-976-00000 | Non-VAT Registered</Text>
          </View>
        </View>

        <View style={styles.title}>
          <Text style={styles.h1}>STATEMENT OF ACCOUNT</Text>
          <View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>SOA No.</Text><Text>{soa.docNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Date</Text><Text>{longDate(soa.date)}</Text></View>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={[styles.box, { marginRight: 10 }]}>
            <Text style={styles.boxHd}>BILL TO</Text>
            <View style={styles.boxBody}>
              <Text style={styles.nm}>{soa.billedToName}</Text>
              {address.map((l, i) => <Text key={i}>{l}</Text>)}
              {soa.billedToTin ? <View style={styles.kv}><Text style={styles.kvK}>TIN:</Text><Text>{soa.billedToTin}</Text></View> : null}
              {soa.attention ? <View style={styles.kv}><Text style={styles.kvK}>Attention:</Text><Text style={{ fontWeight: 700 }}>{soa.attention}</Text></View> : null}
              {soa.billedToEmail ? <View style={styles.kv}><Text style={styles.kvK}>Email:</Text><Text>{soa.billedToEmail}</Text></View> : null}
            </View>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxHd}>PROJECT & CONTRACT REFERENCE</Text>
            <View style={styles.boxBody}>
              {(soa.refRows ?? []).filter((r) => r.label || r.value).map((r, i) => (
                <View key={i} style={styles.kv}><Text style={styles.kvK}>{r.label}:</Text><Text style={{ flex: 1 }}>{r.value}</Text></View>
              ))}
            </View>
          </View>
        </View>

        {(soa.billingLabel || soa.subtitle) ? (
          <View style={styles.banner}>
            {soa.billingLabel ? <Text style={styles.badge}>{soa.billingLabel}</Text> : null}
            <Text style={{ flex: 1 }}>{soa.subtitle}</Text>
          </View>
        ) : null}

        <Text style={styles.sec}>TRANSACTION DETAILS</Text>
        <View style={styles.th}>
          <Text style={[styles.thText, styles.cDate]}>INVOICE DATE</Text>
          <Text style={[styles.thText, styles.cSi]}>SI NO.</Text>
          <Text style={[styles.thText, styles.cDesc]}>DESCRIPTION OF WORKS / DELIVERABLES</Text>
          <Text style={[styles.thText, styles.cAmt]}>CONTRACT (PHP)</Text>
          <Text style={[styles.thText, styles.cPct]}>BILL %</Text>
          <Text style={[styles.thText, styles.cBilled]}>BILLED (PHP)</Text>
          <Text style={[styles.thText, styles.cStatus]}>STATUS</Text>
        </View>
        {txns.map((t, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.cDate]}>{longDate(t.invoiceDate)}</Text>
            <Text style={[styles.td, styles.cSi]}>{t.siNo}</Text>
            <View style={[styles.td, styles.cDesc]}>
              <Text style={{ fontWeight: 700 }}>{t.description}</Text>
              {(t.details ?? '').split('\n').filter(Boolean).map((l, k) => <Text key={k} style={styles.descSub}>{l}</Text>)}
            </View>
            <Text style={[styles.td, styles.cAmt]}>{PHP(t.contractAmount)}</Text>
            <Text style={[styles.td, styles.cPct]}>{t.billingPct}%</Text>
            <Text style={[styles.td, styles.cBilled, { fontWeight: 700 }]}>{PHP(t.amountBilled)}</Text>
            <Text style={[styles.td, styles.cStatus, { fontWeight: 700, color: t.status === 'PAID' ? GREEN : RED }]}>{t.status}</Text>
          </View>
        ))}
        <Text style={styles.nothing}>***** NOTHING FOLLOWS *****</Text>

        <View style={styles.sumWrap} wrap={false}>
          <View style={styles.sum}>
            <View style={styles.sumRow}><Text>Total Contract Value{soa.poNo ? ` (PO No. ${soa.poNo})` : ''}</Text><Text>PHP {PHP(s.contractValue)}</Text></View>
            <View style={styles.sumRow}><Text>Previous Billings</Text><Text>PHP {PHP(s.previousBillings)}</Text></View>
            <View style={styles.sumRow}>
              <Text>This Billing{lastDue?.siNo ? ` — ${lastDue.siNo}` : ''}</Text><Text>PHP {PHP(s.thisBilling)}</Text>
            </View>
            <View style={styles.sumTotal}><Text style={styles.sumTotalText}>TOTAL AMOUNT DUE</Text><Text style={styles.sumTotalText}>PHP {PHP(s.totalDue)}</Text></View>
            <View style={styles.sumNote}>
              {soa.paymentNote ? soa.paymentNote.split('\n').map((l, i) => <Text key={i}>{l}</Text>) : null}
              <Text>Balance after settlement of this SOA: PHP {PHP(s.balanceAfter)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.notes} wrap={false}>
          <View style={[styles.noteBox, { marginRight: 10 }]}>
            <Text style={styles.boxHd}>REMITTANCE INSTRUCTIONS</Text>
            <View style={styles.boxBody}>{remittance.map((l, i) => <Text key={i}>{l || ' '}</Text>)}</View>
          </View>
          <View style={styles.noteBox}>
            <Text style={styles.boxHd}>REMARKS</Text>
            <View style={styles.boxBody}>
              {(soa.remarks ?? '').split('\n').map((l, i) => <Text key={i}>{l || ' '}</Text>)}
            </View>
          </View>
        </View>

        <View wrap={false}>
          <View style={styles.sigRow}>
            <View style={[styles.sig, { marginRight: 8 }]}>
              <Text style={styles.lbl}>PREPARED BY</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigWho}>{soa.preparedByName || 'Reuel Joshua Rivera'}</Text>
              <Text style={styles.sigRole}>{soa.preparedByTitle || 'Billing / Accounts Receivable'}</Text>
              <Text style={styles.sigRole}>IO Control Technologie OPC</Text>
            </View>
            <View style={[styles.sig, { marginRight: 8 }]}>
              <Text style={styles.lbl}>NOTED / APPROVED BY</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigWho}> </Text>
              <Text style={styles.sigRole}>Authorized Signatory</Text>
              <Text style={styles.sigRole}>IO Control Technologie OPC</Text>
            </View>
            <View style={styles.sig}>
              <Text style={styles.lbl}>RECEIVED & ACKNOWLEDGED BY</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigWho}> </Text>
              <Text style={styles.sigRole}>Signature over Printed Name</Text>
              <Text style={styles.sigRole}>Date: _______________________</Text>
            </View>
          </View>
          <View style={styles.foot}>
            <Text>IO CONTROL TECHNOLOGIE OPC | TIN: 697-029-976-00000 | Non-VAT Registered</Text>
            <Text>{soa.docNo} | Computer-generated document.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateRunningSoaPdfBlob(soa: BillingStatement): Promise<Blob> {
  return pdf(<RunningSoaDocument soa={soa} />).toBlob();
}

export async function downloadRunningSoaPdf(soa: BillingStatement): Promise<void> {
  saveAs(await generateRunningSoaPdfBlob(soa), `${soa.docNo}.pdf`);
}
