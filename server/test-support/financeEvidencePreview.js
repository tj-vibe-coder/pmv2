'use strict';
// Isolated browser fixture: production build, actual evidence/payment handlers,
// in-memory Firestore. Never initializes Firebase/Graph or production server.js.
const express = require('express');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { FinanceFirestore } = require('./financeFirestore');
const { createFinanceEvidenceRouter } = require('../financeEvidenceRouter');
const { createLiquidationReceiptReviewRouter } = require('../liquidationReceiptReviewRouter');
const { receiptReviewHash } = require('../liquidationReceiptReview');
const app = express(); app.use(express.json());
const users = {
  'fixture-only': { id: 'fixture-reviewer', username: 'RJR', full_name: 'Fixture RJ', role: 'admin', approved: 1 },
  'fixture-staff': { id: 'fixture-employee', username: 'STAFF', full_name: 'Fixture Employee', role: 'user', approved: 1 },
  'fixture-admin': { id: 'fixture-admin', username: 'OTHER', full_name: 'Other Admin', role: 'admin', approved: 1 },
};
const currentUser = async req => users[String(req.headers.authorization || '').replace(/^Bearer /, '')] || null;
const fixtureAuth = async (req, res) => { const user = await currentUser(req); if (!user) res.status(401).json({ error: 'Fixture sign-in required' }); return user; };
const invoice = { id: 'si008', project_id: 'fixture-project', project_name: 'Finance evidence fixture', project_no: 'FIXTURE008', invoice_no: 'SI008', invoice_date: '2026-09-01', due_date: '2026-09-30', payment_terms_days: 30, amount: 193414.05, amount_collected: 185677.49, wht_amount: 7736.56, bill_to_name: 'ACTI', collection_date: '2026-09-10', wht_2307_status: 'received', scan_file: { onedrive_web_url: 'https://example.com/fixture-pack.pdf', filename: 'Fixture original pack.pdf' } };
const liquidation = { user_id: 'fixture-employee', employee_name: 'Fixture Employee', status: 'submitted', form_no: 'LQ26-FIXTURE', date_of_submission: '2026-10-01', total_amount: 3000, reimbursable_amount: 3000, reimbursement_status: 'reimbursed', rows_json: JSON.stringify([{ id: 'row1', date: '2026-10-01', particulars: 'COSH SO2 Certification Training', amount: 3000, projectName: '', projectNo: '' }]), receipts_json: '[]' };
const unpaid = { ...liquidation, form_no: 'LQ26-UNPAID', total_amount: 1500, reimbursable_amount: 1500, reimbursement_status: 'pending', rows_json: JSON.stringify([{ id: 'row2', date: '2026-10-01', particulars: 'Urgent travel reimbursement', amount: 1500 }]) };
const db = new FinanceFirestore({ invoices: { si008: { ...invoice } }, liquidations: { 'fixture-liquidation': liquidation, 'fixture-unpaid': unpaid }, reimbursements: {
  'fixture-liquidation': { liquidationId: 'fixture-liquidation', formNo: 'LQ26-FIXTURE', amount: 3000, status: 'paid', employeeName: 'Fixture Employee', origin: 'no_ca' },
  'fixture-unpaid': { liquidationId: 'fixture-unpaid', formNo: 'LQ26-UNPAID', amount: 1500, status: 'pending', employeeName: 'Fixture Employee', origin: 'no_ca' },
} });
app.post('/api/auth/login', (req, res) => { const username = String(req.body.username || '').toUpperCase(); const token = username === 'STAFF' ? 'fixture-staff' : username === 'OTHER' ? 'fixture-admin' : 'fixture-only'; res.json({ success: true, token, user: users[token] }); });
app.get('/api/auth/me', async (req, res) => res.json({ success: true, user: await currentUser(req) }));
app.get('/api/invoices', (_req, res) => res.json([invoice]));
app.use('/api/liquidations', createLiquidationReceiptReviewRouter({ db, requireActiveUser: fixtureAuth }));
app.get('/api/liquidations', async (req, res) => { const user = await fixtureAuth(req, res); if (!user) return; res.json({ success: true, liquidations: Object.entries(db.store.liquidations).filter(([, liq]) => user.role === 'admin' || liq.user_id === user.id).map(([id, liq]) => ({ ...liq, id })) }); });
app.get('/api/liquidations/next-form-no', (_req, res) => res.json({ success: true, form_no: 'LQ26-NEW-FIXTURE' }));
app.get('/api/liquidations/:id', async (req, res) => { const user = await fixtureAuth(req, res); if (!user) return; const liq = db.store.liquidations[req.params.id]; if (!liq) return res.status(404).json({ error: 'Fixture not found' }); if (user.role !== 'admin' && liq.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' }); res.json({ success: true, liquidation: { ...liq, id: req.params.id, receipt_review_content_hash: receiptReviewHash(liq) } }); });
app.get('/api/cash-advances', (_req, res) => res.json({ success: true, cash_advances: [] }));
app.use('/api/finance-evidence', createFinanceEvidenceRouter({ db, requireActiveUser: fixtureAuth }));
// Evaluate only the real reimbursement route block; mocks keep all side effects local.
const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
const start = source.indexOf('// Admin-only: list pending reimbursement claims');
const end = source.indexOf("app.delete('/api/liquidations/:id'", start);
vm.runInNewContext(source.slice(start, end), { app, db, getCurrentUser: currentUser, require: name => require(path.resolve(__dirname, '../..', name)), normalizeFundingSource: value => value || null, syncExpenseFundingInvestment: async () => true, FieldValue: { increment: n => ({ __increment: n }) }, console });
app.use('/api', (req, res) => { if (req.method !== 'GET') return res.status(501).json({ error: 'Only fixture evidence/payment routes are enabled; real uploads and other writes are disabled' }); res.json([]); });
app.use(express.static(path.resolve(__dirname, '../../build')));
app.get('/{*path}', (_req, res) => res.sendFile(path.resolve(__dirname, '../../build/index.html')));
const fixturePort = Number(process.env.FINANCE_FIXTURE_PORT || 3300);
app.listen(fixturePort, '127.0.0.1', () => console.log(`Isolated finance fixture: http://localhost:${fixturePort} — RJR / STAFF / OTHER with any password; in-memory only`));
