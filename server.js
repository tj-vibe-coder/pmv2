require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  'https://pm.iocontroltech.com',
  'https://pmv2-851ae.web.app',
  'https://pmv2-851ae.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173', // Calcsheet Vite dev server
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Firebase Admin (Firestore)
const admin = require('firebase-admin');
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

console.log('Connected to Firebase Firestore');
if (require.main === module) {
  createDefaultUsers();
  startServer();
}

// Create default users on startup
async function createDefaultUsers() {
  const defaults = [
    { username: 'TJC', email: 'tyronejames.caballero@gmail.com', password: 'IOCT0201!', role: 'superadmin', full_name: 'Tyrone James Caballero', contact_number: '+63 969 162 2660', approved: 1 },
    { username: 'admin', email: 'admin@netpacific.com', password: 'admin123', role: 'admin', full_name: null, contact_number: null, approved: 1 },
    { username: 'user', email: 'user@netpacific.com', password: 'user123', role: 'user', full_name: null, contact_number: null, approved: 1 },
    { username: 'projects', email: 'projects@iocontroltech.com', password: 'IOCT0201!', role: 'admin', full_name: null, contact_number: null, approved: 1 },
  ];
  for (const u of defaults) {
    try {
      const snap = await db.collection('users').where('username', '==', u.username).limit(1).get();
      if (snap.empty) {
        const passwordHash = Buffer.from(u.password).toString('base64');
        const now = Math.floor(Date.now() / 1000);
        await db.collection('users').add({ username: u.username, email: u.email, password_hash: passwordHash, role: u.role, approved: u.approved, full_name: u.full_name, designation: null, contact_number: u.contact_number, created_at: now, updated_at: now });
        console.log(`Default user created: ${u.username}`);
      } else if (u.username === 'TJC') {
        const existing = snap.docs[0].data();
        const patch = {};
        if (!existing.full_name) patch.full_name = 'Tyrone James Caballero';
        if (!existing.contact_number) patch.contact_number = '+63 969 162 2660';
        if (Object.keys(patch).length > 0) await snap.docs[0].ref.update(patch);
      }
    } catch (e) {
      console.error(`Error creating default user ${u.username}:`, e.message);
    }
  }
}

async function syncOperationsStatusToCalcsheet(mainProjectId, projectData) {
  const calcsheetProjectId = projectData?.calcsheet_project_id;
  if (!calcsheetProjectId) return;
  try {
    const now = new Date().toISOString();
    const ref = db.collection('calcsheet_projects').doc(String(calcsheetProjectId));
    const doc = await ref.get();
    if (!doc.exists) return;
    await ref.update({
      mainProjectId: String(mainProjectId),
      mainProjectStatus: projectData.project_status || '',
      mainProjectProgressPercent: Number(projectData.actual_site_progress_percent || 0),
      mainProjectCompletionDate: projectData.completion_date || null,
      mainProjectStatusSyncedAt: now,
    });
  } catch (err) {
    console.error('[projects] failed to sync operations status to calcsheet:', {
      mainProjectId,
      calcsheetProjectId: projectData?.calcsheet_project_id,
      err: err && err.message,
    });
  }
}

function stripUndefinedFields(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined));
}

function primaryClientContact(client) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  return contacts.find((c) => c.isPrimary) || contacts[0] || null;
}

// Helper: get current user from Bearer token
async function getCurrentUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [userId] = decoded.split(':');
    if (!userId) return null;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    return { id: userDoc.id, ...userDoc.data() };
  } catch (e) {
    return null;
  }
}

function isActiveUser(user) {
  if (!user) return false;
  return user.role === 'superadmin' || user.approved === 1 || user.approved === true;
}

async function requireActiveUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}

// ========== AUTH ROUTES ==========

