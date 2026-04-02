/**
 * migrate-sqlite-to-firestore.js
 *
 * SAFE migration: SQLiteCloud → Firestore
 * - SQLiteCloud data is READ ONLY. Nothing is deleted or modified.
 * - A full JSON backup is saved to database/backup_<timestamp>.json before any Firestore writes.
 * - Existing Firestore documents are skipped (no overwrites) unless --overwrite flag is passed.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-firestore.js
 *   node scripts/migrate-sqlite-to-firestore.js --overwrite   (re-import even if doc exists)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ── SQLiteCloud ──────────────────────────────────────────────────────────────
const { Database } = require('@sqlitecloud/drivers');

// ── Firebase Admin ───────────────────────────────────────────────────────────
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const firestore = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const OVERWRITE = process.argv.includes('--overwrite');
const BATCH_SIZE = 500;

// ── Helpers ──────────────────────────────────────────────────────────────────
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function batchWrite(collection, docs) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

function log(msg) { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.warn(`[migrate] ⚠️  ${msg}`); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('Connecting to SQLiteCloud (read-only)...');
  const sqliteDb = await new Promise((resolve, reject) => {
    const db = new Database(process.env.DATABASE_URL, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
  log('Connected to SQLiteCloud ✓');

  // ── Step 1: Read all tables from SQLiteCloud ─────────────────────────────
  log('Reading all tables...');
  const [users, clients, projects, attachments, suppliers, supplierProducts, cashAdvances, liquidations] = await Promise.all([
    query(sqliteDb, 'SELECT * FROM users'),
    query(sqliteDb, 'SELECT * FROM clients'),
    query(sqliteDb, 'SELECT * FROM projects'),
    query(sqliteDb, 'SELECT * FROM project_attachments'),
    query(sqliteDb, 'SELECT * FROM suppliers'),
    query(sqliteDb, 'SELECT * FROM supplier_products'),
    query(sqliteDb, 'SELECT * FROM cash_advances'),
    query(sqliteDb, 'SELECT * FROM liquidations'),
  ]);

  log(`Read: ${users.length} users, ${clients.length} clients, ${projects.length} projects, ${attachments.length} attachments, ${suppliers.length} suppliers, ${supplierProducts.length} supplier_products, ${cashAdvances.length} cash_advances, ${liquidations.length} liquidations`);

  // ── Step 2: Save JSON backup ─────────────────────────────────────────────
  const backupDir = path.join(__dirname, '..', 'database');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
  const backupData = { exported_at: new Date().toISOString(), source: 'SQLiteCloud', tables: { users, clients, projects, project_attachments: attachments, suppliers, supplier_products: supplierProducts, cash_advances: cashAdvances, liquidations } };
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  log(`Backup saved → ${backupPath} ✓`);

  // ── Step 3: ID maps (SQLite integer IDs → Firestore doc IDs) ────────────
  // We use deterministic Firestore doc IDs based on the SQLite integer ID
  // so we can resolve FK references without a second pass.
  const userIdMap    = {};  // sqlite_id → firestore_doc_id
  const clientIdMap  = {};
  const projectIdMap = {};
  const caIdMap      = {};
  const liqIdMap     = {};

  // ── Step 4: Migrate users ────────────────────────────────────────────────
  log('Migrating users...');
  let userCount = 0;
  for (const u of users) {
    const firestoreId = `user_${u.id}`;
    userIdMap[u.id] = firestoreId;
    const ref = firestore.collection('users').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping user id=${u.id} (already exists)`); continue; }
    }
    await ref.set({
      username:      u.username     || null,
      email:         u.email        || null,
      password_hash: u.password_hash|| null,
      role:          u.role         || 'user',
      approved:      u.approved     ?? 0,
      full_name:     u.full_name    || null,
      designation:   u.designation  || null,
      created_at:    u.created_at   ?? null,
      updated_at:    u.updated_at   ?? null,
    });
    userCount++;
  }
  log(`Users migrated: ${userCount}/${users.length}`);

  // ── Step 5: Migrate clients ──────────────────────────────────────────────
  log('Migrating clients...');
  let clientCount = 0;
  for (const c of clients) {
    const firestoreId = `client_${c.id}`;
    clientIdMap[c.id] = firestoreId;
    const ref = firestore.collection('clients').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping client id=${c.id} (already exists)`); continue; }
    }
    await ref.set({
      client_name:    c.client_name    || null,
      address:        c.address        || null,
      payment_terms:  c.payment_terms  || null,
      contact_person: c.contact_person || null,
      designation:    c.designation    || null,
      email_address:  c.email_address  || null,
      created_at:     c.created_at     || null,
      updated_at:     c.updated_at     || null,
    });
    clientCount++;
  }
  log(`Clients migrated: ${clientCount}/${clients.length}`);

  // ── Step 6: Migrate projects ─────────────────────────────────────────────
  log('Migrating projects...');
  let projectCount = 0;
  const projectDocs = [];
  for (const p of projects) {
    const firestoreId = `project_${p.id}`;
    projectIdMap[p.id] = firestoreId;
    const ref = firestore.collection('projects').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping project id=${p.id} (already exists)`); projectCount++; continue; }
    }
    const mappedClientId = p.client_id ? (clientIdMap[p.client_id] || `client_${p.client_id}`) : null;
    projectDocs.push({ ref, data: {
      project_no:                        p.project_no                        ?? null,
      item_no:                           p.item_no                           ?? null,
      year:                              p.year                              ?? null,
      am:                                p.am                                ?? null,
      ovp_number:                        p.ovp_number                        ?? null,
      po_number:                         p.po_number                         ?? null,
      po_date:                           p.po_date                           ?? null,
      client_status:                     p.client_status                     ?? null,
      account_name:                      p.account_name                      ?? null,
      project_name:                      p.project_name                      ?? null,
      project_category:                  p.project_category                  ?? null,
      project_location:                  p.project_location                  ?? null,
      scope_of_work:                     p.scope_of_work                     ?? null,
      qtn_no:                            p.qtn_no                            ?? null,
      ovp_category:                      p.ovp_category                      ?? null,
      contract_amount:                   p.contract_amount                   ?? 0,
      updated_contract_amount:           p.updated_contract_amount           ?? 0,
      down_payment_percent:              p.down_payment_percent              ?? 0,
      retention_percent:                 p.retention_percent                 ?? 0,
      start_date:                        p.start_date                        ?? null,
      duration_days:                     p.duration_days                     ?? 0,
      completion_date:                   p.completion_date                   ?? null,
      payment_schedule:                  p.payment_schedule                  ?? null,
      payment_terms:                     p.payment_terms                     ?? null,
      bonds_requirement:                 p.bonds_requirement                 ?? null,
      project_director:                  p.project_director                  ?? null,
      client_approver:                   p.client_approver                   ?? null,
      progress_billing_schedule:         p.progress_billing_schedule         ?? null,
      mobilization_date:                 p.mobilization_date                 ?? null,
      updated_completion_date:           p.updated_completion_date           ?? null,
      project_status:                    p.project_status                    ?? 'OPEN',
      actual_site_progress_percent:      p.actual_site_progress_percent      ?? 0,
      actual_progress:                   p.actual_progress                   ?? 0,
      evaluated_progress_percent:        p.evaluated_progress_percent        ?? 0,
      evaluated_progress:                p.evaluated_progress                ?? 0,
      for_rfb_percent:                   p.for_rfb_percent                   ?? 0,
      for_rfb_amount:                    p.for_rfb_amount                    ?? 0,
      rfb_date:                          p.rfb_date                          ?? null,
      type_of_rfb:                       p.type_of_rfb                       ?? null,
      work_in_progress_ap:               p.work_in_progress_ap               ?? 0,
      work_in_progress_ep:               p.work_in_progress_ep               ?? 0,
      updated_contract_balance_percent:  p.updated_contract_balance_percent  ?? 0,
      total_contract_balance:            p.total_contract_balance            ?? 0,
      updated_contract_balance_net_percent: p.updated_contract_balance_net_percent ?? 0,
      updated_contract_balance_net:      p.updated_contract_balance_net      ?? 0,
      remarks:                           p.remarks                           ?? null,
      contract_billed_gross_percent:     p.contract_billed_gross_percent     ?? 0,
      contract_billed:                   p.contract_billed                   ?? 0,
      contract_billed_net_percent:       p.contract_billed_net_percent       ?? 0,
      amount_contract_billed_net:        p.amount_contract_billed_net        ?? 0,
      for_retention_billing_percent:     p.for_retention_billing_percent     ?? 0,
      amount_for_retention_billing:      p.amount_for_retention_billing      ?? 0,
      retention_status:                  p.retention_status                  ?? null,
      unevaluated_progress:              p.unevaluated_progress              ?? 0,
      client_id:                         mappedClientId,
      created_at:                        p.created_at                        ?? null,
      updated_at:                        p.updated_at                        ?? null,
    }});
    projectCount++;
  }
  await batchWrite('projects', projectDocs);
  log(`Projects migrated: ${projectCount}/${projects.length}`);

  // ── Step 7: Migrate project attachments ─────────────────────────────────
  log('Migrating project attachments...');
  const attachmentDocs = [];
  let attachmentCount = 0;
  for (const a of attachments) {
    const firestoreId = `attachment_${a.id}`;
    const ref = firestore.collection('project_attachments').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping attachment id=${a.id} (already exists)`); attachmentCount++; continue; }
    }
    const mappedProjectId = a.project_id ? (projectIdMap[a.project_id] || `project_${a.project_id}`) : null;
    attachmentDocs.push({ ref, data: { project_id: mappedProjectId, filename: a.filename || null, onedrive_item_id: a.onedrive_item_id || null, onedrive_web_url: a.onedrive_web_url || null, file_size: a.file_size || null, uploaded_by: a.uploaded_by || null, created_at: a.created_at || null } });
    attachmentCount++;
  }
  await batchWrite('project_attachments', attachmentDocs);
  log(`Attachments migrated: ${attachmentCount}/${attachments.length}`);

  // ── Step 8: Migrate suppliers ────────────────────────────────────────────
  log('Migrating suppliers...');
  const supplierDocs = [];
  for (const s of suppliers) {
    const ref = firestore.collection('suppliers').doc(s.id);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping supplier id=${s.id} (already exists)`); continue; }
    }
    supplierDocs.push({ ref, data: { name: s.name || null, contact_name: s.contact_name || null, email: s.email || null, phone: s.phone || null, address: s.address || null, payment_terms: s.payment_terms || null, created_at: s.created_at || null } });
  }
  await batchWrite('suppliers', supplierDocs);
  log(`Suppliers migrated: ${supplierDocs.length}/${suppliers.length}`);

  // ── Step 9: Migrate supplier products ───────────────────────────────────
  log('Migrating supplier products...');
  const productDocs = [];
  for (const p of supplierProducts) {
    const ref = firestore.collection('supplier_products').doc(p.id);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping product id=${p.id} (already exists)`); continue; }
    }
    productDocs.push({ ref, data: { supplier_id: p.supplier_id || null, name: p.name || null, part_no: p.part_no || null, description: p.description || null, brand: p.brand || null, unit: p.unit || 'pcs', unit_price: p.unit_price ?? null, price_date: p.price_date || null } });
  }
  await batchWrite('supplier_products', productDocs);
  log(`Supplier products migrated: ${productDocs.length}/${supplierProducts.length}`);

  // ── Step 10: Migrate cash advances ───────────────────────────────────────
  log('Migrating cash advances...');
  let caCount = 0;
  for (const ca of cashAdvances) {
    const firestoreId = `ca_${ca.id}`;
    caIdMap[ca.id] = firestoreId;
    const ref = firestore.collection('cash_advances').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping cash_advance id=${ca.id} (already exists)`); caCount++; continue; }
    }
    const mappedUserId    = ca.user_id    ? (userIdMap[ca.user_id]       || `user_${ca.user_id}`)       : null;
    const mappedProjectId = ca.project_id ? (projectIdMap[ca.project_id] || `project_${ca.project_id}`) : null;
    const mappedApprovedBy= ca.approved_by? (userIdMap[ca.approved_by]   || `user_${ca.approved_by}`)   : null;
    let breakdown = null;
    if (ca.breakdown) {
      try { breakdown = typeof ca.breakdown === 'string' ? JSON.parse(ca.breakdown) : ca.breakdown; } catch (e) { breakdown = null; }
    }
    await ref.set({
      user_id:          mappedUserId,
      amount:           ca.amount           ?? 0,
      balance_remaining:ca.balance_remaining ?? 0,
      status:           ca.status           || 'pending',
      purpose:          ca.purpose          || null,
      breakdown:        breakdown,
      project_id:       mappedProjectId,
      requested_at:     ca.requested_at     ?? null,
      approved_at:      ca.approved_at      ?? null,
      approved_by:      mappedApprovedBy,
      created_at:       ca.created_at       ?? null,
      updated_at:       ca.updated_at       ?? null,
    });
    caCount++;
  }
  log(`Cash advances migrated: ${caCount}/${cashAdvances.length}`);

  // ── Step 11: Migrate liquidations ────────────────────────────────────────
  log('Migrating liquidations...');
  let liqCount = 0;
  for (const l of liquidations) {
    const firestoreId = `liq_${l.id}`;
    liqIdMap[l.id] = firestoreId;
    const ref = firestore.collection('liquidations').doc(firestoreId);
    if (!OVERWRITE) {
      const existing = await ref.get();
      if (existing.exists) { warn(`Skipping liquidation id=${l.id} (already exists)`); liqCount++; continue; }
    }
    const mappedUserId = l.user_id ? (userIdMap[l.user_id] || `user_${l.user_id}`) : null;
    const mappedCaId   = l.ca_id   ? (caIdMap[l.ca_id]     || `ca_${l.ca_id}`)     : null;
    await ref.set({
      user_id:            mappedUserId,
      form_no:            l.form_no            || null,
      date_of_submission: l.date_of_submission || null,
      employee_name:      l.employee_name      || null,
      employee_number:    l.employee_number    || null,
      rows_json:          l.rows_json          || null,
      total_amount:       l.total_amount       ?? 0,
      ca_id:              mappedCaId,
      status:             l.status             || 'draft',
      created_at:         l.created_at         ?? null,
      updated_at:         l.updated_at         ?? null,
    });
    liqCount++;
  }
  log(`Liquidations migrated: ${liqCount}/${liquidations.length}`);

  // ── Done ─────────────────────────────────────────────────────────────────
  log('');
  log('✅ Migration complete! Summary:');
  log(`   Users:             ${userCount}/${users.length}`);
  log(`   Clients:           ${clientCount}/${clients.length}`);
  log(`   Projects:          ${projectCount}/${projects.length}`);
  log(`   Attachments:       ${attachmentCount}/${attachments.length}`);
  log(`   Suppliers:         ${supplierDocs.length}/${suppliers.length}`);
  log(`   Supplier Products: ${productDocs.length}/${supplierProducts.length}`);
  log(`   Cash Advances:     ${caCount}/${cashAdvances.length}`);
  log(`   Liquidations:      ${liqCount}/${liquidations.length}`);
  log('');
  log(`📦 Backup file: ${backupPath}`);
  log('');
  log('SQLiteCloud data was NOT modified. All reads were read-only.');

  process.exit(0);
}

main().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
