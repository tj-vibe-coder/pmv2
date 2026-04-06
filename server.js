require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  'https://pmv2-851ae.web.app',
  'https://pmv2-851ae.firebaseapp.com',
  'http://localhost:3000',
  // Add your Render Static Site URL here once created, e.g.:
  // 'https://pmv2-frontend.onrender.com',
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
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

console.log('Connected to Firebase Firestore');
createDefaultUsers();
startServer();

// Create default users on startup
async function createDefaultUsers() {
  const defaults = [
    { username: 'TJC', email: 'tyronejames.caballero@gmail.com', password: 'IOCT0201!', role: 'superadmin', full_name: 'Tyrone James Caballero', approved: 1 },
    { username: 'admin', email: 'admin@netpacific.com', password: 'admin123', role: 'admin', full_name: null, approved: 1 },
    { username: 'user', email: 'user@netpacific.com', password: 'user123', role: 'user', full_name: null, approved: 1 },
    { username: 'projects', email: 'projects@iocontroltech.com', password: 'IOCT0201!', role: 'admin', full_name: null, approved: 1 },
  ];
  for (const u of defaults) {
    try {
      const snap = await db.collection('users').where('username', '==', u.username).limit(1).get();
      if (snap.empty) {
        const passwordHash = Buffer.from(u.password).toString('base64');
        const now = Math.floor(Date.now() / 1000);
        await db.collection('users').add({ username: u.username, email: u.email, password_hash: passwordHash, role: u.role, approved: u.approved, full_name: u.full_name, designation: null, created_at: now, updated_at: now });
        console.log(`Default user created: ${u.username}`);
      } else if (u.username === 'TJC') {
        await snap.docs[0].ref.update({ full_name: 'Tyrone James Caballero' });
      }
    } catch (e) {
      console.error(`Error creating default user ${u.username}:`, e.message);
    }
  }
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

// ========== AUTH ROUTES ==========

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Username and password are required' });
  try {
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snap.empty) return res.json({ success: false, error: 'Invalid credentials' });
    const userDoc = snap.docs[0];
    const user = userDoc.data();
    const providedPasswordHash = Buffer.from(password).toString('base64');
    if (user.password_hash !== providedPasswordHash) return res.json({ success: false, error: 'Invalid credentials' });
    const approved = user.approved === 1 || user.approved === true;
    if (!approved && user.role !== 'superadmin') return res.json({ success: false, error: 'Account pending approval. Contact an administrator.' });
    const token = Buffer.from(`${userDoc.id}:${user.username}:${Date.now()}`).toString('base64');
    res.json({ success: true, user: { id: userDoc.id, username: user.username, email: user.email, role: user.role, approved: user.approved ? 1 : 0, full_name: user.full_name || null, designation: user.designation || null, created_at: user.created_at, updated_at: user.updated_at }, token });
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
    const ref = await db.collection('users').add({ username, email, password_hash: passwordHash, role, approved: 0, full_name: null, designation: null, created_at: createdAt, updated_at: createdAt });
    console.log(`New user registered: ${username} (${email}) with role: ${role} (pending approval)`);
    res.json({ success: true, message: 'Account created. You will be able to log in after an administrator approves your account.', user: { id: ref.id, username, email, role, approved: 0, created_at: createdAt } });
  } catch (err) {
    console.error('Error creating user:', err);
    res.json({ success: false, error: 'Failed to create user account' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.json({ success: false, error: 'Invalid token' });
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, role: user.role, approved: user.approved ? 1 : 0, full_name: user.full_name || null, designation: user.designation || null, created_at: user.created_at, updated_at: user.updated_at } });
});

// ========== USERS ROUTES ==========
const usersRouter = express.Router();