function userResponse(id, user) {
  return {
    id,
    username: user.username,
    email: user.email,
    role: user.role,
    approved: user.approved ? 1 : 0,
    full_name: user.full_name || null,
    designation: user.designation || null,
    contact_number: user.contact_number || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ success: false, error: 'Username and password are required' });
  try {
    const snap = await db.collection('users').where('username', '==', username).get();
    if (snap.empty) return res.json({ success: false, error: 'Invalid credentials' });
    const providedPasswordHash = Buffer.from(password).toString('base64');
    const candidates = snap.docs
      .map((doc) => ({ doc, data: doc.data() }))
      .filter((entry) => entry.data.password_hash === providedPasswordHash)
      .sort((a, b) => {
        const aActive = isActiveUser(a.data) ? 1 : 0;
        const bActive = isActiveUser(b.data) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aUpdated = Number(a.data.updated_at || a.data.created_at || 0);
        const bUpdated = Number(b.data.updated_at || b.data.created_at || 0);
        return bUpdated - aUpdated;
      });
    if (candidates.length === 0) return res.json({ success: false, error: 'Invalid credentials' });
    const userDoc = candidates[0].doc;
    const user = userDoc.data();
    const approved = user.approved === 1 || user.approved === true;
    if (!approved && user.role !== 'superadmin') return res.json({ success: false, error: 'Account pending approval. Contact an administrator.' });
    const token = Buffer.from(`${userDoc.id}:${user.username}:${Date.now()}`).toString('base64');
    res.json({ success: true, user: userResponse(userDoc.id, user), token });
  } catch (err) {
    console.error('Database error during login:', err);
    res.json({ success: false, error: 'Database error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, role = 'user' } = req.body;
  if (!username || !email || !password) return res.json({ success: false, error: 'Username, email, and password are required' });
  if (password.length < 6) return res.json({ success: false, error: 'Password must be at least 6 characters long' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.json({ success: false, error: 'Please enter a valid email address' });
  if (!['user', 'viewer'].includes(role)) return res.json({ success: false, error: 'Invalid role specified' });
  try {
    const [uSnap, eSnap] = await Promise.all([
      db.collection('users').where('username', '==', username).limit(1).get(),
      db.collection('users').where('email', '==', email).limit(1).get(),
    ]);
    if (!uSnap.empty || !eSnap.empty) return res.json({ success: false, error: 'Username or email already exists' });
    const passwordHash = Buffer.from(password).toString('base64');
    const createdAt = Math.floor(Date.now() / 1000);
    const ref = await db.collection('users').add({ username, email, password_hash: passwordHash, role, approved: 0, full_name: null, designation: null, contact_number: null, created_at: createdAt, updated_at: createdAt });
    console.log(`New user registered: ${username} (${email}) with role: ${role} (pending approval)`);
    res.json({ success: true, message: 'Account created. You will be able to log in after an administrator approves your account.', user: { id: ref.id, username, email, role, approved: 0, created_at: createdAt } });
  } catch (err) {
    console.error('Error creating user:', err);
    res.json({ success: false, error: 'Failed to create user account' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ success: false, error: 'Invalid token' });
  res.json({ success: true, user: userResponse(user.id, user) });
});

// ========== USERS ROUTES ==========
const usersRouter = express.Router();

async function listAllUsers(req, res) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(doc => userResponse(doc.id, doc.data())).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}
app.get('/api/users', listAllUsers);
usersRouter.get('/', listAllUsers);

usersRouter.get('/staff-contacts', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const snap = await db.collection('users').where('approved', '==', 1).get();
    const contacts = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          username: d.username || '',
          full_name: d.full_name || '',
          designation: d.designation || '',
          email: d.email || '',
          contact_number: d.contact_number || '',
        };
      })
      .filter((u) => u.full_name);
    res.json({ success: true, contacts });
  } catch (err) {
    console.error('Error fetching staff contacts:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

usersRouter.get('/pending', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  try {
    const snap = await db.collection('users').where('approved', '==', 0).get();
    const users = snap.docs.map(doc => { const d = doc.data(); return { id: doc.id, username: d.username, email: d.email, role: d.role, created_at: d.created_at }; }).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching pending users:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const targetId = req.params.id;
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { username, email, password, full_name, designation, contact_number, role, approved } = req.body;
  const updates = {};
  if (username !== undefined) {
    const nextUsername = String(username).trim();
    if (!nextUsername) return res.status(400).json({ success: false, error: 'Username is required' });
    updates.username = nextUsername;
  }
  if (email !== undefined) {
    const nextEmail = String(email).trim();
    if (!nextEmail) return res.status(400).json({ success: false, error: 'Email is required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nextEmail)) return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    updates.email = nextEmail;
  }
  if (password !== undefined && String(password).length > 0) {
    const nextPassword = String(password);
    if (nextPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    updates.password_hash = Buffer.from(nextPassword).toString('base64');
  }
  if (full_name !== undefined) updates.full_name = full_name == null ? null : String(full_name).trim();
  if (designation !== undefined) updates.designation = designation == null ? null : String(designation).trim();
  if (contact_number !== undefined) updates.contact_number = contact_number == null ? null : String(contact_number).trim();
  if (role !== undefined && ['superadmin', 'admin', 'user', 'viewer'].includes(role)) updates.role = role;
  if (approved !== undefined) updates.approved = approved ? 1 : 0;
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
  updates.updated_at = Math.floor(Date.now() / 1000);
  try {
    const ref = db.collection('users').doc(targetId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'User not found' });
    const currentData = doc.data();
    if (
      currentData.role === 'superadmin' &&
      ((updates.role && updates.role !== 'superadmin') || updates.approved === 0)
    ) {
      const saSnap = await db.collection('users').where('role', '==', 'superadmin').get();
      if (saSnap.size <= 1) return res.status(400).json({ success: false, error: 'Cannot remove access from the last superadmin' });
    }
    if (updates.username) {
      const snap = await db.collection('users').where('username', '==', updates.username).limit(1).get();
      if (!snap.empty && snap.docs[0].id !== targetId) return res.status(409).json({ success: false, error: 'Username already exists' });
    }
    if (updates.email) {
      const snap = await db.collection('users').where('email', '==', updates.email).limit(1).get();
      if (!snap.empty && snap.docs[0].id !== targetId) return res.status(409).json({ success: false, error: 'Email already exists' });
    }
    await ref.update(updates);
    const updatedDoc = await ref.get();
    const d = updatedDoc.data();
    res.json({
      success: true,
      message: 'User updated',
      user: userResponse(updatedDoc.id, d),
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

usersRouter.post('/:id/approve', async (req, res) => {
  const targetId = req.params.id;
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  try {
    const ref = db.collection('users').doc(targetId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'User not found' });
    await ref.update({ approved: 1, updated_at: Math.floor(Date.now() / 1000) });
    console.log(`User ${targetId} approved by superadmin ${user.username}`);
    res.json({ success: true, message: 'User approved' });
  } catch (err) {
    console.error('Error approving user:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

async function deleteUserHandler(req, res) {
  const targetId = req.params.id;
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  if (user.id === targetId) return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
  try {
    const targetRef = db.collection('users').doc(targetId);
    const target = await targetRef.get();
    if (!target.exists) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.data().role === 'superadmin') {
      const saSnap = await db.collection('users').where('role', '==', 'superadmin').get();
      if (saSnap.size <= 1) return res.status(400).json({ success: false, error: 'Cannot delete the last superadmin' });
    }
    await targetRef.delete();
    console.log(`User ${targetId} deleted by superadmin ${user.username}`);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}
app.delete('/api/users/:id', deleteUserHandler);
usersRouter.delete('/:id', deleteUserHandler);
app.use('/api/users', usersRouter);

// ========== PROJECTS ROUTES ==========

function formatProject(doc) {
  return { id: doc.id, ...doc.data() };
}

app.get('/api/projects', async (req, res) => {
  const { status, year, search, client, category } = req.query;
  try {
    const snap = await db.collection('projects').orderBy('created_at', 'desc').get();
    let rows = snap.docs.map(formatProject);
    if (status) rows = rows.filter(r => r.project_status === status);
    if (year) rows = rows.filter(r => r.year === parseInt(year));
    if (category) rows = rows.filter(r => r.project_category === category);
    if (client) rows = rows.filter(r => r.account_name === client);
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(r => (r.project_name || '').toLowerCase().includes(term) || (r.account_name || '').toLowerCase().includes(term) || (r.ovp_number || '').toLowerCase().includes(term));
    }
    res.json(rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/count', async (req, res) => {
  try {
    const snap = await db.collection('projects').count().get();
    res.json({ count: snap.data().count });
  } catch (err) {
    console.error('Error fetching project count:', err);
    res.status(500).json({ error: 'Failed to fetch project count' });
  }
});

app.get('/api/projects/unique/statuses', async (req, res) => {
  try {
    const snap = await db.collection('projects').select('project_status').get();
    const statuses = [...new Set(snap.docs.map(d => d.data().project_status).filter(Boolean))].sort();
    res.json(statuses);
  } catch (err) {
    console.error('Error fetching unique statuses:', err);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

app.get('/api/projects/unique/years', async (req, res) => {
  try {
    const snap = await db.collection('projects').select('year').get();
    const years = [...new Set(snap.docs.map(d => d.data().year).filter(Boolean))].sort((a, b) => b - a);
    res.json(years);
  } catch (err) {
    console.error('Error fetching unique years:', err);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
});

app.get('/api/projects/unique/categories', async (req, res) => {
  try {
    const snap = await db.collection('projects').select('project_category').get();
    const categories = [...new Set(snap.docs.map(d => d.data().project_category).filter(Boolean))].sort();
    res.json(categories);
  } catch (err) {
    console.error('Error fetching unique categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/projects/unique/clients', async (req, res) => {
  try {
    const [clientsSnap, projectsSnap] = await Promise.all([
      db.collection('clients').select('client_name').get(),
      db.collection('projects').select('account_name', 'client_id').get(),
    ]);
    const names = new Set();
    clientsSnap.docs.forEach(d => { if (d.data().client_name) names.add(d.data().client_name); });
    projectsSnap.docs.forEach(d => { const data = d.data(); if (!data.client_id && data.account_name) names.add(data.account_name); });
    res.json([...names].sort());
  } catch (err) {
    console.error('Error fetching unique clients:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const doc = await db.collection('projects').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
    res.json(formatProject(doc));
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.post('/api/projects', async (req, res) => {
  const projectData = { ...req.body };
  delete projectData.id;
  try {
    if (projectData.client_id) {
      const clientDoc = await db.collection('clients').doc(String(projectData.client_id)).get();
      if (clientDoc.exists) {
        const c = clientDoc.data();
        const primary = primaryClientContact(c);
        projectData.account_name = c.name || c.client_name || projectData.account_name || '';
        projectData.client_approver = [
          primary?.name || c.contact_person,
          primary?.position || c.designation,
        ].filter(Boolean).join(' – ').trim() || projectData.client_approver || '';
      }
    }
    const now = new Date().toISOString();
    const ref = await db.collection('projects').add(stripUndefinedFields({ ...projectData, created_at: now, updated_at: now }));
    res.status(201).json({ id: ref.id, message: 'Project created successfully' });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({
      error: 'Failed to create project',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

app.post('/api/projects/bulk', async (req, res) => {
  const projects = req.body.projects;
  if (!Array.isArray(projects)) return res.status(400).json({ error: 'Projects must be an array' });
  try {
    const now = new Date().toISOString();
    const BATCH_SIZE = 500;
    let successCount = 0;
    const errors = [];
    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const chunk = projects.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach((project, idx) => {
        try {
          const ref = db.collection('projects').doc();
          batch.set(ref, {
            item_no: project.item_no || 0, year: project.year || new Date().getFullYear(), am: project.am || '',
            ovp_number: project.ovp_number || '', po_number: project.po_number || '', po_date: project.po_date || null,
            client_status: project.client_status || '', account_name: project.account_name || '', project_name: project.project_name || '',
            project_category: project.project_category || '', project_location: project.project_location || '', scope_of_work: project.scope_of_work || '',
            qtn_no: project.qtn_no || '', ovp_category: project.ovp_category || '', contract_amount: project.contract_amount || 0,
            updated_contract_amount: project.updated_contract_amount || 0, down_payment_percent: project.down_payment_percent || 0,
            retention_percent: project.retention_percent || 0, start_date: project.start_date || null, duration_days: project.duration_days || 0,
            completion_date: project.completion_date || null, payment_schedule: project.payment_schedule || '', payment_terms: project.payment_terms || '',
            bonds_requirement: project.bonds_requirement || '', project_director: project.project_director || '', client_approver: project.client_approver || '',
            progress_billing_schedule: project.progress_billing_schedule || '', mobilization_date: project.mobilization_date || null,
            updated_completion_date: project.updated_completion_date || null, project_status: project.project_status || 'OPEN',
            actual_site_progress_percent: project.actual_site_progress_percent || 0, actual_progress: project.actual_progress || 0,
            evaluated_progress_percent: project.evaluated_progress_percent || 0, evaluated_progress: project.evaluated_progress || 0,
            for_rfb_percent: project.for_rfb_percent || 0, for_rfb_amount: project.for_rfb_amount || 0, rfb_date: project.rfb_date || null,
            type_of_rfb: project.type_of_rfb || '', work_in_progress_ap: project.work_in_progress_ap || 0, work_in_progress_ep: project.work_in_progress_ep || 0,
            updated_contract_balance_percent: project.updated_contract_balance_percent || 0, total_contract_balance: project.total_contract_balance || 0,
            updated_contract_balance_net_percent: project.updated_contract_balance_net_percent || 0, updated_contract_balance_net: project.updated_contract_balance_net || 0,
            remarks: project.remarks || '', contract_billed_gross_percent: project.contract_billed_gross_percent || 0, contract_billed: project.contract_billed || 0,
            contract_billed_net_percent: project.contract_billed_net_percent || 0, amount_contract_billed_net: project.amount_contract_billed_net || 0,
            for_retention_billing_percent: project.for_retention_billing_percent || 0, amount_for_retention_billing: project.amount_for_retention_billing || 0,
            retention_status: project.retention_status || '', unevaluated_progress: project.unevaluated_progress || 0,
            created_at: now, updated_at: now,
          });
          successCount++;
        } catch (error) {
          errors.push(`Row ${i + idx + 1}: ${error.message}`);
        }
      });
      await batch.commit();
    }
    res.json({ success: true, addedCount: successCount, errors });
  } catch (err) {
    console.error('Error bulk creating projects:', err);
    res.status(500).json({ error: 'Failed to save projects' });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const projectData = { ...req.body };
  delete projectData.id;
  try {
    if (projectData.client_id) {
      const clientDoc = await db.collection('clients').doc(String(projectData.client_id)).get();
      if (clientDoc.exists) {
        const c = clientDoc.data();
        const primary = primaryClientContact(c);
        projectData.account_name = c.name || c.client_name || projectData.account_name || '';
        projectData.client_approver = [
          primary?.name || c.contact_person,
          primary?.position || c.designation,
        ].filter(Boolean).join(' – ').trim() || projectData.client_approver || '';
      }
    }
    projectData.updated_at = new Date().toISOString();
    const cleanProjectData = stripUndefinedFields(projectData);
    const ref = db.collection('projects').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
    await ref.update(cleanProjectData);
    await syncOperationsStatusToCalcsheet(id, { ...doc.data(), ...cleanProjectData });
    res.json({ message: 'Project updated successfully' });
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({
      error: 'Failed to update project',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

app.delete('/api/projects', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs must be an array' });
  try {
    const BATCH_SIZE = 500;
    let deletedCount = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = db.batch();
      ids.slice(i, i + BATCH_SIZE).forEach(id => { batch.delete(db.collection('projects').doc(String(id))); deletedCount++; });
      await batch.commit();
    }
    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('Error deleting projects:', err);
    res.status(500).json({ error: 'Failed to delete projects' });
  }
});

// ========== STATS ==========
app.get('/api/stats', async (req, res) => {
  try {
    const snap = await db.collection('projects').get();
    const projects = snap.docs.map(d => d.data());
    const statusCounts = {};
    const directorCounts = {};
    let totalContractValue = 0;
    let totalBilled = 0;
    projects.forEach(p => {
      if (p.project_status) statusCounts[p.project_status] = (statusCounts[p.project_status] || 0) + 1;
      if (p.project_director) directorCounts[p.project_director] = (directorCounts[p.project_director] || 0) + 1;
      totalContractValue += p.updated_contract_amount || 0;
      totalBilled += p.contract_billed || 0;
    });
    res.json({
      totalProjects: [{ count: projects.length }],
      projectsByStatus: Object.entries(statusCounts).map(([project_status, count]) => ({ project_status, count })),
      projectsByDirector: Object.entries(directorCounts).map(([project_director, count]) => ({ project_director, count })),
      totalContractValue: [{ total: totalContractValue }],
      totalBilled: [{ total: totalBilled }],
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ========== CLIENTS ROUTES (unified schema: camelCase + contacts[]) ==========

function primaryContactOf(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;
  return contacts.find((c) => c && c.isPrimary) || contacts[0];
}

function clientApproverString(contacts) {
  const p = primaryContactOf(contacts);
  if (!p) return '';
  return [p.name, p.position].filter(Boolean).join(' – ').trim();
}

app.get('/api/clients', async (req, res) => {
  try {
    const snap = await db.collection('clients').orderBy('name').get();
    res.json(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const doc = await db.collection('clients').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

app.post('/api/clients', async (req, res) => {
  const { code, name, address, paymentTerms, am, contacts } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'At least one contact is required' });
  }
  try {
    const now = new Date().toISOString();
    const body = {
      code: (code || '').trim().toUpperCase().slice(0, 4),
      name: name.trim(),
      address: address || '',
      paymentTerms: paymentTerms || '',
      am: am || '',
      contacts: contacts.map((c) => ({
        id: c.id || Math.random().toString(36).slice(2, 10),
        name: (c.name || '').trim(),
        position: c.position || '',
        email: c.email || '',
        phone: c.phone || '',
        gender: c.gender || '',
        isPrimary: !!c.isPrimary,
        notes: c.notes || '',
      })),
      createdAt: now,
      updatedAt: now,
    };
    // Ensure at least one is primary
    if (!body.contacts.some((c) => c.isPrimary)) body.contacts[0].isPrimary = true;
    const ref = await db.collection('clients').add(body);
    res.status(201).json({ id: ref.id, ...body });
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const { code, name, address, paymentTerms, am, contacts } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'At least one contact is required' });
  }
  try {
    const ref = db.collection('clients').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });
    const now = new Date().toISOString();
    const cleanedContacts = contacts.map((c) => ({
      id: c.id || Math.random().toString(36).slice(2, 10),
      name: (c.name || '').trim(),
      position: c.position || '',
      email: c.email || '',
      phone: c.phone || '',
      gender: c.gender || '',
      isPrimary: !!c.isPrimary,
      notes: c.notes || '',
    }));
    if (!cleanedContacts.some((c) => c.isPrimary)) cleanedContacts[0].isPrimary = true;
    const trimmedName = name.trim();
    await ref.update({
      code: (code || '').trim().toUpperCase().slice(0, 4),
      name: trimmedName,
      address: address || '',
      paymentTerms: paymentTerms || '',
      am: am || '',
      contacts: cleanedContacts,
      updatedAt: now,
    });
    // Cascade to projects.account_name and projects.client_approver (derived from primary contact)
    const approver = clientApproverString(cleanedContacts);
    const projectsSnap = await db.collection('projects').where('client_id', '==', id).get();
    if (!projectsSnap.empty) {
      const batch = db.batch();
      projectsSnap.docs.forEach((pDoc) => batch.update(pDoc.ref, {
        account_name: trimmedName,
        client_approver: approver,
        updated_at: now,
      }));
      await batch.commit();
    }
    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const ref = db.collection('clients').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });
    await ref.delete();
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// ========== EXPENSE ROUTES (static) ==========
app.get('/api/expenses/categories', (req, res) => res.json([]));
app.get('/api/expenses', (req, res) => res.json([]));
app.post('/api/expenses', (req, res) => {
  const { projectId, category, description, amount, date } = req.body;
  if (!projectId || !category || !description || !amount) return res.status(400).json({ error: 'Missing required fields' });
  res.status(201).json({ success: true, expense: { id: Date.now().toString(), projectId, category, description, amount: parseFloat(amount), date: date || new Date().toISOString(), status: 'pending', created_at: new Date().toISOString() } });
});

// ========== CASH ADVANCES ==========

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Human-readable CA reference number. Per-project sequence when the CA is tied
// to a project with a project_no (e.g. IOCT2606001-CA01); otherwise a global
// monthly fallback (e.g. CA2606-001) for out-of-project / prospect CAs.
// Scan-max with no transaction — same approach as nextIoctProjectNo() and
// /api/liquidations/next-form-no; volume is low and `id` stays the real key.
async function nextCaNo(projectId, dateLike) {
  let projectNo = null;
  if (projectId) {
    const pDoc = await db.collection('projects').doc(String(projectId)).get();
    if (pDoc.exists) projectNo = String(pDoc.data().project_no || '').trim().toUpperCase() || null;
  }
  if (projectNo) {
    const snap = await db.collection('cash_advances')
      .where('project_id', '==', String(projectId)).select('ca_no').get();
    const re = new RegExp(`^${escapeRegExp(projectNo)}-CA(\\d+)$`);
    let max = 0;
    for (const d of snap.docs) {
      const m = String(d.data().ca_no || '').trim().toUpperCase().match(re);
      if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n > max) max = n; }
    }
    return `${projectNo}-CA${String(max + 1).padStart(2, '0')}`;
  }
  const prefix = `CA${phYearMonth(dateLike)}-`;
  const snap = await db.collection('cash_advances').select('ca_no').get();
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d{3})$`);
  let max = 0;
  for (const d of snap.docs) {
    const m = String(d.data().ca_no || '').trim().toUpperCase().match(re);
    if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n > max) max = n; }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

app.get('/api/cash-advances', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    let snap;
    if (isAdmin) {
      snap = await db.collection('cash_advances').get();
    } else {
      snap = await db.collection('cash_advances').where('user_id', '==', user.id).get();
    }
    const rows = await Promise.all(snap.docs.map(async doc => {
      const ca = { id: doc.id, ...doc.data() };
      if (ca.user_id) {
        const uDoc = await db.collection('users').doc(ca.user_id).get();
        if (uDoc.exists) { ca.username = uDoc.data().username; ca.full_name = uDoc.data().full_name; }
      }
      if (ca.project_id) {
        const pDoc = await db.collection('projects').doc(ca.project_id).get();
        if (pDoc.exists) { ca.project_name = pDoc.data().project_name; ca.project_no = pDoc.data().project_no; }
      }
      return ca;
    }));
    rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    res.json({ success: true, cash_advances: rows });
  } catch (err) {
    console.error('Error fetching cash advances:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/cash-advances', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const projectId = req.body.project_id != null ? String(req.body.project_id) : null;
  let breakdown = null;
  let amount = parseFloat(req.body.amount);
  const rawBreakdown = req.body.breakdown;
  if (Array.isArray(rawBreakdown) && rawBreakdown.length > 0) {
    const items = rawBreakdown.map(r => ({ category: String(r.category ?? '').trim() || null, description: String(r.description ?? '').trim() || null, amount: parseFloat(r.amount) })).filter(r => Number.isFinite(r.amount) && r.amount > 0);
    const sum = items.reduce((s, r) => s + r.amount, 0);
    if (items.length > 0) { breakdown = items; if (sum > 0) amount = sum; }
  }
  if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Add at least one breakdown line with an amount (total is auto-computed)' });
  // CAs may pre-date a project (e.g. prospect work before a quotation) — in
  // that case a purpose/prospect description is required instead.
  const purpose = String(req.body.purpose ?? '').trim() || null;
  if (!projectId && !purpose) return res.status(400).json({ success: false, error: 'Select a project or describe the purpose/prospect' });
  let requestedAt = Math.floor(Date.now() / 1000);
  const dateRequested = req.body.date_requested;
  if (dateRequested && /^\d{4}-\d{2}-\d{2}$/.test(String(dateRequested).trim())) {
    requestedAt = Math.floor(new Date(dateRequested + 'T12:00:00').getTime() / 1000);
  }
  try {
    const caNo = await nextCaNo(projectId, new Date(requestedAt * 1000));
    const ref = await db.collection('cash_advances').add({ user_id: user.id, amount, balance_remaining: 0, status: 'pending', purpose, breakdown: breakdown || null, project_id: projectId || null, ca_no: caNo, requested_at: requestedAt, approved_at: null, approved_by: null, created_at: requestedAt, updated_at: requestedAt });
    res.status(201).json({ success: true, id: ref.id, ca_no: caNo, message: `Cash advance ${caNo} requested` });
  } catch (err) {
    console.error('Error creating cash advance:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.patch('/api/cash-advances/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { id } = req.params;
  const { status } = req.body;
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ success: false, error: 'Status must be approved or rejected' });
  try {
    const ref = db.collection('cash_advances').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Cash advance not found' });
    const ca = doc.data();
    if (ca.status !== 'pending') return res.status(400).json({ success: false, error: 'Already processed' });
    const now = Math.floor(Date.now() / 1000);
    await ref.update({ status, balance_remaining: status === 'approved' ? ca.amount : 0, approved_at: status === 'approved' ? now : null, approved_by: status === 'approved' ? user.id : null, updated_at: now });
    res.json({ success: true, message: status === 'approved' ? 'Cash advance approved' : 'Cash advance rejected' });
  } catch (err) {
    console.error('Error updating cash advance:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/cash-advances/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { id } = req.params;
  const canDeleteAny = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('cash_advances').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Cash advance not found' });
    const ca = doc.data();
    if (!canDeleteAny) {
      if (ca.status !== 'pending') return res.status(400).json({ success: false, error: 'Only pending requests can be deleted' });
      if (ca.user_id !== user.id) return res.status(403).json({ success: false, error: 'You can only delete your own request' });
    }
    const liqSnap = await db.collection('liquidations').where('ca_id', '==', id).get();
    // Submitted liquidations have already deducted from this CA's balance —
    // silently unlinking them would orphan that money trail. Block the delete
    // and let the user resolve the liquidations first. Drafts are just unlinked.
    const submittedLiqs = liqSnap.docs.filter(lDoc => lDoc.data().status === 'submitted');
    if (submittedLiqs.length > 0) {
      const formNos = submittedLiqs.map(lDoc => lDoc.data().form_no || lDoc.id).slice(0, 5).join(', ');
      return res.status(400).json({ success: false, error: `This CA has ${submittedLiqs.length} submitted liquidation(s) (${formNos}). Delete or unlink them first.` });
    }
    if (!liqSnap.empty) {
      const batch = db.batch();
      liqSnap.docs.forEach(lDoc => batch.update(lDoc.ref, { ca_id: null }));
      await batch.commit();
    }
    await ref.delete();
    res.json({ success: true, message: 'Cash advance deleted' });
  } catch (err) {
    console.error('Error deleting cash advance:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ========== LIQUIDATIONS ==========
app.get('/api/liquidations', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const snap = isAdmin
      ? await db.collection('liquidations').get()
      : await db.collection('liquidations').where('user_id', '==', user.id).get();
    const rows = await Promise.all(snap.docs.map(async doc => {
      const liq = { id: doc.id, ...doc.data() };
      if (liq.user_id) {
        const uDoc = await db.collection('users').doc(liq.user_id).get();
        if (uDoc.exists) { liq.username = uDoc.data().username; liq.full_name = uDoc.data().full_name; }
      }
      return liq;
    }));
    rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    res.json({ success: true, liquidations: rows });
  } catch (err) {
    console.error('Error fetching liquidations:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/liquidations/next-form-no', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const snap = await db.collection('liquidations').where('status', '==', 'submitted').select('form_no').get();
    const formNos = snap.docs.map(d => d.data().form_no).filter(fn => fn && typeof fn === 'string' && fn.startsWith('LQ-'));
    let nextNum = 1;
    if (formNos.length > 0) {
      const nums = formNos.map(fn => { const m = fn.match(/LQ-0*(\d+)/); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
      if (nums.length > 0) nextNum = Math.max(...nums) + 1;
    }
    res.json({ success: true, form_no: `LQ-${String(nextNum).padStart(4, '0')}` });
  } catch (err) {
    console.error('Error fetching next form number:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/liquidations/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const doc = await db.collection('liquidations').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = { id: doc.id, ...doc.data() };
    if (user.role !== 'superadmin' && user.role !== 'admin' && liq.user_id !== user.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, liquidation: liq });
  } catch (err) {
    console.error('Error fetching liquidation:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/liquidations', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { form_no, date_of_submission, employee_name, employee_number, rows_json, receipts_json, total_amount, status, ca_id } = req.body;
  const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
  const receipts = receipts_json ? (typeof receipts_json === 'string' ? JSON.parse(receipts_json) : receipts_json) : [];
  const total = parseFloat(total_amount) || 0;
  const now = Math.floor(Date.now() / 1000);
  const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
  const caId = ca_id ? String(ca_id) : null;
  try {
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
      const bal = parseFloat(caDoc.data().balance_remaining) || 0;
      if (total > bal) return res.status(400).json({ success: false, error: `Liquidation (₱${total.toFixed(2)}) exceeds CA balance remaining (₱${bal.toFixed(2)})` });
    }
    if (liqStatus === 'submitted' && form_no) {
      const dupSnap = await db.collection('liquidations').where('status', '==', 'submitted').where('form_no', '==', form_no).get();
      if (!dupSnap.empty) return res.status(409).json({ success: false, error: `Form no ${form_no} is already used — refresh to get the next number` });
    }
    // No-CA submitted liquidations are out-of-pocket reimbursement claims —
    // tracked so the requester gets paid back (see PATCH below).
    const reimbursementStatus = liqStatus === 'submitted' && !caId ? 'pending' : null;
    const ref = await db.collection('liquidations').add({ user_id: user.id, form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), receipts_json: JSON.stringify(receipts), total_amount: total, ca_id: caId, status: liqStatus, reimbursement_status: reimbursementStatus, reimbursed_at: null, reimbursed_by: null, created_at: now, updated_at: now });
    if (liqStatus === 'submitted' && caId) {
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(-total), updated_at: now });
    }
    res.status(201).json({ success: true, id: ref.id, message: liqStatus === 'submitted' ? 'Liquidation submitted' : 'Draft saved' });
  } catch (err) {
    console.error('Error creating liquidation:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/liquidations/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const ref = db.collection('liquidations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const existing = doc.data();
    if (existing.user_id !== user.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (existing.status === 'submitted') return res.status(400).json({ success: false, error: 'Cannot edit submitted liquidation' });
    const { form_no, date_of_submission, employee_name, employee_number, rows_json, receipts_json, total_amount, status, ca_id } = req.body;
    const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
    const receipts = receipts_json ? (typeof receipts_json === 'string' ? JSON.parse(receipts_json) : receipts_json) : [];
    const total = parseFloat(total_amount) || 0;
    const now = Math.floor(Date.now() / 1000);
    const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
    const caId = ca_id ? String(ca_id) : null;
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
      const bal = parseFloat(caDoc.data().balance_remaining) || 0;
      if (total > bal) return res.status(400).json({ success: false, error: `Liquidation (₱${total.toFixed(2)}) exceeds CA balance remaining (₱${bal.toFixed(2)})` });
    }
    if (liqStatus === 'submitted' && form_no) {
      const dupSnap = await db.collection('liquidations').where('status', '==', 'submitted').where('form_no', '==', form_no).get();
      if (dupSnap.docs.some(d => d.id !== id)) return res.status(409).json({ success: false, error: `Form no ${form_no} is already used — refresh to get the next number` });
    }
    const reimbursementStatus = liqStatus === 'submitted' && !caId ? 'pending' : null;
    await ref.update({ form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), receipts_json: JSON.stringify(receipts), total_amount: total, ca_id: caId, status: liqStatus, reimbursement_status: reimbursementStatus, updated_at: now });
    if (liqStatus === 'submitted' && caId) {
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(-total), updated_at: now });
    }
    res.json({ success: true, message: liqStatus === 'submitted' ? 'Liquidation submitted' : 'Draft updated' });
  } catch (err) {
    console.error('Error updating liquidation:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Admin-only: mark an out-of-pocket (no-CA) submitted liquidation as
// reimbursed (or revert to pending). CA-linked liquidations settle through the
// CA balance instead, so reimbursement tracking does not apply to them.
app.patch('/api/liquidations/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { reimbursement_status } = req.body;
  if (reimbursement_status !== 'pending' && reimbursement_status !== 'reimbursed') return res.status(400).json({ success: false, error: 'reimbursement_status must be pending or reimbursed' });
  try {
    const ref = db.collection('liquidations').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = doc.data();
    if (liq.status !== 'submitted' || liq.ca_id) return res.status(400).json({ success: false, error: 'Reimbursement status only applies to submitted liquidations without a CA' });
    const now = Math.floor(Date.now() / 1000);
    await ref.update({
      reimbursement_status,
      reimbursed_at: reimbursement_status === 'reimbursed' ? now : null,
      reimbursed_by: reimbursement_status === 'reimbursed' ? user.id : null,
      updated_at: now,
    });
    res.json({ success: true, message: reimbursement_status === 'reimbursed' ? 'Marked as reimbursed' : 'Reverted to pending reimbursement' });
  } catch (err) {
    console.error('Error updating liquidation reimbursement status:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/liquidations/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { id } = req.params;
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('liquidations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = doc.data();
    if (!isAdmin && liq.user_id !== user.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    const total = parseFloat(liq.total_amount) || 0;
    const caId = liq.ca_id || null;
    const now = Math.floor(Date.now() / 1000);
    if (liq.status === 'submitted' && caId && total > 0) {
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(total), updated_at: now });
    }
    await ref.delete();
    res.json({ success: true, message: 'Liquidation deleted' });
  } catch (err) {
    console.error('Error deleting liquidation:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ========== FORECASTING (static data) ==========
app.get('/api/forecasting/revenue', (req, res) => {
  res.json([
    { month: 'Jan 2025', historicalRevenue: 8500000, forecastedRevenue: 9200000, billingSchedule: 8800000, collections: 8100000 },
    { month: 'Feb 2025', historicalRevenue: 9200000, forecastedRevenue: 9800000, billingSchedule: 9500000, collections: 8900000 },
    { month: 'Mar 2025', historicalRevenue: 7800000, forecastedRevenue: 8500000, billingSchedule: 8200000, collections: 7600000 },
    { month: 'Apr 2025', historicalRevenue: 0, forecastedRevenue: 10200000, billingSchedule: 9800000, collections: 9400000 },
    { month: 'May 2025', historicalRevenue: 0, forecastedRevenue: 11500000, billingSchedule: 11000000, collections: 10200000 },
    { month: 'Jun 2025', historicalRevenue: 0, forecastedRevenue: 10800000, billingSchedule: 10400000, collections: 9800000 },
    { month: 'Jul 2025', historicalRevenue: 0, forecastedRevenue: 12200000, billingSchedule: 11800000, collections: 11000000 },
    { month: 'Aug 2025', historicalRevenue: 0, forecastedRevenue: 11900000, billingSchedule: 11500000, collections: 10800000 },
    { month: 'Sep 2025', historicalRevenue: 0, forecastedRevenue: 13100000, billingSchedule: 12600000, collections: 11900000 },
    { month: 'Oct 2025', historicalRevenue: 0, forecastedRevenue: 12800000, billingSchedule: 12300000, collections: 11600000 },
    { month: 'Nov 2025', historicalRevenue: 0, forecastedRevenue: 14200000, billingSchedule: 13700000, collections: 12900000 },
    { month: 'Dec 2025', historicalRevenue: 0, forecastedRevenue: 13500000, billingSchedule: 13000000, collections: 12200000 },
  ]);
});
app.get('/api/forecasting/cashflow', (req, res) => {
  res.json([
    { period: 'Q1 2025', actual: 25500000, predicted: 26200000, confidence: 85, upperBound: 28000000, lowerBound: 24400000 },
    { period: 'Q2 2025', predicted: 32100000, confidence: 78, upperBound: 35200000, lowerBound: 29000000 },
    { period: 'Q3 2025', predicted: 38900000, confidence: 72, upperBound: 43100000, lowerBound: 34700000 },
    { period: 'Q4 2025', predicted: 41200000, confidence: 68, upperBound: 46800000, lowerBound: 35600000 },
    { period: 'Q1 2026', predicted: 44500000, confidence: 62, upperBound: 51200000, lowerBound: 37800000 },
    { period: 'Q2 2026', predicted: 47800000, confidence: 58, upperBound: 55600000, lowerBound: 40000000 },
  ]);
});
app.get('/api/forecasting/projects', (req, res) => {
  res.json([
    { projectId: 1, projectName: 'PLDT CLARKTEL PAMPANGA', currentProgress: 65, predictedCompletion: new Date('2025-08-15').toISOString(), riskLevel: 'low', estimatedCost: 597582.68, actualCost: 389128.74, projectedFinalCost: 612000 },
    { projectId: 2, projectName: 'SMART CAMPUS MODERNIZATION', currentProgress: 45, predictedCompletion: new Date('2025-12-20').toISOString(), riskLevel: 'medium', estimatedCost: 5000000, actualCost: 2250000, projectedFinalCost: 5200000 },
    { projectId: 3, projectName: 'Network Infrastructure Upgrade', currentProgress: 25, predictedCompletion: new Date('2026-03-10').toISOString(), riskLevel: 'high', estimatedCost: 3200000, actualCost: 800000, projectedFinalCost: 3800000 },
  ]);
});
app.get('/api/forecasting/metrics', (req, res) => {
  res.json({ totalForecastedRevenue: 142700000, growthRate: 15.2, highRiskProjects: 1, avgConfidence: 70.5, nextQuarterRevenue: 32100000, projectedProfit: 8500000 });
});

// ========== PROJECT ATTACHMENTS ==========
app.get('/api/projects/:id/attachments', async (req, res) => {
  try {
    const snap = await db.collection('project_attachments').where('project_id', '==', req.params.id).get();
    const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(rows);
  } catch (err) {
    console.error('Error fetching attachments:', err);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

app.post('/api/projects/:id/attachments', async (req, res) => {
  const projectId = req.params.id;
  const { filename, onedrive_item_id, onedrive_web_url, file_size, uploaded_by } = req.body;
  if (!filename || !onedrive_item_id) return res.status(400).json({ error: 'filename and onedrive_item_id are required' });
  try {
    const ref = await db.collection('project_attachments').add({ project_id: projectId, filename, onedrive_item_id, onedrive_web_url: onedrive_web_url || null, file_size: file_size || null, uploaded_by: uploaded_by || null, created_at: new Date().toISOString() });
    res.status(201).json({ id: ref.id, message: 'Attachment saved' });
  } catch (err) {
    console.error('Error creating attachment:', err);
    res.status(500).json({ error: 'Failed to save attachment' });
  }
});

app.delete('/api/projects/:projectId/attachments/:attachmentId', async (req, res) => {
  const { projectId, attachmentId } = req.params;
  try {
    const ref = db.collection('project_attachments').doc(attachmentId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().project_id !== projectId) return res.status(404).json({ error: 'Attachment not found' });
    await ref.delete();
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Error deleting attachment:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ========== SUPPLIERS ==========
app.get('/api/suppliers', async (req, res) => {
  try {
    const [suppliersSnap, productsSnap] = await Promise.all([
      db.collection('suppliers').orderBy('name').get(),
      db.collection('supplier_products').get(),
    ]);
    if (suppliersSnap.empty) return res.json([]);
    const bySupplier = {};
    productsSnap.docs.forEach(doc => {
      const p = doc.data();
      if (!bySupplier[p.supplier_id]) bySupplier[p.supplier_id] = [];
      bySupplier[p.supplier_id].push({ id: doc.id, name: p.name || '', partNo: p.part_no || '', description: p.description || '', brand: p.brand || undefined, unit: p.unit || 'pcs', unitPrice: p.unit_price != null ? p.unit_price : undefined, priceDate: p.price_date || undefined });
    });
    const list = suppliersSnap.docs.map(doc => { const s = doc.data(); return { id: doc.id, name: s.name, contactName: s.contact_name || '', email: s.email || '', phone: s.phone || '', address: s.address || '', paymentTerms: s.payment_terms || undefined, products: bySupplier[doc.id] || [], createdAt: s.created_at || new Date().toISOString() }; });
    res.json(list);
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/suppliers', async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Body must be an array of suppliers' });
  try {
    // Delete all existing suppliers and products
    const [suppSnap, prodSnap] = await Promise.all([db.collection('suppliers').get(), db.collection('supplier_products').get()]);
    const BATCH_SIZE = 500;
    for (let i = 0; i < suppSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      suppSnap.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    for (let i = 0; i < prodSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      prodSnap.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    if (list.length === 0) return res.json({ saved: true, count: 0 });
    // Insert new suppliers
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = db.batch();
      list.slice(i, i + BATCH_SIZE).forEach(s => {
        const ref = db.collection('suppliers').doc(s.id);
        batch.set(ref, { name: (s.name || '').trim() || 'Unknown', contact_name: (s.contactName || '').trim() || null, email: (s.email || '').trim() || null, phone: (s.phone || '').trim() || null, address: (s.address || '').trim() || null, payment_terms: (s.paymentTerms || '').trim() || null, created_at: s.createdAt || new Date().toISOString() });
      });
      await batch.commit();
    }
    // Insert new products
    const products = list.flatMap(s => (s.products || []).map(p => ({ id: p.id, supplier_id: s.id, name: p.name || null, part_no: p.partNo || null, description: p.description || null, brand: p.brand || null, unit: p.unit || 'pcs', unit_price: p.unitPrice != null ? p.unitPrice : null, price_date: p.priceDate || null })));
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = db.batch();
      products.slice(i, i + BATCH_SIZE).forEach(p => { const ref = db.collection('supplier_products').doc(p.id); batch.set(ref, p); });
      await batch.commit();
    }
    res.json({ saved: true, count: list.length });
  } catch (err) {
    console.error('Error saving suppliers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Supplier id required' });
  try {
    const productsSnap = await db.collection('supplier_products').where('supplier_id', '==', id).get();
    if (!productsSnap.empty) {
      const batch = db.batch();
      productsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection('suppliers').doc(id).delete();
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting supplier:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/supplier-products/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Product id required' });
  try {
    await db.collection('supplier_products').doc(id).delete();
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting supplier product:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== INVESTMENT TRACKER ==========
app.get('/api/investments', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const snap = await db.collection('investments').orderBy('date', 'asc').get();
    const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, investments: rows });
  } catch (err) {
    console.error('Error fetching investments:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/investments', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { date, investor, amount, category, description } = req.body || {};
  if (!date || !investor || !amount || !category) return res.status(400).json({ success: false, error: 'date, investor, amount, and category are required' });
  try {
    const now = new Date().toISOString();
    const ref = await db.collection('investments').add({ date, investor, amount: parseFloat(amount), category, description: description || '', created_at: now, updated_at: now });
    res.status(201).json({ success: true, id: ref.id });
  } catch (err) {
    console.error('Error creating investment:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/investments/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { date, investor, amount, category, description } = req.body || {};
  if (!date || !investor || !amount || !category) return res.status(400).json({ success: false, error: 'date, investor, amount, and category are required' });
  try {
    const ref = db.collection('investments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Investment not found' });
    await ref.update({ date, investor, amount: parseFloat(amount), category, description: description || '', updated_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating investment:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/investments/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const ref = db.collection('investments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Investment not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting investment:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/investments/target', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const doc = await db.collection('investment_config').doc('target').get();
    res.json({ success: true, target: doc.exists ? doc.data().target : 650000 });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/investments/target', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { target } = req.body;
  if (!target || isNaN(parseFloat(target))) return res.status(400).json({ success: false, error: 'Valid target amount required' });
  try {
    await db.collection('investment_config').doc('target').set({ target: parseFloat(target) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ========== PAYROLL ROUTES ==========
// Restricted to TJC and RJR usernames only.

const PAYROLL_USERS = ['TJC', 'RJR'];

async function requirePayrollAccess(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!PAYROLL_USERS.includes(user.username)) { res.status(403).json({ error: 'Payroll access restricted' }); return null; }
  return user;
}

// ── Employees ──────────────────────────────────────────────────────────────
app.get('/api/payroll/employees', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_employees').orderBy('name').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch employees' }); }
});

app.post('/api/payroll/employees', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const data = { ...req.body, createdAt: new Date().toISOString() };
    const ref = await db.collection('payroll_employees').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) { res.status(500).json({ error: 'Failed to create employee' }); }
});

app.put('/api/payroll/employees/:id', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const ref = db.collection('payroll_employees').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Employee not found' });
    await ref.update({ ...req.body, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update employee' }); }
});

// ── Payroll Runs ───────────────────────────────────────────────────────────
app.get('/api/payroll/runs', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch payroll runs' }); }
});

app.post('/api/payroll/runs', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const data = { ...req.body, status: 'DRAFT', createdBy: user.username, createdAt: new Date().toISOString() };
    const ref = await db.collection('payroll_runs').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) { res.status(500).json({ error: 'Failed to create payroll run' }); }
});

app.post('/api/payroll/runs/:id/approve', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const ref = db.collection('payroll_runs').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Run not found' });
    await ref.update({ status: 'APPROVED', approvedBy: user.username, approvedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to approve run' }); }
});

app.post('/api/payroll/runs/:id/pay', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const ref = db.collection('payroll_runs').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Run not found' });
    await ref.update({ status: 'PAID', paidAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to mark run as paid' }); }
});

// ── DTR Entries ────────────────────────────────────────────────────────────
app.get('/api/payroll/runs/:runId/dtr', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').doc(req.params.runId).collection('dtrEntries').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch DTR entries' }); }
});

app.post('/api/payroll/runs/:runId/dtr', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be an array' });
  try {
    const col = db.collection('payroll_runs').doc(req.params.runId).collection('dtrEntries');
    const batch = db.batch();
    entries.forEach(entry => {
      const ref = entry.id ? col.doc(entry.id) : col.doc();
      batch.set(ref, entry, { merge: true });
    });
    await batch.commit();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save DTR entries' }); }
});

// ── Payslips ───────────────────────────────────────────────────────────────
app.get('/api/payroll/runs/:runId/payslips', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').doc(req.params.runId).collection('payslips').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch payslips' }); }
});

app.post('/api/payroll/runs/:runId/payslips', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { payslips } = req.body;
  if (!Array.isArray(payslips)) return res.status(400).json({ error: 'payslips must be an array' });
  try {
    const col = db.collection('payroll_runs').doc(req.params.runId).collection('payslips');
    const batch = db.batch();
    payslips.forEach(slip => {
      const ref = slip.employeeId ? col.doc(slip.employeeId) : col.doc();
      batch.set(ref, slip, { merge: true });
    });
    await batch.commit();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save payslips' }); }
});

// ── Contribution Settings ──────────────────────────────────────────────────
app.get('/api/payroll/settings', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const doc = await db.collection('payroll_settings').doc('contribution_rates').get();
    res.json(doc.exists ? doc.data() : {});
  } catch (err) { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.put('/api/payroll/settings', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    await db.collection('payroll_settings').doc('contribution_rates').set({
      ...req.body,
      updatedBy: user.username,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save settings' }); }
});

// ── Holidays ───────────────────────────────────────────────────────────────
app.get('/api/payroll/holidays', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { year } = req.query;
  try {
    let q = db.collection('payroll_holidays');
    if (year) q = q.where('year', '==', parseInt(year));
    const snap = await q.orderBy('date').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch holidays' }); }
});

app.post('/api/payroll/holidays', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { date, name, type } = req.body;
  if (!date || !name || !type) return res.status(400).json({ error: 'date, name, type required' });
  try {
    const year = parseInt(date.split('-')[0]);
    const ref = await db.collection('payroll_holidays').add({ date, name, type, year, createdBy: user.username });
    res.status(201).json({ id: ref.id, date, name, type, year });
  } catch (err) { res.status(500).json({ error: 'Failed to add holiday' }); }
});

app.put('/api/payroll/holidays/:id', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const ref = db.collection('payroll_holidays').doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: 'Holiday not found' });
    await ref.update({ ...req.body, updatedBy: user.username });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update holiday' }); }
});

app.delete('/api/payroll/holidays/:id', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    await db.collection('payroll_holidays').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete holiday' }); }
});

app.post('/api/payroll/holidays/bulk', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { holidays, year } = req.body;
  if (!Array.isArray(holidays)) return res.status(400).json({ error: 'holidays must be an array' });
  try {
    // Delete existing for the year first to avoid duplicates
    const existing = await db.collection('payroll_holidays').where('year', '==', year).get();
    const batch = db.batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    holidays.forEach(h => {
      const ref = db.collection('payroll_holidays').doc();
      batch.set(ref, { ...h, year, createdBy: user.username });
    });
    await batch.commit();
    res.json({ success: true, count: holidays.length });
  } catch (err) { res.status(500).json({ error: 'Failed to bulk save holidays' }); }
});

// ========== CALCSHEET ==========
// Collections: calcsheet_projects, calcsheet_quotations, calcsheet_clients, calcsheet_presets

function parseProjectDateToUnix(date) {
  if (!date) return null;
  const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  const time = parsed.getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

function phYearMonth(dateLike) {
  const base = dateLike ? new Date(dateLike) : new Date();
  const time = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();
  // Project numbers follow Philippine business dates. Add UTC+8 then read UTC
  // fields to avoid host-machine timezone drift.
  const ph = new Date(time + 8 * 60 * 60 * 1000);
  const yy = String(ph.getUTCFullYear()).slice(-2);
  const mm = String(ph.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

async function nextIoctProjectNo(dateLike) {
  const yymm = phYearMonth(dateLike);
  const prefix = `IOCT${yymm}`;
  const snap = await db.collection('projects').select('project_no').get();
  let max = 0;
  for (const doc of snap.docs) {
    const raw = String(doc.data().project_no || '').trim().toUpperCase();
    const m = raw.match(new RegExp(`^${prefix}(\\d{3})(?:[A-Z])?$`));
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function numericRevision(q) {
  const n = parseInt(q.revision || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function newestQuotation(a, b) {
  const rev = numericRevision(b) - numericRevision(a);
  if (rev !== 0) return rev;
  return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
}

function quotationGrandTotal(q) {
  if (!q) return 0;
  if (q.legacyTotalsSnapshot && Number.isFinite(Number(q.legacyTotalsSnapshot.grandTotal))) {
    return Number(q.legacyTotalsSnapshot.grandTotal);
  }
  const generalReqtsQty = q.exportGeneralReqtsAsLot ? Math.max(1, Number(q.generalReqtsExportQty || 1)) : 1;
  const engineeringServicesQty = q.servicesFromManpower !== false ? Math.max(1, Number(q.engineeringServicesQty || 1)) : 1;
  const generalReqtsCost = (q.generalReqts || []).reduce((sum, line) => {
    return sum + Number(line.unitPrice || 0) * Number(line.qty || 0);
  }, 0);
  const generalReqtsSubtotal = generalReqtsCost * generalReqtsQty * (1 + Number(q.generalReqMarkupPct || 0) / 100);
  const componentsSubtotal = (q.components || []).reduce((sum, line) => {
    const base = Number(line.unitCost || 0) * Number(line.forex || 1);
    const adjusted = base * (1 + Number(line.contingencyPct || 0) / 100) * (1 - Number(line.discountPct || 0) / 100);
    return sum + adjusted * (1 + Number(q.productMarkupPct || 0) / 100) * Number(line.qty || 0);
  }, 0);
  const manpowerCost = (q.manpower || []).reduce((sum, row) => {
    return sum + Number(row.headcount || 0) * Number(row.mandays || 0) * (Number(row.dailyRate || 0) + Number(row.allowance || 0));
  }, 0);
  const servicesSubtotal = q.servicesFromManpower !== false
    ? manpowerCost * engineeringServicesQty
    : (q.services || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const subtotal = generalReqtsSubtotal + componentsSubtotal + servicesSubtotal;
  const afterDiscount = subtotal * (1 - Number(q.discountPct || 0) / 100);
  return afterDiscount * (1 + Number(q.vatPct || 0) / 100);
}

function clientApproverFromClient(client) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  const primary = contacts.find((c) => c.isPrimary) || contacts[0];
  return primary ? [primary.name, primary.position].filter(Boolean).join(' – ') : '';
}

function mapCalcsheetToMainProject(project, client, quotation, now, projectNo) {
  const projectDate = parseProjectDateToUnix(project.date) || Math.floor(Date.now() / 1000);
  const amount = quotationGrandTotal(quotation);
  const year = Number.isFinite(new Date(project.date || now).getFullYear())
    ? new Date(project.date || now).getFullYear()
    : new Date().getFullYear();
  const paymentTerms = quotation?.paymentTerms || client?.paymentTerms || '';
  return {
    project_no: projectNo || '',
    item_no: 0,
    year,
    am: client?.am || '',
    ovp_number: '',
    po_number: '',
    po_date: null,
    client_status: 'Won from Calcsheet',
    client_id: project.customerId || null,
    client_contact_id: quotation?.contactId || null,
    account_name: client?.name || '',
    project_name: project.name || '',
    project_category: 'Services',
    project_location: project.location || client?.address || '',
    scope_of_work: project.notes || '',
    qtn_no: project.code || '',
    ovp_category: '',
    contract_amount: amount,
    updated_contract_amount: amount,
    down_payment_percent: 0,
    retention_percent: 0,
    start_date: projectDate,
    duration_days: 90,
    completion_date: projectDate + (90 * 24 * 60 * 60),
    payment_schedule: '',
    payment_terms: paymentTerms,
    bonds_requirement: 'NO',
    project_director: '',
    client_approver: clientApproverFromClient(client),
    progress_billing_schedule: '',
    mobilization_date: null,
    updated_completion_date: null,
    project_status: 'Not Started',
    actual_site_progress_percent: 0,
    actual_progress: 0,
    evaluated_progress_percent: 0,
    evaluated_progress: 0,
    for_rfb_percent: 0,
    for_rfb_amount: 0,
    rfb_date: null,
    type_of_rfb: '',
    work_in_progress_ap: amount,
    work_in_progress_ep: amount,
    updated_contract_balance_percent: 1,
    total_contract_balance: amount,
    updated_contract_balance_net_percent: 1,
    updated_contract_balance_net: amount,
    remarks: `Created from Calcsheet ${project.code || ''}`.trim(),
    contract_billed_gross_percent: 0,
    contract_billed: 0,
    contract_billed_net_percent: 0,
    amount_contract_billed_net: 0,
    for_retention_billing_percent: 0,
    amount_for_retention_billing: 0,
    retention_status: '',
    unevaluated_progress: 0,
    calcsheet_project_id: project.id,
    calcsheet_code: project.code || '',
    calcsheet_quotation_id: quotation?.id || null,
    source_module: 'calcsheet',
    executionFolderId: project.executionFolderId || '',
    executionFolderUrl: project.executionFolderUrl || '',
  };
}

async function findLinkedMainProject(project) {
  if (project.mainProjectId) {
    const linked = await db.collection('projects').doc(String(project.mainProjectId)).get();
    if (linked.exists) return linked;
  }
  const byCalcsheetId = await db.collection('projects')
    .where('calcsheet_project_id', '==', project.id)
    .limit(1)
    .get();
  if (!byCalcsheetId.empty) return byCalcsheetId.docs[0];
  if (project.code) {
    const byCode = await db.collection('projects')
      .where('calcsheet_code', '==', project.code)
      .limit(1)
      .get();
    if (!byCode.empty) return byCode.docs[0];
  }
  return null;
}

async function syncCalcsheetProjectToMainProject(projectId, options = {}) {
  const now = new Date().toISOString();
  const projectRef = db.collection('calcsheet_projects').doc(projectId);
  const projectDoc = await projectRef.get();
  if (!projectDoc.exists) {
    const err = new Error('Calcsheet project not found');
    err.status = 404;
    throw err;
  }
  const project = { id: projectDoc.id, ...projectDoc.data() };
  const [clientDoc, qSnap] = await Promise.all([
    project.customerId ? db.collection('clients').doc(String(project.customerId)).get() : Promise.resolve(null),
    db.collection('calcsheet_quotations').where('projectId', '==', projectId).get(),
  ]);
  const client = clientDoc && clientDoc.exists ? { id: clientDoc.id, ...clientDoc.data() } : null;
  const quotations = qSnap.docs.map((d) => {
    const { id: _stored, ...data } = d.data();
    return { ...data, id: d.id };
  });
  const ioct = quotations.filter((q) => q.kind === 'IOCT').sort(newestQuotation)[0];
  const acti = quotations.filter((q) => q.kind === 'ACTI').sort(newestQuotation)[0];
  const selectedQuotation = ioct || acti;
  if (!selectedQuotation) {
    const err = new Error('No IOCT or ACTI quotation found to seed contract amount');
    err.status = 400;
    throw err;
  }

  const linkedDoc = await findLinkedMainProject(project);
  if (linkedDoc && !options.force) {
    const linkedData = linkedDoc.data() || {};
    await projectRef.update({
      mainProjectId: linkedDoc.id,
      mainProjectNo: linkedData.project_no || '',
      mainProjectLastSyncedAt: now,
      mainProjectSyncStatus: 'linked',
      mainProjectSyncError: '',
      mainProjectStatus: linkedData.project_status || '',
      mainProjectProgressPercent: Number(linkedData.actual_site_progress_percent || 0),
      mainProjectCompletionDate: linkedData.completion_date || null,
      mainProjectStatusSyncedAt: now,
    });
    return {
      action: 'linked-existing',
      mainProjectId: linkedDoc.id,
      projectNo: linkedData.project_no || '',
      quotationId: selectedQuotation.id,
      quotationKind: selectedQuotation.kind,
      amount: quotationGrandTotal(selectedQuotation),
    };
  }

  let mapped;
  let mainProjectId;
  let action;
  if (linkedDoc && options.force) {
    const linkedData = linkedDoc.data() || {};
    const projectNo = linkedData.project_no || await nextIoctProjectNo(now);
    mapped = mapCalcsheetToMainProject(project, client, selectedQuotation, now, projectNo);
    mainProjectId = linkedDoc.id;
    action = 'updated';
    await linkedDoc.ref.update({ ...mapped, updated_at: now });
  } else {
    const projectNo = await nextIoctProjectNo(now);
    mapped = mapCalcsheetToMainProject(project, client, selectedQuotation, now, projectNo);
    action = project.mainProjectId ? 'recreated' : 'created';
    const ref = await db.collection('projects').add({ ...mapped, created_at: now, updated_at: now });
    mainProjectId = ref.id;
  }

  await projectRef.update({
    mainProjectId,
    mainProjectNo: mapped.project_no || '',
    mainProjectLinkedAt: project.mainProjectLinkedAt || now,
    mainProjectLastSyncedAt: now,
    mainProjectSyncStatus: 'linked',
    mainProjectSyncError: '',
    mainProjectStatus: mapped.project_status || '',
    mainProjectProgressPercent: Number(mapped.actual_site_progress_percent || 0),
    mainProjectCompletionDate: mapped.completion_date || null,
    mainProjectStatusSyncedAt: now,
  });

  return {
    action,
    mainProjectId,
    projectNo: mapped.project_no || '',
    quotationId: selectedQuotation.id,
    quotationKind: selectedQuotation.kind,
    amount: quotationGrandTotal(selectedQuotation),
  };
}

// ── Projects ─────────────────────────────────────────────────────────────────

app.get('/api/calcsheet/projects', async (req, res) => {
  try {
    const snap = await db.collection('calcsheet_projects').orderBy('createdAt', 'desc').get();
    // Drop any stale stored `id` field; the Firestore doc.id is authoritative.
    // Without the explicit strip, `{ id: d.id, ...d.data() }` would let the spread
    // overwrite d.id with whatever stored.id holds — and broken docs from before
    // the POST fix have a wrong stored id, which would make the client target the
    // wrong document on subsequent updates/deletes.
    const projects = snap.docs.map((d) => {
      const { id: _stored, ...data } = d.data();
      return { ...data, id: d.id };
    });
    res.json({ success: true, projects });
  } catch (err) {
    console.error('[calcsheet] get projects failed:', err);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

app.post('/api/calcsheet/projects', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    // Strip any client-supplied `id` from the body — Firestore's auto-generated
    // ref.id is the canonical project ID. Without this strip, the `...data` spread
    // below would overwrite ref.id with the client's nanoid in the response,
    // leaving the client with an ID that doesn't address the stored document
    // (subsequent PUTs would 500 with "Failed to update project").
    const { id: _ignored, ...body } = req.body || {};
    const data = { ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const ref = await db.collection('calcsheet_projects').add(data);
    res.json({ success: true, project: { ...data, id: ref.id } });
  } catch (err) {
    console.error('[calcsheet] create project failed:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.put('/api/calcsheet/projects/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    // Defensively drop `id` from the update body — it's the doc identifier (from
    // the URL param) and storing it inside the document is just dead data that
    // can mask the real ID during debugging.
    const { id: _ignored, ...body } = req.body || {};
    const update = { ...body, updatedAt: new Date().toISOString() };
    await db.collection('calcsheet_projects').doc(req.params.id).update(update);
    res.json({ success: true });
  } catch (err) {
    console.error('[calcsheet] update project failed:', { id: req.params.id, err: err && err.message });
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.post('/api/calcsheet/projects/:id/link-existing', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const { mainProjectId } = req.body || {};
    if (!mainProjectId) return res.status(400).json({ error: 'mainProjectId is required' });
    const now = new Date().toISOString();
    const [calcsheetDoc, mainDoc] = await Promise.all([
      db.collection('calcsheet_projects').doc(req.params.id).get(),
      db.collection('projects').doc(String(mainProjectId)).get(),
    ]);
    if (!calcsheetDoc.exists) return res.status(404).json({ error: 'Calcsheet project not found' });
    if (!mainDoc.exists) return res.status(404).json({ error: 'Project List record not found' });
    const calcsheet = { id: calcsheetDoc.id, ...calcsheetDoc.data() };
    const mainData = mainDoc.data() || {};
    const qSnap = await db.collection('calcsheet_quotations').where('projectId', '==', req.params.id).get();
    const quotations = qSnap.docs.map((d) => { const { id: _stored, ...data } = d.data(); return { ...data, id: d.id }; });
    const ioct = quotations.filter((q) => q.kind === 'IOCT').sort(newestQuotation)[0];
    const acti = quotations.filter((q) => q.kind === 'ACTI').sort(newestQuotation)[0];
    const selectedQuotation = ioct || acti;
    await calcsheetDoc.ref.update({
      mainProjectId: mainDoc.id,
      mainProjectNo: mainData.project_no || '',
      mainProjectLinkedAt: calcsheet.mainProjectLinkedAt || now,
      mainProjectLastSyncedAt: now,
      mainProjectSyncStatus: 'linked',
      mainProjectSyncError: '',
      mainProjectStatus: mainData.project_status || '',
      mainProjectProgressPercent: Number(mainData.actual_site_progress_percent || 0),
      mainProjectCompletionDate: mainData.completion_date || null,
      mainProjectStatusSyncedAt: now,
    });
    const mainPatch = {
      calcsheet_project_id: req.params.id,
      calcsheet_code: calcsheet.code || '',
      source_module: 'calcsheet',
      updated_at: now,
      ...(selectedQuotation ? { calcsheet_quotation_id: selectedQuotation.id } : {}),
    };
    await mainDoc.ref.update(mainPatch);
    res.json({
      success: true,
      mainProjectId: mainDoc.id,
      projectNo: mainData.project_no || '',
      ...(selectedQuotation ? {
        quotationId: selectedQuotation.id,
        quotationKind: selectedQuotation.kind,
        amount: quotationGrandTotal(selectedQuotation),
      } : {}),
    });
  } catch (err) {
    console.error('[calcsheet] link-existing failed:', { id: req.params.id, err: err && err.message });
    res.status(500).json({ error: 'Failed to link to existing project' });
  }
});

app.post('/api/calcsheet/projects/:id/sync-main', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const result = await syncCalcsheetProjectToMainProject(req.params.id, { force: !!req.body?.force });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to sync Project List record';
    try {
      await db.collection('calcsheet_projects').doc(req.params.id).update({
        mainProjectSyncStatus: status === 404 ? 'missing' : 'error',
        mainProjectSyncError: message,
        mainProjectLastSyncedAt: new Date().toISOString(),
      });
    } catch (_) {
      // ignore secondary sync-status failure
    }
    console.error('[calcsheet] sync main project failed:', { id: req.params.id, err: message });
    res.status(status).json({ error: message });
  }
});

app.delete('/api/calcsheet/projects/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    await db.collection('calcsheet_projects').doc(req.params.id).delete();
    // Also delete all quotations for this project
    const qsnap = await db.collection('calcsheet_quotations').where('projectId', '==', req.params.id).get();
    await Promise.all(qsnap.docs.map((d) => d.ref.delete()));
    // And their version snapshots
    const vsnap = await db.collection('calcsheet_quotation_versions').where('projectId', '==', req.params.id).get();
    await Promise.all(vsnap.docs.map((d) => d.ref.delete()));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete project' }); }
});

// ── Quotations ────────────────────────────────────────────────────────────────

app.get('/api/calcsheet/quotations', async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = db.collection('calcsheet_quotations');
    if (projectId) query = query.where('projectId', '==', projectId);
    const snap = await query.orderBy('createdAt', 'desc').get();
    // Strip any stale stored `id` so the spread can't overwrite d.id. See the
    // identical fix applied to calcsheet_projects above for the full explanation.
    const quotations = snap.docs.map((d) => {
      const { id: _stored, ...data } = d.data();
      return { ...data, id: d.id };
    });
    res.json({ success: true, quotations });
  } catch (err) {
    console.error('[calcsheet] get quotations failed:', err);
    res.status(500).json({ error: 'Failed to get quotations' });
  }
});

app.post('/api/calcsheet/quotations', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const { id: _ignored, ...body } = req.body || {};
    const data = { ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const ref = await db.collection('calcsheet_quotations').add(data);
    res.json({ success: true, quotation: { ...data, id: ref.id } });
  } catch (err) {
    console.error('[calcsheet] create quotation failed:', err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

app.put('/api/calcsheet/quotations/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const { id: _ignored, ...body } = req.body || {};
    const update = { ...body, updatedAt: new Date().toISOString() };
    const ref = db.collection('calcsheet_quotations').doc(req.params.id);
    // Snapshot the pre-save state into calcsheet_quotation_versions so edits
    // can be looked back at later. Best-effort — a failed snapshot must never
    // block the save itself.
    try {
      const prev = await ref.get();
      if (prev.exists) {
        const { id: _stored, ...prevData } = prev.data();
        await db.collection('calcsheet_quotation_versions').add({
          quotationId: req.params.id,
          projectId: prevData.projectId || null,
          savedAt: new Date().toISOString(),
          savedBy: user.full_name || user.username || null,
          data: prevData,
        });
      }
    } catch (verErr) {
      console.warn('[calcsheet] version snapshot failed (non-blocking):', verErr && verErr.message);
    }
    await ref.update(update);
    res.json({ success: true });
  } catch (err) {
    console.error('[calcsheet] update quotation failed:', { id: req.params.id, err: err && err.message });
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

app.get('/api/calcsheet/quotations/:id/versions', async (req, res) => {
  try {
    // Single-field where + in-memory sort avoids needing a composite index.
    const snap = await db.collection('calcsheet_quotation_versions')
      .where('quotationId', '==', req.params.id)
      .get();
    const versions = snap.docs
      .map((d) => {
        const { id: _stored, ...data } = d.data();
        return { ...data, id: d.id };
      })
      .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
    res.json({ success: true, versions });
  } catch (err) {
    console.error('[calcsheet] get quotation versions failed:', { id: req.params.id, err: err && err.message });
    res.status(500).json({ error: 'Failed to get quotation versions' });
  }
});

app.delete('/api/calcsheet/quotations/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    await db.collection('calcsheet_quotations').doc(req.params.id).delete();
    // Remove version snapshots belonging to the deleted quotation.
    const vsnap = await db.collection('calcsheet_quotation_versions').where('quotationId', '==', req.params.id).get();
    await Promise.all(vsnap.docs.map((d) => d.ref.delete()));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete quotation' }); }
});

// ── Clients (calcsheet alias — now reads/writes the unified `clients` collection) ─

app.get('/api/calcsheet/clients', async (req, res) => {
  try {
    const snap = await db.collection('clients').orderBy('name').get();
    const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, clients });
  } catch (err) { res.status(500).json({ error: 'Failed to get clients' }); }
});

// POST/PUT/DELETE under /api/calcsheet/clients are deprecated. The calcsheet UI now
// uses /api/clients directly (see `ClientsPage.tsx` and `CalcsheetClients.tsx` redirect).
// Kept as 410 Gone responses to surface any lingering callers in the logs.
app.post('/api/calcsheet/clients', (req, res) => res.status(410).json({ error: 'Use POST /api/clients' }));
app.put('/api/calcsheet/clients/:id', (req, res) => res.status(410).json({ error: 'Use PUT /api/clients/:id' }));
app.delete('/api/calcsheet/clients/:id', (req, res) => res.status(410).json({ error: 'Use DELETE /api/clients/:id' }));

// ── Labor Presets ─────────────────────────────────────────────────────────────

app.get('/api/calcsheet/presets', async (req, res) => {
  try {
    const snap = await db.collection('calcsheet_presets').orderBy('group').get();
    const presets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, presets });
  } catch (err) { res.status(500).json({ error: 'Failed to get presets' }); }
});

app.post('/api/calcsheet/presets', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const ref = await db.collection('calcsheet_presets').add(req.body);
    res.json({ success: true, preset: { id: ref.id, ...req.body } });
  } catch (err) { res.status(500).json({ error: 'Failed to create preset' }); }
});

app.put('/api/calcsheet/presets/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    await db.collection('calcsheet_presets').doc(req.params.id).update(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update preset' }); }
});

app.delete('/api/calcsheet/presets/:id', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    await db.collection('calcsheet_presets').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete preset' }); }
});

// ── Calcsheet settings (default job titles, etc.) ────────────────────────────
app.get('/api/calcsheet/settings', async (req, res) => {
  try {
    const doc = await db.collection('calcsheet_meta').doc('settings').get();
    res.json({ success: true, settings: doc.exists ? doc.data() : {} });
  } catch (err) { res.status(500).json({ error: 'Failed to get settings' }); }
});

app.put('/api/calcsheet/settings', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    await db.collection('calcsheet_meta').doc('settings').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save settings' }); }
});

// ── Sequence counter (for quotation code generation) ─────────────────────────
// The next sequence is always derived from the actual project codes — never
// trust the `calcsheet_meta/seq` doc as the source of truth. Historical reason:
// legacy bulk imports (and manual code re-assignments) wrote codes directly to
// `calcsheet_projects` without updating the meta counter, so the counter drifted
// far behind the real data (e.g. counter at 7, actual max at 036). Computing
// from data on every request keeps the next number correct regardless of how
// codes get into the system.

// Helper: parse the 3-digit SEQ portion of PCS{YYMM}{SEQ}-{CLI}-{REV} codes
// across all calcsheet projects and return the next global sequence number.
async function computeNextProjectSeq() {
  const snap = await db.collection('calcsheet_projects').get();
  let max = 0;
  for (const d of snap.docs) {
    const code = (d.data() || {}).code || '';
    const m = String(code).match(/^PCS\d{4}(\d{3})-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

app.get('/api/calcsheet/seq', async (req, res) => {
  try {
    const next = await computeNextProjectSeq();
    res.json({ success: true, seq: next });
  } catch (err) {
    console.error('[calcsheet] get seq failed:', err);
    res.status(500).json({ error: 'Failed to get seq' });
  }
});

app.post('/api/calcsheet/seq/increment', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;

    // Use a Firestore transaction to atomically read-and-increment the sequence
    // counter, preventing race conditions when multiple users create projects
    // simultaneously. The meta doc is the source of truth; the data-scan
    // fallback bootstraps the counter if the doc doesn't exist yet.
    const metaRef = db.collection('calcsheet_meta').doc('seq');
    let next = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      if (snap.exists) {
        const current = (snap.data() || {}).value;
        next = (typeof current === 'number' && current > 0) ? current + 1 : 1;
      } else {
        // Bootstrap: scan all existing project codes to catch up
        next = await computeNextProjectSeq();
      }
      tx.set(metaRef, { value: next, updatedAt: new Date().toISOString() });
    });

    res.json({ success: true, seq: next });
  } catch (err) {
    console.error('[calcsheet] increment seq failed:', err);
    res.status(500).json({ error: 'Failed to increment seq' });
  }
});

// ── Legacy import (bulk-import historical calcsheets as formulaVersion='legacy') ─

app.post('/api/calcsheet/import/legacy', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const mode = (req.query.mode || 'skip').toString(); // 'skip' | 'overwrite'
    const { project, quotations, client } = req.body || {};
    if (!project || !project.code) {
      return res.status(400).json({ error: 'project.code is required' });
    }
    if (!Array.isArray(quotations)) {
      return res.status(400).json({ error: 'quotations[] is required' });
    }

    const now = new Date().toISOString();
    const warnings = [];

    // Optional: upsert a client matched by code into the unified `clients` collection.
    // The UI payload now sends the new schema: { code, name, address, paymentTerms, contacts: [...] }.
    let resolvedCustomerId = project.customerId || null;
    if (client && client.code) {
      const existing = await db.collection('clients').where('code', '==', client.code).limit(1).get();
      if (existing.empty) {
        // Normalize the contacts array (ensure ids, ensure one primary)
        const contacts = Array.isArray(client.contacts) ? client.contacts.map((c) => ({
          id: c.id || Math.random().toString(36).slice(2, 10),
          name: (c.name || '').trim(),
          position: c.position || '',
          email: c.email || '',
          phone: c.phone || '',
          gender: c.gender || '',
          isPrimary: !!c.isPrimary,
          notes: c.notes || '',
        })) : [];
        if (contacts.length > 0 && !contacts.some((c) => c.isPrimary)) contacts[0].isPrimary = true;
        const newClient = {
          code: (client.code || '').toUpperCase().slice(0, 4),
          name: (client.name || '').trim(),
          address: client.address || '',
          paymentTerms: client.paymentTerms || '',
          am: client.am || '',
          contacts,
          createdAt: now,
          updatedAt: now,
        };
        const ref = await db.collection('clients').add(newClient);
        resolvedCustomerId = ref.id;
        warnings.push(`Created new client ${client.code} (${client.name})`);
      } else {
        resolvedCustomerId = existing.docs[0].id;
      }
    }

    // Idempotency: look up existing project by code
    const projSnap = await db.collection('calcsheet_projects').where('code', '==', project.code).limit(1).get();
    let projectId = null;
    let action = '';

    if (!projSnap.empty) {
      if (mode === 'skip') {
        return res.status(409).json({
          error: `Project ${project.code} already exists. Re-run with mode=overwrite to replace.`,
          existingProjectId: projSnap.docs[0].id,
        });
      }
      // overwrite: delete existing project + its quotations, then recreate
      const oldId = projSnap.docs[0].id;
      const oldQs = await db.collection('calcsheet_quotations').where('projectId', '==', oldId).get();
      const delBatch = db.batch();
      oldQs.docs.forEach((d) => delBatch.delete(d.ref));
      delBatch.delete(projSnap.docs[0].ref);
      await delBatch.commit();
      action = 'overwritten';
    } else {
      action = 'created';
    }

    // Create project
    const projectData = {
      ...project,
      customerId: resolvedCustomerId,
      createdAt: now,
      updatedAt: now,
    };
    const projRef = await db.collection('calcsheet_projects').add(projectData);
    projectId = projRef.id;

    // Create quotations
    const createdQuotations = [];
    for (const q of quotations) {
      const data = {
        ...q,
        projectId,
        formulaVersion: 'legacy',
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection('calcsheet_quotations').add(data);
      createdQuotations.push({ id: ref.id, kind: q.kind, revision: q.revision });
    }

    // Audit log
    await db.collection('calcsheet_import_audit').add({
      action,
      mode,
      projectCode: project.code,
      projectId,
      sourceFile: (quotations[0] && quotations[0].importedFrom && quotations[0].importedFrom.sourceFile) || null,
      originalCode: (quotations[0] && quotations[0].importedFrom && quotations[0].importedFrom.originalCode) || null,
      quotationCount: createdQuotations.length,
      warnings,
      importedAt: now,
      importedBy: user.email || user.uid || null,
    });

    res.json({
      success: true,
      action,
      projectId,
      project: { id: projectId, ...projectData },
      quotations: createdQuotations,
      warnings,
    });
  } catch (err) {
    console.error('Legacy import error:', err);
    res.status(500).json({ error: 'Failed to import legacy calcsheet: ' + err.message });
  }
});

app.get('/api/calcsheet/import/audit', async (req, res) => {
  try {
    const snap = await db.collection('calcsheet_import_audit').orderBy('importedAt', 'desc').limit(100).get();
    const audit = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, audit });
  } catch (err) { res.status(500).json({ error: 'Failed to get audit log' }); }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: 'Firebase Firestore', timestamp: new Date().toISOString() });
});

// ========== STATIC FILES & SPA ROUTING ==========
// ========== INVOICE / COLLECTIONS ROUTES ==========

app.get('/api/invoices', async (req, res) => {
  const { project_id } = req.query;
  try {
    let query = db.collection('invoices').orderBy('invoice_date', 'desc');
    if (project_id) query = db.collection('invoices').where('project_id', '==', String(project_id)).orderBy('invoice_date', 'desc');
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ ...d.data(), id: d.id })));
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

app.post('/api/invoices', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.created_at = new Date().toISOString();
    data.updated_at = new Date().toISOString();
    const ref = await db.collection('invoices').add(data);
    res.json({ ...data, id: ref.id });
  } catch (err) {
    console.error('Error creating invoice:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.updated_at = new Date().toISOString();
    const ref = db.collection('invoices').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Invoice not found' });
    await ref.update(data);
    res.json({ message: 'Invoice updated' });
  } catch (err) {
    console.error('Error updating invoice:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const ref = db.collection('invoices').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Invoice not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting invoice:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// ========== SERVICE REPORTS ==========
app.get('/api/service-reports', async (req, res) => {
  const { project_id } = req.query;
  try {
    let query = db.collection('service_reports').orderBy('created_at', 'desc').limit(100);
    if (project_id) {
      query = db.collection('service_reports')
        .where('project_id', '==', String(project_id))
        .orderBy('created_at', 'desc')
        .limit(100);
    }
    const snap = await query.get();
    res.json(snap.docs.map(d => ({ ...d.data(), id: d.id })));
  } catch (err) {
    console.error('Error fetching service reports:', err);
    res.status(500).json({ error: 'Failed to fetch service reports' });
  }
});

app.post('/api/service-reports', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.created_at = data.created_at || new Date().toISOString();
    data.updated_at = new Date().toISOString();
    const ref = await db.collection('service_reports').add(data);
    res.json({ ...data, id: ref.id });
  } catch (err) {
    console.error('Error creating service report:', err);
    res.status(500).json({ error: 'Failed to create service report' });
  }
});

app.put('/api/service-reports/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.updated_at = new Date().toISOString();
    const ref = db.collection('service_reports').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Service report not found' });
    await ref.update(data);
    res.json({ ...doc.data(), ...data, id: ref.id });
  } catch (err) {
    console.error('Error updating service report:', err);
    res.status(500).json({ error: 'Failed to update service report' });
  }
});

app.delete('/api/service-reports/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const ref = db.collection('service_reports').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Service report not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting service report:', err);
    res.status(500).json({ error: 'Failed to delete service report' });
  }
});

// ─── DTR Entries ────────────────────────────────────────────────────────────
app.get('/api/dtr', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: 'employeeId query parameter required' });
  // Non-admin users can only query their own entries
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (!isAdmin && employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
  try {
    const snap = await db.collection('dtr_entries').where('employeeId', '==', employeeId).get();
    const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    res.json(entries);
  } catch (e) {
    console.error('GET /api/dtr error:', e);
    res.status(500).json({ error: 'Failed to fetch DTR entries' });
  }
});

app.post('/api/dtr', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { employeeId, entryDate, dayType, regularHours, overtimeHours, nightDiffHours, isAbsent, tardinessMinutes, remarks } = req.body;
  if (!employeeId || !entryDate || !dayType) return res.status(400).json({ error: 'employeeId, entryDate, and dayType are required' });
  // Non-admin users can only create entries for themselves
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (!isAdmin && employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
  // Duplicate check
  const existing = await db.collection('dtr_entries')
    .where('employeeId', '==', employeeId)
    .where('entryDate', '==', entryDate)
    .get();
  if (!existing.empty) return res.status(409).json({ error: `DTR entry already exists for ${entryDate}. Load and edit it instead.` });
  try {
    const entry = {
      employeeId,
      entryDate,
      dayType,
      regularHours: Number(regularHours) || 0,
      overtimeHours: Number(overtimeHours) || 0,
      nightDiffHours: Number(nightDiffHours) || 0,
      isAbsent: !!isAbsent,
      tardinessMinutes: Number(tardinessMinutes) || 0,
      remarks: remarks || '',
      submittedAt: new Date().toISOString(),
    };
    const ref = await db.collection('dtr_entries').add(entry);
    res.status(201).json({ ...entry, id: ref.id });
  } catch (e) {
    console.error('POST /api/dtr error:', e);
    res.status(500).json({ error: 'Failed to create DTR entry' });
  }
});

app.put('/api/dtr/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const docRef = db.collection('dtr_entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'DTR entry not found' });
    const data = doc.data();
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin && data.employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    const { employeeId, id: _id, ...updates } = req.body;
    updates.submittedAt = new Date().toISOString();
    await docRef.update(updates);
    const updated = await docRef.get();
    res.json({ ...updated.data(), id: updated.id });
  } catch (e) {
    console.error('PUT /api/dtr/:id error:', e);
    res.status(500).json({ error: 'Failed to update DTR entry' });
  }
});

app.delete('/api/dtr/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const docRef = db.collection('dtr_entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'DTR entry not found' });
    const data = doc.data();
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin && data.employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    await docRef.delete();
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/dtr/:id error:', e);
    res.status(500).json({ error: 'Failed to delete DTR entry' });
  }
});

// ========== STATIC FILES & SPA FALLBACK ==========
if (!process.env.K_SERVICE) {
  app.use(express.static(path.join(__dirname, 'build')));

  app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// ========== GLOBAL ERROR HANDLER ==========
// Must be defined after all routes. Returns JSON for all unhandled errors.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Database: Firebase Firestore');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Kill the process using it, e.g.:`);
      console.error(`  lsof -ti:${PORT} | xargs kill`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => process.exit(0));
  });
}

// Export app for Cloud Functions (no-op when run directly via node server.js)
module.exports = app;
