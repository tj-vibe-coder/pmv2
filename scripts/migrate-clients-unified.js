/**
 * One-shot migration: consolidate `clients` + `calcsheet_clients` into a single
 * `clients` collection with the new unified schema (camelCase + contacts[]).
 *
 * Usage:
 *   node scripts/migrate-clients-unified.js              # dry-run, prints plan
 *   node scripts/migrate-clients-unified.js --apply      # writes changes
 *
 * Behavior:
 *   - 4 docs in `clients` (client_1..4) get rewritten to new schema and gain a contacts[].
 *   - For overlapping codes (ADI/EBC/LBI/TPI), the matching calcsheet doc's contact merges
 *     into the same client_N doc as an additional ClientContact entry. For ADI specifically,
 *     the calcsheet-side primary contact takes the `isPrimary` slot and the main-side contact
 *     becomes secondary (per user decision).
 *   - For the other 9 calcsheet docs (ICI/REP/BLI/BBP/ACT/NEX/CEI/IST/SLC), each becomes a new
 *     `clients` doc keeping its existing Firestore id (so any in-flight quotation.recipientId
 *     references stay valid).
 *   - Any calcsheet_quotation whose recipientId points to a merged calcsheet doc is rewritten
 *     to point at the destination client_N id.
 *   - Calcsheet docs that we MERGED INTO a main client get deleted from calcsheet_clients.
 *   - The 9 calcsheet docs that get copied to `clients` (same id) get deleted from
 *     calcsheet_clients afterwards (so only one collection holds clients).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  const keyFile = path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  credential = admin.credential.cert(require(keyFile));
}
admin.initializeApp({ credential });
const db = admin.firestore();

const apply = process.argv.includes('--apply');

// Normalize names for matching: lowercase, strip Inc./Corp./punct/whitespace
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|corporation|ltd\.?|limited|opc|\.|,)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const cid = () => randomUUID().slice(0, 8);

(async () => {
  // Fetch both collections
  const [mainSnap, csSnap, qSnap] = await Promise.all([
    db.collection('clients').get(),
    db.collection('calcsheet_clients').get(),
    db.collection('calcsheet_quotations').get(),
  ]);

  const main = mainSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cs = csSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const quotations = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Loaded: ${main.length} main clients, ${cs.length} calcsheet_clients, ${quotations.length} calcsheet_quotations`);

  // Build matching: each main client matched by normalized name against a calcsheet doc
  const matches = []; // { main, cs }
  const unmatchedCs = new Set(cs.map((c) => c.id));
  for (const m of main) {
    const target = cs.find((c) => norm(c.name) === norm(m.client_name));
    if (target) {
      matches.push({ main: m, cs: target });
      unmatchedCs.delete(target.id);
    } else {
      matches.push({ main: m, cs: null });
    }
  }
  const unmatchedCsList = cs.filter((c) => unmatchedCs.has(c.id));

  // Build rewriteId map: old calcsheet id → new main id (for quotations remap)
  const rewriteId = new Map();
  for (const m of matches) if (m.cs) rewriteId.set(m.cs.id, m.main.id);

  // Compose rewritten main client docs (camelCase + contacts[])
  function contactFromMain(m) {
    const name = (m.contact_person || '').trim();
    if (!name) return null;
    return {
      id: cid(),
      name,
      position: (m.designation || '').trim(),
      email: (m.email_address || '').trim(),
      phone: '',
      gender: '',
      isPrimary: false,
    };
  }
  function contactFromCs(c) {
    const name = (c.contact || '').trim();
    if (!name) return null;
    return {
      id: cid(),
      name,
      position: (c.position || '').trim(),
      email: (c.email || '').trim(),
      phone: (c.phone || '').trim(),
      gender: c.gender || '',
      isPrimary: true,  // calcsheet contact is preferred per user decision
    };
  }

  const mainRewrites = []; // { id, doc }
  for (const m of matches) {
    const csDoc = m.cs;
    const contacts = [];
    const csC = csDoc ? contactFromCs(csDoc) : null;
    const mC = contactFromMain(m.main);
    if (csC) contacts.push(csC);  // primary
    if (mC && mC.name && (!csC || norm(mC.name) !== norm(csC.name))) {
      mC.isPrimary = false;
      contacts.push(mC);
    }
    // Ensure at least one is primary
    if (contacts.length > 0 && !contacts.some((c) => c.isPrimary)) contacts[0].isPrimary = true;

    const newDoc = {
      code: csDoc ? (csDoc.code || '') : '',
      name: (csDoc?.name || m.main.client_name || '').trim(),
      address: (csDoc?.address || m.main.address || '').trim(),
      paymentTerms: (csDoc?.paymentTerms || m.main.payment_terms || '').trim(),
      am: csDoc?.am || '',
      contacts,
      createdAt: m.main.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mainRewrites.push({ id: m.main.id, doc: newDoc, mergedCsId: csDoc?.id });
  }

  // Compose new clients docs to be copied over (preserving id)
  const newClients = []; // { id, doc }
  for (const c of unmatchedCsList) {
    const csC = contactFromCs(c);
    const contacts = csC ? [{ ...csC, isPrimary: true }] : [];
    newClients.push({
      id: c.id,
      doc: {
        code: c.code || '',
        name: c.name || '',
        address: c.address || '',
        paymentTerms: c.paymentTerms || '',
        am: c.am || '',
        contacts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // Find quotations needing recipientId rewrite
  const qRewrites = quotations
    .filter((q) => q.recipientId && rewriteId.has(q.recipientId))
    .map((q) => ({ id: q.id, oldRecipientId: q.recipientId, newRecipientId: rewriteId.get(q.recipientId) }));

  // Print plan
  console.log('\n=== PLAN ===');
  console.log('\nRewrites in `clients` collection (4 main docs migrate to new schema):');
  for (const r of mainRewrites) {
    const merge = r.mergedCsId ? ` (merge from calcsheet ${r.mergedCsId})` : '';
    console.log(`  ${r.id}  ${r.doc.code || '—'}  ${r.doc.name}  [contacts=${r.doc.contacts.length}]${merge}`);
    r.doc.contacts.forEach((c) => console.log(`     • ${c.isPrimary ? '★ ' : '  '}${c.name} — ${c.position || '—'} — ${c.email || '—'}`));
  }

  console.log(`\nCopies into \`clients\` (${newClients.length} new client docs from calcsheet):`);
  for (const n of newClients) {
    console.log(`  ${n.id}  ${n.doc.code}  ${n.doc.name}`);
  }

  console.log(`\nDeletes from \`calcsheet_clients\` after migration: all ${cs.length} docs`);

  if (qRewrites.length) {
    console.log(`\nQuotation recipientId rewrites (${qRewrites.length}):`);
    for (const q of qRewrites) {
      console.log(`  ${q.id}:  ${q.oldRecipientId} → ${q.newRecipientId}`);
    }
  } else {
    console.log('\nNo quotation recipientId rewrites needed.');
  }

  if (!apply) {
    console.log('\n(dry-run — rerun with --apply to write)');
    process.exit(0);
  }

  console.log('\n=== APPLYING ===');
  const batch = db.batch();
  for (const r of mainRewrites) batch.set(db.collection('clients').doc(r.id), r.doc);
  for (const n of newClients) batch.set(db.collection('clients').doc(n.id), n.doc);
  for (const q of qRewrites) batch.update(db.collection('calcsheet_quotations').doc(q.id), { recipientId: q.newRecipientId });
  for (const c of cs) batch.delete(db.collection('calcsheet_clients').doc(c.id));
  await batch.commit();
  console.log('Applied.');
  process.exit(0);
})().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