async function listAllUsers(req, res) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(doc => { const d = doc.data(); return { id: doc.id, username: d.username, email: d.email, full_name: d.full_name, designation: d.designation, role: d.role, approved: d.approved, created_at: d.created_at, updated_at: d.updated_at }; }).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}
app.get('/api/users', listAllUsers);
usersRouter.get('/', listAllUsers);

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
  const { full_name, designation, role, approved } = req.body;
  const updates = {};
  if (full_name !== undefined) updates.full_name = full_name == null ? null : String(full_name).trim();
  if (designation !== undefined) updates.designation = designation == null ? null : String(designation).trim();
  if (role !== undefined && ['superadmin', 'admin', 'user', 'viewer'].includes(role)) updates.role = role;
  if (approved !== undefined) updates.approved = approved ? 1 : 0;
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
  updates.updated_at = Math.floor(Date.now() / 1000);
  try {
    const ref = db.collection('users').doc(targetId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'User not found' });
    await ref.update(updates);
    res.json({ success: true, message: 'User updated' });
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
        projectData.account_name = c.client_name;
        projectData.client_approver = [c.contact_person, c.designation].filter(Boolean).join(' – ').trim() || projectData.client_approver || '';
      }
    }
    const now = new Date().toISOString();
    const ref = await db.collection('projects').add({ ...projectData, created_at: now, updated_at: now });
    res.status(201).json({ id: ref.id, message: 'Project created successfully' });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
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
        projectData.account_name = c.client_name;
        projectData.client_approver = [c.contact_person, c.designation].filter(Boolean).join(' – ').trim() || projectData.client_approver || '';
      }
    }
    projectData.updated_at = new Date().toISOString();
    const ref = db.collection('projects').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
    await ref.update(projectData);
    res.json({ message: 'Project updated successfully' });
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Failed to update project' });
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

// ========== CLIENTS ROUTES ==========
app.get('/api/clients', async (req, res) => {
  try {
    const snap = await db.collection('clients').orderBy('client_name').get();
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
  const { client_name, address, payment_terms, contact_person, designation, email_address } = req.body;
  if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'Client name is required' });
  try {
    const now = new Date().toISOString();
    const ref = await db.collection('clients').add({ client_name: client_name.trim(), address: address || '', payment_terms: payment_terms || '', contact_person: contact_person || '', designation: designation || '', email_address: email_address || '', created_at: now, updated_at: now });
    res.status(201).json({ id: ref.id, message: 'Client created successfully' });
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const { client_name, address, payment_terms, contact_person, designation, email_address } = req.body;
  if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'Client name is required' });
  const trimmedName = client_name.trim();
  try {
    const ref = db.collection('clients').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });
    const now = new Date().toISOString();
    await ref.update({ client_name: trimmedName, address: address || '', payment_terms: payment_terms || '', contact_person: contact_person || '', designation: designation || '', email_address: email_address || '', updated_at: now });
    const approver = [contact_person, designation].filter(Boolean).join(' – ').trim();
    const projectsSnap = await db.collection('projects').where('client_id', '==', id).get();
    if (!projectsSnap.empty) {
      const batch = db.batch();
      projectsSnap.docs.forEach(pDoc => batch.update(pDoc.ref, { account_name: trimmedName, client_approver: approver, updated_at: now }));
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
  let requestedAt = Math.floor(Date.now() / 1000);
  const dateRequested = req.body.date_requested;
  if (dateRequested && /^\d{4}-\d{2}-\d{2}$/.test(String(dateRequested).trim())) {
    requestedAt = Math.floor(new Date(dateRequested + 'T12:00:00').getTime() / 1000);
  }
  try {
    const ref = await db.collection('cash_advances').add({ user_id: user.id, amount, balance_remaining: 0, status: 'pending', purpose: null, breakdown: breakdown || null, project_id: projectId || null, requested_at: requestedAt, approved_at: null, approved_by: null, created_at: requestedAt, updated_at: requestedAt });
    res.status(201).json({ success: true, id: ref.id, message: 'Cash advance requested' });
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
  const { form_no, date_of_submission, employee_name, employee_number, rows_json, total_amount, status, ca_id } = req.body;
  const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
  const total = parseFloat(total_amount) || 0;
  const now = Math.floor(Date.now() / 1000);
  const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
  const caId = ca_id ? String(ca_id) : null;
  try {
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
    }
    const ref = await db.collection('liquidations').add({ user_id: user.id, form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), total_amount: total, ca_id: caId, status: liqStatus, created_at: now, updated_at: now });
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
    const { form_no, date_of_submission, employee_name, employee_number, rows_json, total_amount, status, ca_id } = req.body;
    const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
    const total = parseFloat(total_amount) || 0;
    const now = Math.floor(Date.now() / 1000);
    const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
    const caId = ca_id ? String(ca_id) : null;
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
    }
    await ref.update({ form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), total_amount: total, ca_id: caId, status: liqStatus, updated_at: now });
    if (liqStatus === 'submitted' && caId) {
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(-total), updated_at: now });
    }
    res.json({ success: true, message: liqStatus === 'submitted' ? 'Liquidation submitted' : 'Draft updated' });
  } catch (err) {
    console.error('Error updating liquidation:', err);
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
  const { date, investor, amount, category, description } = req.body;
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
  const { date, investor, amount, category, description } = req.body;
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

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: 'Firebase Firestore', timestamp: new Date().toISOString() });
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
