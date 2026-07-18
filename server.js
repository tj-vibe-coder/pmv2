require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

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
    // Dev only: allow private-LAN origins so you can test from a phone/other device on the same network.
    if (process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+):\d+$/.test(origin)) {
      return callback(null, true);
    }
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
    // Scanner (QR-paired) sessions use 'scan_'-prefixed tokens. Standard base64
    // login tokens never contain '_', so this prefix is unambiguous.
    if (token.startsWith('scan_')) {
      const sessSnap = await db.collection('scanner_sessions').doc(token).get();
      if (!sessSnap.exists) return null;
      const sess = sessSnap.data();
      if (!sess || Date.now() > sess.expiresAt) return null;
      const su = await db.collection('users').doc(sess.userId).get();
      if (!su.exists) return null;
      return { id: su.id, ...su.data(), scannerScope: true };
    }
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

// ========== MICROSOFT GRAPH APP-ONLY (CLIENT CREDENTIALS) HELPER ==========
// Server-side OneDrive/Graph access using app-only auth (no signed-in user).
// Used by the receipt-scanning feature to read the corporate proposal drive.
let graphTokenCache = null; // { token, expiresAt }

async function getGraphAppToken() {
  if (graphTokenCache && Date.now() < graphTokenCache.expiresAt) {
    return graphTokenCache.token;
  }
  const tenantId = process.env.ONEDRIVE_TENANT_ID;
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  const driveOwner = process.env.ONEDRIVE_DRIVE_OWNER;
  if (!tenantId) throw new Error('OneDrive not configured: ONEDRIVE_TENANT_ID');
  if (!clientId) throw new Error('OneDrive not configured: ONEDRIVE_CLIENT_ID');
  if (!clientSecret) throw new Error('OneDrive not configured: ONEDRIVE_CLIENT_SECRET');
  if (!driveOwner) throw new Error('OneDrive not configured: ONEDRIVE_DRIVE_OWNER');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Graph token error: ' + text);
  }
  const json = await resp.json();
  graphTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return graphTokenCache.token;
}

async function resolveCorporateDriveId(token) {
  const owner = process.env.ONEDRIVE_DRIVE_OWNER;
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(owner)}/drive`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text);
  }
  const body = await resp.json();
  return body.id;
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

// Superadmin-only direct create — unlike /api/auth/register (self-service,
// role limited to user/viewer, always starts unapproved), this can set any
// role and is approved=1 immediately so the account is usable right away.
usersRouter.post('/', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { username, email, password, full_name, designation, contact_number, role = 'user', approved = 1 } = req.body;
  const nextUsername = String(username || '').trim();
  const nextEmail = String(email || '').trim();
  const nextPassword = String(password || '');
  if (!nextUsername) return res.status(400).json({ success: false, error: 'Username is required' });
  if (!nextEmail) return res.status(400).json({ success: false, error: 'Email is required' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(nextEmail)) return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
  if (nextPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
  if (!['superadmin', 'admin', 'user', 'viewer', 'tax_filer'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role specified' });
  try {
    const [uSnap, eSnap] = await Promise.all([
      db.collection('users').where('username', '==', nextUsername).limit(1).get(),
      db.collection('users').where('email', '==', nextEmail).limit(1).get(),
    ]);
    if (!uSnap.empty) return res.status(409).json({ success: false, error: 'Username already exists' });
    if (!eSnap.empty) return res.status(409).json({ success: false, error: 'Email already exists' });
    const passwordHash = Buffer.from(nextPassword).toString('base64');
    const now = Math.floor(Date.now() / 1000);
    const ref = await db.collection('users').add({
      username: nextUsername,
      email: nextEmail,
      password_hash: passwordHash,
      role,
      approved: approved ? 1 : 0,
      full_name: full_name ? String(full_name).trim() : null,
      designation: designation ? String(designation).trim() : null,
      contact_number: contact_number ? String(contact_number).trim() : null,
      created_at: now,
      updated_at: now,
    });
    console.log(`User ${nextUsername} created by superadmin ${user.username} with role: ${role}`);
    const doc = await ref.get();
    res.status(201).json({ success: true, message: 'User created', user: userResponse(doc.id, doc.data()) });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

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
  if (role !== undefined && ['superadmin', 'admin', 'user', 'viewer', 'tax_filer'].includes(role)) updates.role = role;
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
            with_acti: project.with_acti || false, partner_id: project.partner_id || null, partner_name: project.partner_name || '',
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

// ========== PROJECT EXPENSES ==========
// Firestore collection: project_expenses
// Fields: projectId, projectName, description, amount, date (YYYY-MM-DD),
//   category, createdAt (ISO), createdBy (userId), sourceType
//   (manual|liquidation_sync|po_sync|migrated), + optional source FK fields.

app.get('/api/project-expenses/summary', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { year } = req.query;
    const snap = await db.collection('project_expenses').get();
    let rows = snap.docs.map(doc => doc.data());
    if (year) rows = rows.filter(r => r.date && String(r.date).startsWith(String(year)));
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    res.json({ success: true, total, count: rows.length, year: year || 'all' });
  } catch (err) {
    console.error('Error fetching project_expenses summary:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/project-expenses', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const { projectId, year, sourceType } = req.query;
    let query = db.collection('project_expenses');
    if (projectId) query = query.where('projectId', '==', String(projectId));
    if (sourceType) query = query.where('sourceType', '==', String(sourceType));
    const snap = await query.get();
    let rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Non-admins normally see only the project_expenses they created. System-generated sync rows
    // (PO/liquidation/migrated) have no natural per-user owner, so expose them to every finance user —
    // otherwise the per-project Expense Monitoring list would hide costs (e.g. synced PO items or
    // liquidation rows) the company P&L still counts, producing a confusing reconciliation gap.
    // In-memory filter only, so no Firestore composite index is needed. tax_filer is exempted
    // entirely — the Tax Filer Ledger needs full company expense visibility for BIR substantiation;
    // it's a read-only role (write access stays admin/owner-gated separately in the PATCH handler).
    if (!isAdmin && user.role !== 'tax_filer') {
      const SYNC_SOURCE_TYPES = new Set(['po_sync', 'liquidation_sync', 'migrated']);
      rows = rows.filter(r => r.createdBy === user.id || SYNC_SOURCE_TYPES.has(r.sourceType));
    }
    if (year) rows = rows.filter(r => r.date && String(r.date).startsWith(String(year)));
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ success: true, expenses: rows });
  } catch (err) {
    console.error('Error fetching project_expenses:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/project-expenses/migrate-from-localstorage', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const { expenses } = req.body;
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ success: false, error: 'expenses array required' });
    }
    // Dedup: load all existing migratedId values to avoid double-migration
    const existingSnap = await db.collection('project_expenses')
      .where('sourceType', '==', 'migrated').select('migratedId').get();
    const seenIds = new Set(existingSnap.docs.map(d => d.data().migratedId).filter(Boolean));
    const now = new Date().toISOString();
    // Firestore batch limit is 500; chunk if needed
    const toInsert = expenses.filter(e => e.id && e.projectId && e.amount && !seenIds.has(e.id));
    let inserted = 0;
    const skipped = expenses.length - toInsert.length;
    for (let i = 0; i < toInsert.length; i += 499) {
      const chunk = toInsert.slice(i, i + 499);
      const batch = db.batch();
      for (const exp of chunk) {
        const ref = db.collection('project_expenses').doc();
        const doc = {
          projectId: String(exp.projectId),
          projectName: exp.projectName || '',
          description: exp.description || '',
          amount: Number(exp.amount),
          date: exp.date || now.slice(0, 10),
          category: exp.category || 'Others',
          createdAt: exp.createdAt || now,
          createdBy: user.id,
          sourceType: 'migrated',
          migratedId: exp.id,
        };
        if (exp.sourcePoId) doc.sourcePoId = exp.sourcePoId;
        if (exp.sourcePoItemId) doc.sourcePoItemId = exp.sourcePoItemId;
        if (exp.sourceLiquidationId) doc.sourceLiquidationId = exp.sourceLiquidationId;
        if (exp.sourceLiquidationRowId) doc.sourceLiquidationRowId = exp.sourceLiquidationRowId;
        batch.set(ref, doc);
      }
      await batch.commit();
      inserted += chunk.length;
    }
    res.json({ success: true, inserted, skipped, total: expenses.length });
  } catch (err) {
    console.error('Error migrating project_expenses:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// Funding-source -> investments sync (best-effort, deterministic-id upsert).
// When an expense is paid directly out of an investor's pocket instead of the
// corporate bank account, mirror it into a LINKED investments row so it does
// not have to be re-keyed by hand and cannot be double-counted. Same idiom as
// the payroll_sync_* overhead sync: a deterministic doc id keyed on the source
// expense, upsert on out-of-pocket, delete otherwise. Never throws to caller.
// ---------------------------------------------------------------------------
function normalizeFundingSource(fs) {
  if (!fs || typeof fs !== 'object') return null;
  const type = fs.type === 'investor_outofpocket' ? 'investor_outofpocket' : 'corporate_bank';
  const out = { type };
  if (type === 'investor_outofpocket' && typeof fs.investor === 'string' && fs.investor.trim()) {
    out.investor = fs.investor.trim();
    if (typeof fs.linkedInvestmentId === 'string' && fs.linkedInvestmentId.trim()) {
      out.linkedInvestmentId = fs.linkedInvestmentId.trim();
    }
  }
  return out;
}

// project_expenses keys the project ref as `projectId`; cash_advances (a plain Firestore
// doc predating the camelCase convention) keys it as `project_id`. Everything else (overhead,
// payroll) has no project of its own.
function projectIdForFundingDoc(collection, doc) {
  if (collection === 'project_expenses') return doc.projectId || null;
  if (collection === 'cash_advances') return doc.project_id || null;
  if (collection === 'reimbursements') return doc.projectId || null;
  return null;
}

function investmentCategoryForFundingDoc(collection) {
  if (collection === 'project_expenses') return 'Project Expense';
  if (collection === 'cash_advances') return 'Cash Advance';
  if (collection === 'reimbursements') return 'Reimbursement';
  return 'Overhead';
}

function newOneOffInvestmentDoc(collection, id, doc, fs) {
  return {
    date: doc.date,
    investor: fs.investor.trim(),
    amount: Number(doc.amount) || 0,
    category: investmentCategoryForFundingDoc(collection),
    description: `Out-of-pocket: ${doc.description || doc.purpose || doc.category || ''}`,
    sourceType: 'expense_sync',
    sourceExpenseId: id,
    sourceCollection: collection,
    sourceExpenseProjectId: projectIdForFundingDoc(collection, doc),
    // Anchor to the expense's own createdAt (stable across edits, no extra read)
    // rather than re-stamping "now" on every upsert.
    created_at: doc.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Returns true on success (including a deliberate no-op), false if the sync itself threw —
// callers whose whole purpose is "make sure this is linked" (the funding-retrofit endpoint)
// should surface a warning rather than silently reporting success when this comes back false.
async function syncExpenseFundingInvestment(id, collection, doc) {
  const invRef = db.collection('investments').doc(`expense_sync_${id}`);
  try {
    const fs = doc && doc.fundingSource;
    const isOutOfPocket = fs && fs.type === 'investor_outofpocket' && typeof fs.investor === 'string' && fs.investor.trim();
    const linkedId = isOutOfPocket && typeof fs.linkedInvestmentId === 'string' && fs.linkedInvestmentId.trim()
      ? fs.linkedInvestmentId.trim() : null;

    // Clear the back-reference off any investment row this expense used to point at, if it no
    // longer does (funding source edited away/removed/re-linked elsewhere). Both fields are
    // plain equality filters, so this is served by automatic single-field indexes (no composite
    // index needed) — same idiom as the project_expenses equality-only queries elsewhere.
    const staleLinked = await db.collection('investments')
      .where('linkedExpenseId', '==', id)
      .where('linkedExpenseCollection', '==', collection)
      .get();
    await Promise.all(staleLinked.docs
      .filter(d => d.id !== linkedId)
      .map(d => d.ref.update({
        linkedExpenseId: FieldValue.delete(),
        linkedExpenseCollection: FieldValue.delete(),
        linkedExpenseProjectId: FieldValue.delete(),
      })));

    if (linkedId) {
      // Linked to an EXISTING investments row (e.g. a lump-sum capital contribution) instead
      // of a one-off auto-created one. Those rows are usually pencil-booked before the real
      // receipt exists — no firm date/description — so once an actual expense is linked back,
      // treat the expense as authoritative for date/description and store the back-reference
      // so the ledger can link to the source expense. Still clean up any stale auto-created
      // row from a prior state (e.g. the expense used to be a standalone out-of-pocket entry).
      const linkedRef = db.collection('investments').doc(linkedId);
      const linkedSnap = await linkedRef.get();
      // Guard against linking to a row that belongs to a DIFFERENT investor than the one on
      // this fundingSource — a mismatched linkedInvestmentId (stale UI state, hand-crafted API
      // call, copy-paste error) must not silently misattribute someone else's capital
      // contribution. Fall back to a fresh one-off row for the correct investor instead.
      if (linkedSnap.exists && linkedSnap.data().investor === fs.investor.trim()) {
        await invRef.delete();
        await linkedRef.update({
          date: doc.date,
          description: doc.description || doc.purpose || linkedSnap.data().description || '',
          linkedExpenseId: id,
          linkedExpenseCollection: collection,
          linkedExpenseProjectId: projectIdForFundingDoc(collection, doc),
          updated_at: new Date().toISOString(),
        });
      } else {
        if (linkedSnap.exists) {
          console.warn(`syncExpenseFundingInvestment: linkedInvestmentId ${linkedId} belongs to investor "${linkedSnap.data().investor}", not "${fs.investor.trim()}" — ignoring the link and creating a new entry for ${collection}/${id}`);
        }
        await invRef.set(newOneOffInvestmentDoc(collection, id, doc, fs));
      }
    } else if (isOutOfPocket) {
      await invRef.set(newOneOffInvestmentDoc(collection, id, doc, fs));
    } else {
      // Not out-of-pocket (or cleared) — remove any previously-linked row.
      // Deleting a non-existent doc is a safe no-op in Firestore.
      await invRef.delete();
    }
    return true;
  } catch (syncErr) {
    console.error('Expense funding investment sync failed for', collection, id, syncErr);
    return false;
  }
}

app.post('/api/project-expenses', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const body = req.body;
    const now = new Date().toISOString();
    // Batch insert: body.expenses is an array
    if (Array.isArray(body.expenses)) {
      let toInsert = body.expenses.filter(e => e.projectId && e.amount);
      if (toInsert.length === 0) return res.status(400).json({ success: false, error: 'No valid expenses in array' });
      // Server-side dedup: prevent duplicate rows when re-syncing POs or liquidations
      const syncKey = (e) => {
        if (e.sourcePoId && e.sourcePoItemId) return `po:${e.sourcePoId}:${e.sourcePoItemId}`;
        if (e.sourcePoId) return `po:${e.sourcePoId}`;
        if (e.sourceLiquidationId && e.sourceLiquidationRowId) return `liq:${e.sourceLiquidationId}:${e.sourceLiquidationRowId}`;
        return null;
      };
      const hasPoRows = toInsert.some(e => e.sourcePoId);
      const hasLiqRows = toInsert.some(e => e.sourceLiquidationId);
      if (hasPoRows || hasLiqRows) {
        const existingKeys = new Set();
        const fetchPromises = [];
        // Scope dedup scans to only the projectId(s) in this batch — a duplicate
        // of a PO item / liquidation row always carries the same projectId as the
        // original, so this is exact, and avoids an unbounded full-collection scan.
        const poProjectIds = [...new Set(toInsert.filter(e => e.sourcePoId).map(e => String(e.projectId)))];
        const liqProjectIds = [...new Set(toInsert.filter(e => e.sourceLiquidationId).map(e => String(e.projectId)))];
        for (const pid of poProjectIds) {
          fetchPromises.push(
            db.collection('project_expenses')
              .where('sourceType', '==', 'po_sync')
              .where('projectId', '==', pid).get()
              .then(snap => snap.docs.forEach(d => { const k = syncKey(d.data()); if (k) existingKeys.add(k); }))
          );
        }
        for (const pid of liqProjectIds) {
          fetchPromises.push(
            db.collection('project_expenses')
              .where('sourceType', '==', 'liquidation_sync')
              .where('projectId', '==', pid).get()
              .then(snap => snap.docs.forEach(d => { const k = syncKey(d.data()); if (k) existingKeys.add(k); }))
          );
        }
        await Promise.all(fetchPromises);
        toInsert = toInsert.filter(e => {
          const k = syncKey(e);
          return !k || !existingKeys.has(k);
        });
        if (toInsert.length === 0) {
          return res.status(200).json({ success: true, count: 0, expenses: [], message: 'All expenses already synced' });
        }
      }
      const inserted = [];
      for (let i = 0; i < toInsert.length; i += 499) {
        const chunk = toInsert.slice(i, i + 499);
        const batch = db.batch();
        for (const exp of chunk) {
          const ref = db.collection('project_expenses').doc();
          const doc = {
            projectId: String(exp.projectId),
            projectName: exp.projectName || '',
            description: exp.description || '',
            amount: Number(exp.amount),
            date: exp.date || now.slice(0, 10),
            category: exp.category || 'Others',
            createdAt: exp.createdAt || now,
            createdBy: user.id,
            sourceType: exp.sourceType || 'manual',
          };
          if (exp.sourcePoId) doc.sourcePoId = exp.sourcePoId;
          if (exp.sourcePoItemId) doc.sourcePoItemId = exp.sourcePoItemId;
          if (exp.sourceLiquidationId) doc.sourceLiquidationId = exp.sourceLiquidationId;
          if (exp.sourceLiquidationRowId) doc.sourceLiquidationRowId = exp.sourceLiquidationRowId;
          if (exp.liquidationFiledBy) doc.liquidationFiledBy = String(exp.liquidationFiledBy);
          if (exp.liquidationFiledAt) doc.liquidationFiledAt = String(exp.liquidationFiledAt);
          if (exp.sourceCaId) doc.sourceCaId = exp.sourceCaId;
          if (exp.remarks) doc.remarks = String(exp.remarks);
          if (exp.receiptRef) doc.receiptRef = exp.receiptRef;
          // BIR substantiation passthrough — mirrors the single-insert path so
          // liquidation/PO-synced rows carry supplier/invoice detail into the tax ledger.
          if (exp.supplier) doc.supplier = String(exp.supplier);
          if (exp.invoiceNo) doc.invoiceNo = String(exp.invoiceNo);
          if (exp.invoiceType) doc.invoiceType = String(exp.invoiceType);
          if (exp.tin) doc.tin = String(exp.tin);
          if (exp.imageHash) doc.imageHash = String(exp.imageHash);
          if (exp.vat != null && Number.isFinite(Number(exp.vat))) doc.vat = Number(exp.vat);
          if (typeof exp.deductible === 'boolean') doc.deductible = exp.deductible;
          if (exp.deductibleReason) doc.deductibleReason = String(exp.deductibleReason);
          const fundingSource = normalizeFundingSource(exp.fundingSource);
          if (fundingSource) doc.fundingSource = fundingSource;
          batch.set(ref, doc);
          inserted.push({ id: ref.id, ...doc });
        }
        await batch.commit();
      }
      // Best-effort: keep linked out-of-pocket investment rows in sync. Only the
      // rows that actually carry an investor_outofpocket funding source need a
      // write — skip the rest so a large legacy-import batch doesn't issue a
      // no-op delete() per plain row.
      const outOfPocketInserted = inserted.filter(exp => exp.fundingSource && exp.fundingSource.type === 'investor_outofpocket');
      await Promise.all(outOfPocketInserted.map(exp => syncExpenseFundingInvestment(exp.id, 'project_expenses', exp)));
      return res.status(201).json({ success: true, count: inserted.length, expenses: inserted });
    }
    // Single insert
    const { projectId, projectName, description, remarks, amount, date, category, sourceType,
            sourcePoId, sourcePoItemId, sourceLiquidationId, sourceLiquidationRowId, liquidationFiledBy, liquidationFiledAt, sourceCaId, receiptRef,
            supplier, invoiceNo, invoiceType, vat, tin, imageHash, deductible, deductibleReason, fundingSource } = body;
    if (!projectId || !amount) {
      return res.status(400).json({ success: false, error: 'projectId and amount are required' });
    }
    const doc = {
      projectId: String(projectId),
      projectName: projectName || '',
      description: description || '',
      amount: Number(amount),
      date: date || now.slice(0, 10),
      category: category || 'Others',
      createdAt: now,
      createdBy: user.id,
      sourceType: sourceType || 'manual',
    };
    if (sourcePoId) doc.sourcePoId = sourcePoId;
    if (sourcePoItemId) doc.sourcePoItemId = sourcePoItemId;
    if (sourceLiquidationId) doc.sourceLiquidationId = sourceLiquidationId;
    if (sourceLiquidationRowId) doc.sourceLiquidationRowId = sourceLiquidationRowId;
    if (liquidationFiledBy) doc.liquidationFiledBy = String(liquidationFiledBy);
    if (liquidationFiledAt) doc.liquidationFiledAt = String(liquidationFiledAt);
    if (sourceCaId) doc.sourceCaId = sourceCaId;
    if (remarks) doc.remarks = String(remarks);
    if (receiptRef) doc.receiptRef = receiptRef;
    if (supplier) doc.supplier = String(supplier);
    if (invoiceNo) doc.invoiceNo = String(invoiceNo);
    if (invoiceType) doc.invoiceType = String(invoiceType);
    if (tin) doc.tin = String(tin);
    if (imageHash) doc.imageHash = String(imageHash);
    if (vat != null && Number.isFinite(Number(vat))) doc.vat = Number(vat);
    if (typeof deductible === 'boolean') doc.deductible = deductible;
    if (deductibleReason) doc.deductibleReason = String(deductibleReason);
    const normalizedFunding = normalizeFundingSource(fundingSource);
    if (normalizedFunding) doc.fundingSource = normalizedFunding;
    const ref = await db.collection('project_expenses').add(doc);
    if (doc.fundingSource) await syncExpenseFundingInvestment(ref.id, 'project_expenses', doc);
    res.status(201).json({ success: true, expense: { id: ref.id, ...doc } });
  } catch (err) {
    console.error('Error creating project_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/project-expenses/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('project_expenses').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!isAdmin && doc.data().createdBy !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await ref.delete();
    await syncExpenseFundingInvestment(req.params.id, 'project_expenses', {});
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting project_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.patch('/api/project-expenses/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('project_expenses').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!isAdmin && snap.data().createdBy !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const allowed = {};
    const { description, remarks, amount, date, category, receiptRef, supplier, invoiceNo, invoiceType, vat, tin, imageHash, deductible, deductibleReason, fundingSource } = req.body;
    if (description !== undefined) allowed.description = String(description);
    if (remarks !== undefined) allowed.remarks = String(remarks);
    if (amount !== undefined) allowed.amount = Number(amount);
    if (date !== undefined) allowed.date = String(date);
    if (category !== undefined) allowed.category = String(category);
    if (receiptRef !== undefined) allowed.receiptRef = receiptRef;
    if (supplier !== undefined) allowed.supplier = String(supplier);
    if (invoiceNo !== undefined) allowed.invoiceNo = String(invoiceNo);
    if (invoiceType !== undefined) allowed.invoiceType = String(invoiceType);
    if (vat !== undefined && Number.isFinite(Number(vat))) allowed.vat = Number(vat);
    if (tin !== undefined) allowed.tin = String(tin);
    if (imageHash !== undefined) allowed.imageHash = imageHash == null ? null : String(imageHash);
    if (typeof deductible === 'boolean') allowed.deductible = deductible;
    else if (deductible === null) allowed.deductible = null;
    if (deductibleReason !== undefined) allowed.deductibleReason = deductibleReason == null ? null : String(deductibleReason);
    if (fundingSource !== undefined) {
      const nf = normalizeFundingSource(fundingSource);
      allowed.fundingSource = (nf && nf.type === 'investor_outofpocket') ? nf : FieldValue.delete();
    }
    if (Object.keys(allowed).length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    allowed.updatedAt = new Date().toISOString();
    await ref.update(allowed);
    const updated = await ref.get();
    // Sync unconditionally: catches an amount/date change on an already out-of-pocket expense too.
    await syncExpenseFundingInvestment(updated.id, 'project_expenses', updated.data());
    res.json({ success: true, expense: { id: updated.id, ...updated.data() } });
  } catch (err) {
    console.error('Error updating project_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Backfill receiptRef / liquidationFiledBy / liquidationFiledAt onto pre-existing
// liquidation_sync project_expenses that were synced before these fields were
// carried over (older filings created prior to those passthroughs). Idempotent —
// safe to call repeatedly; only touches docs currently missing one of the fields.
// Matches by sourceLiquidationId (+ sourceLiquidationRowId for the receipt)
// against the liquidation's persisted employee_name / date_of_submission / receipts_json.
app.post('/api/project-expenses/backfill-liquidation-receipts', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const expSnap = await db.collection('project_expenses')
      .where('sourceType', '==', 'liquidation_sync')
      .get();
    const candidates = expSnap.docs.filter(d => {
      const data = d.data();
      if (!data.sourceLiquidationId) return false;
      return !data.receiptRef || !data.liquidationFiledBy || !data.liquidationFiledAt;
    });
    if (candidates.length === 0) return res.json({ success: true, count: 0 });
    const liqIds = [...new Set(candidates.map(d => String(d.data().sourceLiquidationId)))];
    const liqDocs = await Promise.all(liqIds.map(id => db.collection('liquidations').doc(id).get()));
    const receiptsByLiqId = new Map();
    const liqInfoById = new Map();
    liqDocs.forEach(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      const receipts = parseLiqRows(data.receipts_json);
      const byRow = new Map();
      receipts.forEach(r => { if (r && r.rowId && r.oneDriveId && r.webUrl && !byRow.has(r.rowId)) byRow.set(r.rowId, { oneDriveId: r.oneDriveId, webUrl: r.webUrl, filename: r.filename || 'receipt' }); });
      receiptsByLiqId.set(snap.id, byRow);
      liqInfoById.set(snap.id, { employee_name: data.employee_name || null, date_of_submission: data.date_of_submission || null });
    });
    let count = 0;
    const batch = db.batch();
    for (const d of candidates) {
      const data = d.data();
      const liqId = String(data.sourceLiquidationId);
      const update = {};
      if (!data.receiptRef && data.sourceLiquidationRowId) {
        const byRow = receiptsByLiqId.get(liqId);
        const receiptRef = byRow?.get(data.sourceLiquidationRowId);
        if (receiptRef) update.receiptRef = receiptRef;
      }
      const info = liqInfoById.get(liqId);
      if (!data.liquidationFiledBy && info?.employee_name) update.liquidationFiledBy = info.employee_name;
      if (!data.liquidationFiledAt && info?.date_of_submission) update.liquidationFiledAt = info.date_of_submission;
      if (Object.keys(update).length === 0) continue;
      batch.update(d.ref, update);
      count += 1;
    }
    if (count > 0) await batch.commit();
    res.json({ success: true, count });
  } catch (err) {
    console.error('Error backfilling liquidation receipts:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Superadmin-only: reclassify a manually-entered / receipt-scanned project expense as an
// employee out-of-pocket claim instead of a company-paid one. Creates a submitted liquidation
// for the chosen employee (optionally against one of their approved CAs) and removes the
// original project_expense in one batch, so the cost is never counted twice.
// Shared by project_expenses and overhead_expenses — an overhead receipt an
// employee paid out-of-pocket is just as promotable as a project one.
const promoteExpenseToLiquidation = (collectionName) => async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { userId, caId } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
  try {
    const expenseRef = db.collection(collectionName).doc(req.params.id);
    const expenseSnap = await expenseRef.get();
    if (!expenseSnap.exists) return res.status(404).json({ success: false, error: 'Expense not found' });
    const expense = expenseSnap.data();
    if (!['manual', 'receipt_scan'].includes(expense.sourceType)) {
      return res.status(400).json({ success: false, error: 'Only manually-entered or scanned expenses can be promoted to a liquidation' });
    }
    const targetUserSnap = await db.collection('users').doc(String(userId)).get();
    if (!targetUserSnap.exists) return res.status(404).json({ success: false, error: 'Employee not found' });
    const targetUser = targetUserSnap.data();

    let caRef = null;
    if (caId) {
      caRef = db.collection('cash_advances').doc(String(caId));
      const caSnap = await caRef.get();
      if (!caSnap.exists || caSnap.data().user_id !== String(userId) || caSnap.data().status !== 'approved') {
        return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance for this employee' });
      }
      const bal = parseFloat(caSnap.data().balance_remaining) || 0;
      if ((Number(expense.amount) || 0) > bal) {
        return res.status(400).json({ success: false, error: `Expense (₱${Number(expense.amount).toFixed(2)}) exceeds CA balance remaining (₱${bal.toFixed(2)})` });
      }
    }

    // Same LQ-#### numbering scheme as /api/liquidations/next-form-no.
    const formNoSnap = await db.collection('liquidations').where('status', '==', 'submitted').select('form_no').get();
    const formNos = formNoSnap.docs.map(d => d.data().form_no).filter(fn => fn && typeof fn === 'string' && fn.startsWith('LQ-'));
    let nextNum = 1;
    if (formNos.length > 0) {
      const nums = formNos.map(fn => { const m = fn.match(/LQ-0*(\d+)/); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
      if (nums.length > 0) nextNum = Math.max(...nums) + 1;
    }
    const formNo = `LQ-${String(nextNum).padStart(4, '0')}`;

    const now = Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();
    const liquidationRef = db.collection('liquidations').doc();
    const rows = [{ category: expense.category || 'Others', description: expense.description || '', amount: Number(expense.amount) || 0 }];

    const batch = db.batch();
    batch.set(liquidationRef, {
      user_id: String(userId),
      form_no: formNo,
      date_of_submission: nowIso.slice(0, 10),
      employee_name: targetUser.full_name || targetUser.username || null,
      employee_number: null,
      rows_json: JSON.stringify(rows),
      receipts_json: '[]',
      total_amount: Number(expense.amount) || 0,
      ca_id: caId || null,
      status: 'submitted',
      reimbursement_status: caId ? null : 'pending',
      reimbursed_at: null,
      reimbursed_by: null,
      promotedFromExpenseId: req.params.id,
      created_at: now,
      updated_at: now,
    });
    if (caRef) {
      batch.update(caRef, { balance_remaining: FieldValue.increment(-(Number(expense.amount) || 0)), updated_at: now });
    }
    batch.delete(expenseRef);
    // Clean up any linked out-of-pocket investment row — the expense is no longer company-paid.
    batch.delete(db.collection('investments').doc(`expense_sync_${req.params.id}`));
    await batch.commit();

    res.json({ success: true, liquidationId: liquidationRef.id, formNo });
  } catch (err) {
    console.error(`Error promoting ${collectionName} row to liquidation:`, err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
};

app.post('/api/project-expenses/:id/promote-to-liquidation', promoteExpenseToLiquidation('project_expenses'));
app.post('/api/overhead-expenses/:id/promote-to-liquidation', promoteExpenseToLiquidation('overhead_expenses'));

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
  // Which investor is fronting a cash advance is an approval-time call, not a request-time
  // one — the requester hasn't spent anything yet (unlike a project/overhead expense, where
  // self-attesting fundingSource is coherent because the person entering it is the one who
  // actually paid out of pocket). Only admins may set it, whether at creation or later via
  // PATCH /api/cash-advances/:id/funding.
  const isAdminRequester = user.role === 'superadmin' || user.role === 'admin';
  const fundingSource = isAdminRequester ? normalizeFundingSource(req.body.fundingSource) : null;
  try {
    const caNo = await nextCaNo(projectId, new Date(requestedAt * 1000));
    const ref = await db.collection('cash_advances').add({ user_id: user.id, amount, balance_remaining: 0, status: 'pending', purpose, breakdown: breakdown || null, project_id: projectId || null, ca_no: caNo, requested_at: requestedAt, approved_at: null, approved_by: null, created_at: requestedAt, updated_at: requestedAt, ...(fundingSource ? { fundingSource } : {}) });
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
    // Money only actually leaves an investor's pocket once the request is approved — mirror
    // the run's funding source onto an Investment Tracker row at that point, same idiom as
    // syncPayrollOverheadExpenses. A rejected CA was never synced, so nothing to reverse.
    // Re-read after our own write (not the pre-write `ca`) so a fundingSource set by a
    // concurrent PATCH .../funding request lands correctly — this doesn't eliminate the race
    // (neither endpoint uses a transaction, matching this codebase's existing risk tolerance
    // for balance_remaining elsewhere), but it closes the more likely ordering.
    if (status === 'approved') {
      const freshCa = (await ref.get()).data();
      await syncExpenseFundingInvestment(id, 'cash_advances', { ...freshCa, date: new Date(now * 1000).toISOString().slice(0, 10) });
    }
    res.json({ success: true, message: status === 'approved' ? 'Cash advance approved' : 'Cash advance rejected' });
  } catch (err) {
    console.error('Error updating cash advance:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Backfills/edits the funding source on a CA independent of a status transition — needed
// because CAs created before the funding-source feature shipped (and any CA an admin wants
// to correct) have no way to pick up Investment Tracker linking otherwise, since the approve
// endpoint above only reads/syncs fundingSource at the moment status flips to 'approved'.
app.patch('/api/cash-advances/:id/funding', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { id } = req.params;
  try {
    const ref = db.collection('cash_advances').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Cash advance not found' });
    const fundingSource = normalizeFundingSource(req.body.fundingSource);
    const now = Math.floor(Date.now() / 1000);
    await ref.update({ fundingSource: fundingSource || FieldValue.delete(), updated_at: now });
    // Only an approved CA has actually drawn money — sync (or clear) its Investment Tracker
    // link immediately, dated to the original approval (not today) so historical CAs land in
    // the right period. A pending/rejected CA's funding choice just gets carried into the doc;
    // it takes effect the next time (if ever) the approve endpoint above runs — never, for a
    // rejected one, which is why the client hides this action for rejected CAs.
    // Re-read after our own write (not the pre-write `ca`/`doc`) to narrow the race with a
    // concurrent approve request landing between our read and write.
    let syncOk = true;
    const freshCa = (await ref.get()).data();
    if (freshCa.status === 'approved') {
      const syncDate = freshCa.approved_at ? new Date(freshCa.approved_at * 1000).toISOString().slice(0, 10) : new Date(now * 1000).toISOString().slice(0, 10);
      syncOk = await syncExpenseFundingInvestment(id, 'cash_advances', { ...freshCa, date: syncDate });
    }
    res.json({
      success: true,
      message: syncOk ? 'Funding source updated' : 'Funding source saved, but updating the Investment Tracker link failed — please retry.',
      syncWarning: !syncOk,
    });
  } catch (err) {
    console.error('Error updating cash advance funding source:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Admin-only: close out an approved cash advance's remaining balance — either
// the cash physically came back ('returned') or it's being written off as a
// realized loss ('written_off').
app.post('/api/cash-advances/:id/close', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { id } = req.params;
  const { closureType } = req.body;
  if (closureType !== 'returned' && closureType !== 'written_off') return res.status(400).json({ success: false, error: "closureType must be 'returned' or 'written_off'" });
  try {
    const ref = db.collection('cash_advances').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Cash advance not found' });
    const ca = doc.data();
    if (ca.status !== 'approved') return res.status(400).json({ success: false, error: 'Only approved cash advances can be closed' });
    const balance = parseFloat(ca.balance_remaining) || 0;
    // A negative balance means the employee over-liquidated against this CA — that's
    // a reimbursement payable, not an unused-cash closeout. Settle it from the
    // Reimbursements page (POST /api/reimbursements/:id/pay), which pays the employee
    // back and restores this CA's balance toward zero as a side effect.
    if (balance < 0) return res.status(400).json({ success: false, error: 'This CA has a negative balance (company owes the employee) — settle it from the Reimbursements page instead.' });
    const now = Math.floor(Date.now() / 1000);
    await ref.update({ status: 'closed', closureType, closedAt: now, closedBy: user.id, balance_remaining: 0, updated_at: now });
    let syncOk = true;
    if (closureType === 'returned' && balance > 0) {
      // The investment row (if any) currently reflects the FULL original advance as deployed
      // capital. The returned portion never actually got spent — bring the row down to
      // actually-deployed capital (original amount minus what just came back).
      const invRef = db.collection('investments').doc(`expense_sync_${id}`);
      const invSnap = await invRef.get();
      if (invSnap.exists) {
        const currentAmount = Number(invSnap.data().amount) || 0;
        await invRef.update({ amount: Math.max(0, currentAmount - balance), updated_at: new Date().toISOString() });
      }
    } else if (closureType === 'written_off' && balance > 0) {
      // The capital genuinely left and wasn't recovered — leave the investment row as-is, but
      // book the shortfall as a real cost so it isn't a phantom gap in the P&L.
      await db.collection('overhead_expenses').add({
        description: `Cash advance write-off: ${ca.ca_no || id}`,
        amount: balance,
        date: new Date(now * 1000).toISOString().slice(0, 10),
        category: 'Cash Advance Write-off',
        createdAt: new Date(now * 1000).toISOString(),
        createdBy: user.id,
        sourceType: 'ca_writeoff',
        sourceCaId: id,
      });
    }
    res.json({ success: true, message: closureType === 'returned' ? 'Cash advance closed — cash returned' : 'Cash advance closed — written off', syncWarning: !syncOk });
  } catch (err) {
    console.error('Error closing cash advance:', err);
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
    // Remove/unlink any Investment Tracker row this CA's approval had synced.
    await syncExpenseFundingInvestment(id, 'cash_advances', {});
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
    let caCoveredAmount = 0;
    let reimbursableAmount = 0;
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
      const bal = parseFloat(caDoc.data().balance_remaining) || 0;
      // An overspend no longer blocks submission — the amount beyond the CA's
      // balance just splits off into a reimbursement claim instead (see below).
      caCoveredAmount = Math.min(total, bal);
      reimbursableAmount = Math.max(0, total - bal);
    } else if (liqStatus === 'submitted' && !caId) {
      reimbursableAmount = total;
    }
    if (liqStatus === 'submitted' && form_no) {
      const dupSnap = await db.collection('liquidations').where('status', '==', 'submitted').where('form_no', '==', form_no).get();
      if (!dupSnap.empty) return res.status(409).json({ success: false, error: `Form no ${form_no} is already used — refresh to get the next number` });
    }
    // Reimbursable amounts — out-of-pocket claims, or the slice of a liquidation
    // that exceeds the CA's balance — are tracked so the requester gets paid
    // back (see /api/reimbursements).
    const reimbursementStatus = liqStatus === 'submitted' && reimbursableAmount > 0 ? 'pending' : null;
    const ref = await db.collection('liquidations').add({ user_id: user.id, form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), receipts_json: JSON.stringify(receipts), total_amount: total, ca_covered_amount: caCoveredAmount, reimbursable_amount: reimbursableAmount, ca_id: caId, status: liqStatus, reimbursement_status: reimbursementStatus, reimbursed_at: null, reimbursed_by: null, created_at: now, updated_at: now });
    if (liqStatus === 'submitted' && caId) {
      // Decrement by the FULL total, not just the covered portion — a CA's
      // balance_remaining going negative IS the "company owes this employee" signal
      // the existing employee-balances rollup (CAFormPage.tsx) already reads.
      // ca_covered_amount/reimbursable_amount above are kept as informational splits
      // for display; they don't change what actually gets written to the CA balance.
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(-total), updated_at: now });
    }
    if (liqStatus === 'submitted' && reimbursableAmount > 0) {
      await db.collection('reimbursements').doc(ref.id).set({
        liquidationId: ref.id,
        formNo: form_no || null,
        employeeId: user.id,
        employeeName: employee_name || user.full_name || user.username || null,
        origin: caId ? 'ca_excess' : 'no_ca',
        amount: reimbursableAmount,
        caId: caId || null,
        status: 'pending',
        fundingSource: null,
        paidAt: null,
        paidBy: null,
        syncedInvestmentId: null,
        createdAt: now,
        updatedAt: now,
      });
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
    let caCoveredAmount = 0;
    let reimbursableAmount = 0;
    if (liqStatus === 'submitted' && caId) {
      const caDoc = await db.collection('cash_advances').doc(caId).get();
      if (!caDoc.exists || caDoc.data().user_id !== user.id || caDoc.data().status !== 'approved') return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
      const bal = parseFloat(caDoc.data().balance_remaining) || 0;
      caCoveredAmount = Math.min(total, bal);
      reimbursableAmount = Math.max(0, total - bal);
    } else if (liqStatus === 'submitted' && !caId) {
      reimbursableAmount = total;
    }
    if (liqStatus === 'submitted' && form_no) {
      const dupSnap = await db.collection('liquidations').where('status', '==', 'submitted').where('form_no', '==', form_no).get();
      if (dupSnap.docs.some(d => d.id !== id)) return res.status(409).json({ success: false, error: `Form no ${form_no} is already used — refresh to get the next number` });
    }
    const reimbursementStatus = liqStatus === 'submitted' && reimbursableAmount > 0 ? 'pending' : null;
    await ref.update({ form_no: form_no || null, date_of_submission: date_of_submission || null, employee_name: employee_name || null, employee_number: employee_number || null, rows_json: JSON.stringify(rows), receipts_json: JSON.stringify(receipts), total_amount: total, ca_covered_amount: caCoveredAmount, reimbursable_amount: reimbursableAmount, ca_id: caId, status: liqStatus, reimbursement_status: reimbursementStatus, updated_at: now });
    if (liqStatus === 'submitted' && caId) {
      // Full total, matching POST above — the CA's balance_remaining can go
      // negative, which is the existing "company owes this employee" signal.
      await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(-total), updated_at: now });
    }
    if (liqStatus === 'submitted' && reimbursableAmount > 0) {
      await db.collection('reimbursements').doc(id).set({
        liquidationId: id,
        formNo: form_no || null,
        employeeId: existing.user_id,
        employeeName: employee_name || user.full_name || user.username || null,
        origin: caId ? 'ca_excess' : 'no_ca',
        amount: reimbursableAmount,
        caId: caId || null,
        status: 'pending',
        fundingSource: null,
        paidAt: null,
        paidBy: null,
        syncedInvestmentId: null,
        createdAt: now,
        updatedAt: now,
      });
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
    // Keep the first-class reimbursements doc (source of truth for GET /api/reimbursements)
    // in sync with this legacy toggle — reimbursement docs are keyed by liquidation id.
    const reimbursementRef = db.collection('reimbursements').doc(req.params.id);
    const reimbursementSnap = await reimbursementRef.get();
    if (reimbursementSnap.exists) {
      if (reimbursement_status === 'reimbursed') {
        await reimbursementRef.update({ status: 'paid', paidAt: now, paidBy: user.id, updatedAt: now });
      } else if (reimbursementSnap.data().status === 'paid') {
        await reimbursementRef.update({ status: 'pending', paidAt: null, paidBy: null, fundingSource: null, updatedAt: now });
      }
    }
    res.json({ success: true, message: reimbursement_status === 'reimbursed' ? 'Marked as reimbursed' : 'Reverted to pending reimbursement' });
  } catch (err) {
    console.error('Error updating liquidation reimbursement status:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Admin-only: list pending reimbursement claims (out-of-pocket liquidation rows,
// and the slice of any liquidation that exceeded its CA's balance).
app.get('/api/reimbursements', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const snap = await db.collection('reimbursements').where('status', '==', 'pending').get();
    const rows = await Promise.all(snap.docs.map(async doc => {
      const r = { id: doc.id, ...doc.data() };
      if (r.employeeId) {
        const uDoc = await db.collection('users').doc(r.employeeId).get();
        if (uDoc.exists) { r.username = uDoc.data().username; r.full_name = uDoc.data().full_name; }
      }
      return r;
    }));
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ success: true, reimbursements: rows });
  } catch (err) {
    console.error('Error fetching reimbursements:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Admin-only: mark a single pending reimbursement as paid, optionally recording an
// out-of-pocket funding source so it syncs into the Investment Tracker.
app.post('/api/reimbursements/:id/pay', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { id } = req.params;
  try {
    const ref = db.collection('reimbursements').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Reimbursement not found' });
    const reimbursement = doc.data();
    if (reimbursement.status !== 'pending') return res.status(400).json({ success: false, error: 'Reimbursement is not pending' });
    const fs = normalizeFundingSource(req.body.fundingSource);
    const now = Math.floor(Date.now() / 1000);
    await ref.update({ status: 'paid', fundingSource: fs, paidAt: now, paidBy: user.id, updatedAt: now });
    await db.collection('liquidations').doc(reimbursement.liquidationId).update({ reimbursement_status: 'reimbursed', reimbursed_at: now, reimbursed_by: user.id });
    // Paying a ca_excess reimbursement is the company actually handing the employee
    // the amount their over-liquidation put the CA into the negative for — restore
    // that CA's balance_remaining toward zero by the same amount.
    if (reimbursement.origin === 'ca_excess' && reimbursement.caId) {
      await db.collection('cash_advances').doc(reimbursement.caId).update({ balance_remaining: FieldValue.increment(reimbursement.amount), updated_at: now });
    }
    // Re-read after our own write, same defensive pattern as the CA /funding endpoint,
    // so the sync sees the just-written fundingSource rather than a stale pre-write copy.
    const fresh = (await ref.get()).data();
    const syncOk = await syncExpenseFundingInvestment(id, 'reimbursements', {
      date: new Date(now * 1000).toISOString().slice(0, 10),
      amount: fresh.amount,
      fundingSource: fresh.fundingSource,
      description: `Reimbursement ${fresh.formNo || id}: ${fresh.employeeName || ''}`.trim(),
    });
    res.json({ success: true, message: 'Reimbursement marked paid', syncWarning: !syncOk });
  } catch (err) {
    console.error('Error paying reimbursement:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Admin-only: batch-mark pending reimbursements as paid, optionally from a shared funding source.
app.post('/api/reimbursements/batch-mark', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin' && user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
  if (ids.some(id => typeof id !== 'string' || !id.trim())) return res.status(400).json({ success: false, error: 'Each id must be a non-empty string' });
  if (ids.length > 500) return res.status(400).json({ success: false, error: 'Maximum 500 ids per request' });
  try {
    const now = Math.floor(Date.now() / 1000);
    const fs = normalizeFundingSource(req.body.fundingSource);
    const batch = db.batch();
    const skipped = [];
    const toSync = [];
    for (const id of ids) {
      const ref = db.collection('reimbursements').doc(id);
      const doc = await ref.get();
      if (!doc.exists) { skipped.push({ id, reason: 'not found' }); continue; }
      const r = doc.data();
      if (r.status !== 'pending') { skipped.push({ id, reason: 'not pending' }); continue; }
      batch.update(ref, { status: 'paid', fundingSource: fs, paidAt: now, paidBy: user.id, updatedAt: now });
      if (r.liquidationId) {
        batch.update(db.collection('liquidations').doc(r.liquidationId), { reimbursement_status: 'reimbursed', reimbursed_at: now, reimbursed_by: user.id });
      }
      // Same CA-balance restoration as the single-pay endpoint, batched.
      if (r.origin === 'ca_excess' && r.caId) {
        batch.update(db.collection('cash_advances').doc(r.caId), { balance_remaining: FieldValue.increment(r.amount), updated_at: now });
      }
      toSync.push({ id, amount: r.amount, formNo: r.formNo, employeeName: r.employeeName });
    }
    if (toSync.length > 0) await batch.commit();
    for (const r of toSync) {
      await syncExpenseFundingInvestment(r.id, 'reimbursements', {
        date: new Date(now * 1000).toISOString().slice(0, 10),
        amount: r.amount,
        fundingSource: fs,
        description: `Reimbursement ${r.formNo || r.id}: ${r.employeeName || ''}`.trim(),
      });
    }
    const updated = toSync.length;
    res.json({ success: true, updated, skipped, message: `Marked ${updated} as reimbursed` });
  } catch (err) {
    console.error('Error batch-marking reimbursements:', err);
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
    const reimbursementRef = db.collection('reimbursements').doc(id);
    const reimbursementSnap = await reimbursementRef.get();
    const reimbursement = reimbursementSnap.exists ? reimbursementSnap.data() : null;
    if (liq.status === 'submitted' && caId) {
      // The CA's balance_remaining was decremented by the FULL total at submission.
      // If the reimbursable portion was already paid out, that amount was already
      // restored to the CA balance at payment time (see POST /api/reimbursements/:id/pay)
      // — refund only the remaining CA-covered portion here to avoid double-crediting.
      const alreadyRestored = reimbursement && reimbursement.status === 'paid' ? (parseFloat(reimbursement.amount) || 0) : 0;
      const refundAmount = total - alreadyRestored;
      if (refundAmount > 0) {
        await db.collection('cash_advances').doc(caId).update({ balance_remaining: FieldValue.increment(refundAmount), updated_at: now });
      }
    }
    // Drop any still-pending reimbursement claim this liquidation spawned — an
    // already-paid one stays as the payment record even though its source liquidation
    // is gone, same reasoning as applyLiquidationRevision's paid-amount guard.
    if (reimbursement && reimbursement.status === 'pending') {
      await reimbursementRef.delete();
    }
    await ref.delete();
    res.json({ success: true, message: 'Liquidation deleted' });
  } catch (err) {
    console.error('Error deleting liquidation:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ── Submitted-liquidation edit workflow ──────────────────────────────────────
// Submitted liquidations stay closed to direct PUTs, but the filing owner (or
// an admin) can propose an edit that a superadmin approves; a superadmin's own
// edit applies immediately. Applying a revision reconciles the side effects of
// the original submission — the linked CA balance delta and the
// project_expenses rows synced from this liquidation — and snapshots the
// before/after state to liquidation_revision_audit.

function parseLiqRows(rowsJson) {
  if (Array.isArray(rowsJson)) return rowsJson;
  if (typeof rowsJson !== 'string') return [];
  try { const p = JSON.parse(rowsJson || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

async function applyLiquidationRevision(liqId, liq, revision, approver) {
  const now = Math.floor(Date.now() / 1000);
  const oldRows = parseLiqRows(liq.rows_json);
  const newRows = parseLiqRows(revision.rows_json);
  const oldTotal = parseFloat(liq.total_amount) || 0;
  const newTotal = parseFloat(revision.total_amount) || 0;

  // CA reconciliation: only the delta moves on balance_remaining (raw, uncapped —
  // same as POST/PUT above, a negative balance is the "company owes this employee"
  // signal, not an error). ca_covered_amount/reimbursable_amount are recomputed as
  // an informational split against what the CA's balance was before THIS
  // liquidation's own prior effect (i.e. undoing oldTotal), so the split reflects
  // the revision as if it were a fresh submission against that same starting point.
  let newCaCoveredAmount = 0;
  let newReimbursableAmount = newTotal;
  let caRef = null;
  let caDelta = 0;
  if (liq.ca_id) {
    caRef = db.collection('cash_advances').doc(String(liq.ca_id));
    const caDoc = await caRef.get();
    if (caDoc.exists) {
      const bal = parseFloat(caDoc.data().balance_remaining) || 0;
      const balBeforeThisLiquidation = bal + oldTotal;
      newCaCoveredAmount = Math.min(newTotal, Math.max(0, balBeforeThisLiquidation));
      newReimbursableAmount = Math.max(0, newTotal - balBeforeThisLiquidation);
      caDelta = newTotal - oldTotal;
    } else {
      caRef = null; // nothing to write balance_remaining onto
    }
  }

  // A revision may not silently change an amount that's already been paid out —
  // reject it and let the payment discrepancy be resolved by hand first.
  const reimbursementRef = db.collection('reimbursements').doc(liqId);
  const reimbursementSnap = await reimbursementRef.get();
  const existingReimbursement = reimbursementSnap.exists ? reimbursementSnap.data() : null;
  if (existingReimbursement && existingReimbursement.status === 'paid' && (parseFloat(existingReimbursement.amount) || 0) !== newReimbursableAmount) {
    throw Object.assign(new Error('This revision would change an already-paid reimbursement amount — resolve the payment discrepancy manually before revising.'), { status: 400 });
  }

  if (caRef && caDelta !== 0) {
    await caRef.update({ balance_remaining: FieldValue.increment(-caDelta), updated_at: now });
  }

  // project_expenses re-sync: update/delete docs previously synced from this
  // liquidation, and create docs only for rows that are new in the revision.
  // Rows that were never synced (older filings predate the client-side sync)
  // stay unsynced so applying a fix doesn't retroactively inject historical
  // costs into the P&L.
  const liqDescription = (row) => liq.form_no
    ? `Liquidation ${liq.form_no}: ${(row.particulars || '').trim() || 'Liquidation'}`
    : ((row.particulars || '').trim() || 'Liquidation');
  const expSnap = await db.collection('project_expenses').where('sourceLiquidationId', '==', liqId).get();
  const expByRowId = new Map();
  expSnap.docs.forEach(d => { const rid = d.data().sourceLiquidationRowId; if (rid) expByRowId.set(rid, d); });
  const oldRowIds = new Set(oldRows.map(r => r.id));
  const newById = new Map(newRows.map(r => [r.id, r]));
  const revisedFiledBy = (revision.employee_name ?? liq.employee_name) || null;
  const revisedFiledAt = (revision.date_of_submission ?? liq.date_of_submission) || null;
  // Receipt links keyed by rowId, from the revision's receipts (falling back to
  // the liquidation's current receipts if the revision didn't touch them) — only
  // entries that actually finished uploading (oneDriveId/webUrl present) count.
  const newReceiptsList = parseLiqRows(revision.receipts_json != null ? revision.receipts_json : liq.receipts_json);
  const receiptByRowId = new Map();
  newReceiptsList.forEach(r => { if (r && r.rowId && r.oneDriveId && r.webUrl && !receiptByRowId.has(r.rowId)) receiptByRowId.set(r.rowId, { oneDriveId: r.oneDriveId, webUrl: r.webUrl, filename: r.filename || 'receipt' }); });
  const batch = db.batch();
  for (const [rowId, expDoc] of expByRowId) {
    const row = newById.get(rowId);
    if (!row || !row.projectId || !(Number(row.amount) > 0)) { batch.delete(expDoc.ref); continue; }
    const receiptRef = receiptByRowId.get(rowId);
    batch.update(expDoc.ref, {
      projectId: String(row.projectId),
      projectName: (row.projectName || '').trim() || '—',
      description: liqDescription(row),
      amount: Number(row.amount) || 0,
      date: row.date || expDoc.data().date || null,
      category: (row.category || '').trim() || 'Others',
      receiptRef: receiptRef || FieldValue.delete(),
      liquidationFiledBy: revisedFiledBy || FieldValue.delete(),
      liquidationFiledAt: revisedFiledAt || FieldValue.delete(),
    });
  }
  for (const row of newRows) {
    if (oldRowIds.has(row.id) || expByRowId.has(row.id)) continue;
    if (!row.projectId || !(Number(row.amount) > 0)) continue;
    const doc = {
      projectId: String(row.projectId),
      projectName: (row.projectName || '').trim() || '—',
      description: liqDescription(row),
      amount: Number(row.amount) || 0,
      date: row.date || new Date().toISOString().slice(0, 10),
      category: (row.category || '').trim() || 'Others',
      createdAt: new Date().toISOString(),
      createdBy: revision.proposed_by || approver.id,
      sourceType: 'liquidation_sync',
      sourceLiquidationId: liqId,
      sourceLiquidationRowId: row.id,
    };
    if (revisedFiledBy) doc.liquidationFiledBy = revisedFiledBy;
    if (revisedFiledAt) doc.liquidationFiledAt = revisedFiledAt;
    if (liq.ca_id) doc.sourceCaId = String(liq.ca_id);
    if ((row.supplier || '').trim()) doc.supplier = row.supplier.trim();
    if ((row.invoiceNo || '').trim()) doc.invoiceNo = row.invoiceNo.trim();
    if (typeof row.deductible === 'boolean') doc.deductible = row.deductible;
    const receiptRef = receiptByRowId.get(row.id);
    if (receiptRef) doc.receiptRef = receiptRef;
    batch.set(db.collection('project_expenses').doc(), doc);
  }
  await batch.commit();

  // Reconcile the reimbursements doc to the re-split amount. Skip touching a
  // doc that's already 'paid' — the throw-guard above already proved its
  // amount is unchanged, so re-setting it back to 'pending' would silently
  // reverse a real payment.
  if (newReimbursableAmount > 0) {
    if (!existingReimbursement || existingReimbursement.status !== 'paid') {
      const reimbursementUpdate = {
        liquidationId: liqId,
        formNo: liq.form_no || null,
        employeeId: liq.user_id,
        employeeName: (revision.employee_name ?? liq.employee_name) || null,
        origin: liq.ca_id ? 'ca_excess' : 'no_ca',
        amount: newReimbursableAmount,
        caId: liq.ca_id || null,
        status: 'pending',
        fundingSource: null,
        paidAt: null,
        paidBy: null,
        syncedInvestmentId: null,
        updatedAt: now,
      };
      if (!existingReimbursement) reimbursementUpdate.createdAt = now;
      await reimbursementRef.set(reimbursementUpdate, { merge: true });
    }
  } else if (existingReimbursement && existingReimbursement.status === 'pending') {
    await reimbursementRef.delete();
  }

  await db.collection('liquidation_revision_audit').add({
    liquidation_id: liqId,
    form_no: liq.form_no || null,
    action: 'applied',
    before: { rows_json: liq.rows_json, total_amount: oldTotal, employee_name: liq.employee_name || null, date_of_submission: liq.date_of_submission || null },
    after: { rows_json: JSON.stringify(newRows), total_amount: newTotal, employee_name: revision.employee_name ?? liq.employee_name ?? null, date_of_submission: revision.date_of_submission ?? liq.date_of_submission ?? null },
    proposed_by: revision.proposed_by || approver.id,
    proposed_by_name: revision.proposed_by_name || null,
    approved_by: approver.id,
    note: revision.note || null,
    created_at: now,
  });

  const finalReimbursementStatus = newReimbursableAmount > 0
    ? ((existingReimbursement && existingReimbursement.status === 'paid') ? 'reimbursed' : 'pending')
    : null;
  const update = {
    rows_json: JSON.stringify(newRows),
    total_amount: newTotal,
    ca_covered_amount: newCaCoveredAmount,
    reimbursable_amount: newReimbursableAmount,
    reimbursement_status: finalReimbursementStatus,
    updated_at: now,
    pending_revision: FieldValue.delete(),
  };
  if (revision.employee_name != null) update.employee_name = revision.employee_name;
  if (revision.date_of_submission != null) update.date_of_submission = revision.date_of_submission;
  if (revision.receipts_json != null) update.receipts_json = revision.receipts_json;
  await db.collection('liquidations').doc(liqId).update(update);
}

// Owner or admin proposes an edit to a submitted liquidation; superadmin's own
// proposal applies immediately (no self-approval round-trip).
app.post('/api/liquidations/:id/propose-edit', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role === 'viewer') return res.status(403).json({ success: false, error: 'Forbidden' });
  const { id } = req.params;
  try {
    const ref = db.collection('liquidations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = doc.data();
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin && liq.user_id !== user.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (liq.status !== 'submitted') return res.status(400).json({ success: false, error: 'Only submitted liquidations use the edit-approval flow — edit the draft directly' });
    const { rows_json, receipts_json, total_amount, employee_name, date_of_submission, note } = req.body;
    const rows = parseLiqRows(rows_json);
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Revision needs at least one row' });
    const total = parseFloat(total_amount) || 0;
    // No CA-overspend guard here, matching POST /api/liquidations and
    // applyLiquidationRevision: overspend against a CA is never blocked, the
    // excess just becomes a tracked reimbursement. A prior version of this
    // endpoint rejected any edit — even a date-only fix — on a liquidation that
    // was already legitimately over its CA, since "available" only reconstructs
    // the CA's balance before this liquidation, not what a fresh submission
    // would actually allow.
    const now = Math.floor(Date.now() / 1000);
    const revision = {
      rows_json: JSON.stringify(rows),
      receipts_json: receipts_json != null ? (typeof receipts_json === 'string' ? receipts_json : JSON.stringify(receipts_json)) : null,
      total_amount: total,
      employee_name: employee_name ?? null,
      date_of_submission: date_of_submission ?? null,
      note: (note || '').trim() || null,
      proposed_by: user.id,
      proposed_by_name: user.full_name || user.username || null,
      proposed_at: now,
    };
    if (user.role === 'superadmin') {
      await applyLiquidationRevision(id, liq, revision, user);
      return res.json({ success: true, applied: true, message: 'Edit applied' });
    }
    if (liq.pending_revision && liq.pending_revision.proposed_by !== user.id) {
      return res.status(409).json({ success: false, error: `An edit by ${liq.pending_revision.proposed_by_name || 'another user'} is already pending approval` });
    }
    await ref.update({ pending_revision: revision, updated_at: now });
    res.json({ success: true, applied: false, message: 'Edit submitted for superadmin approval' });
  } catch (err) {
    if (err && err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Error proposing liquidation edit:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/liquidations/:id/revision/approve', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { id } = req.params;
  try {
    const doc = await db.collection('liquidations').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = doc.data();
    if (!liq.pending_revision) return res.status(400).json({ success: false, error: 'No pending edit on this liquidation' });
    await applyLiquidationRevision(id, liq, liq.pending_revision, user);
    res.json({ success: true, message: 'Edit approved and applied' });
  } catch (err) {
    if (err && err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Error approving liquidation revision:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/liquidations/:id/revision/reject', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Superadmin only' });
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const ref = db.collection('liquidations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Liquidation not found' });
    const liq = doc.data();
    if (!liq.pending_revision) return res.status(400).json({ success: false, error: 'No pending edit on this liquidation' });
    const now = Math.floor(Date.now() / 1000);
    await db.collection('liquidation_revision_audit').add({
      liquidation_id: id,
      form_no: liq.form_no || null,
      action: 'rejected',
      proposed_revision: liq.pending_revision,
      proposed_by: liq.pending_revision.proposed_by || null,
      proposed_by_name: liq.pending_revision.proposed_by_name || null,
      rejected_by: user.id,
      reason: (reason || '').trim() || null,
      created_at: now,
    });
    await ref.update({ pending_revision: FieldValue.delete(), updated_at: now });
    res.json({ success: true, message: 'Edit rejected' });
  } catch (err) {
    console.error('Error rejecting liquidation revision:', err);
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

const PAYROLL_ROLES = ['superadmin', 'admin'];

async function requirePayrollAccess(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!PAYROLL_ROLES.includes(user.role)) { res.status(403).json({ error: 'Payroll access restricted' }); return null; }
  return user;
}

// Editing/deleting an already-created run rewrites figures that have already flowed into the
// company P&L (overhead sync) — restricted to superadmin on top of the normal payroll whitelist.
async function requireSuperadminPayrollAccess(req, res) {
  const user = await requirePayrollAccess(req, res);
  if (!user) return null;
  if (user.role !== 'superadmin') { res.status(403).json({ error: 'Superadmin only' }); return null; }
  return user;
}

// Read-only: lets the tax_filer role (plus whoever already has full payroll access) see the
// OFFICE-employee breakdown behind a run's synced overhead totals, without granting any of the
// broader payroll admin routes gated by requirePayrollAccess above.
async function requireTaxLedgerPayrollAccess(req, res) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (user.role !== 'tax_filer' && !PAYROLL_ROLES.includes(user.role)) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return user;
}

// Posts/updates/removes the OFFICE-staff payroll cost rows in overhead_expenses for a run,
// keyed on deterministic ids so recompute always overwrites (never duplicates) them — same
// idempotent idiom used on approve. Also mirrors the funding source onto (or off of) an
// Investment Tracker entry. Best-effort by design; caller decides whether a failure here
// should block its own response.
async function syncPayrollOverheadExpenses(runId, runData, user) {
  const ref = db.collection('payroll_runs').doc(runId);
  const payslipsSnap = await ref.collection('payslips').get();
  let totalOfficeGross = 0;
  let totalOfficeERGovt = 0;
  payslipsSnap.forEach((pSnap) => {
    const p = pSnap.data();
    if (p.employeeSnapshot && p.employeeSnapshot.employeeType === 'OFFICE') {
      totalOfficeGross += Number(p.grossPay || 0);
      totalOfficeERGovt += Number(p.erSSS || 0) + Number(p.erPhilhealth || 0) + Number(p.erPagibig || 0);
    }
  });

  const expenseDate = runData.payDate || runData.periodEnd || new Date().toISOString().slice(0, 10);
  const fundingSource = normalizeFundingSource(runData.fundingSource);
  const baseDoc = {
    date: expenseDate,
    sourceType: 'payroll_sync',
    sourceRunId: runId,
    createdAt: new Date().toISOString(),
    createdBy: user.id || user.username,
    ...(fundingSource ? { fundingSource } : {}),
  };

  const batch = db.batch();
  const salariesRef = db.collection('overhead_expenses').doc(`payroll_sync_${runId}_salaries`);
  const govtRef = db.collection('overhead_expenses').doc(`payroll_sync_${runId}_govt`);
  let salariesDoc = null;
  let govtDoc = null;
  if (totalOfficeGross > 0) {
    salariesDoc = {
      ...baseDoc,
      description: `Payroll ${runData.periodStart} to ${runData.periodEnd} — Office salaries`,
      amount: totalOfficeGross,
      category: 'Salaries & Wages',
    };
    batch.set(salariesRef, salariesDoc);
  } else {
    batch.delete(salariesRef);
  }
  if (totalOfficeERGovt > 0) {
    govtDoc = {
      ...baseDoc,
      description: `Payroll ${runData.periodStart} to ${runData.periodEnd} — Employer gov't contributions`,
      amount: totalOfficeERGovt,
      category: 'Government Contributions',
    };
    batch.set(govtRef, govtDoc);
  } else {
    batch.delete(govtRef);
  }
  await batch.commit();

  await Promise.all([
    syncExpenseFundingInvestment(salariesRef.id, 'overhead_expenses', salariesDoc || {}),
    syncExpenseFundingInvestment(govtRef.id, 'overhead_expenses', govtDoc || {}),
  ]);
}

// Removes any overhead_expenses rows (and their linked Investment Tracker entries) previously
// posted for a run — used when deleting a run outright, or editing an APPROVED/PAID run back
// down to DRAFT, so a payroll run that's no longer "live" doesn't leave phantom OPEX behind.
async function reversePayrollOverheadExpenses(runId) {
  const salariesRef = db.collection('overhead_expenses').doc(`payroll_sync_${runId}_salaries`);
  const govtRef = db.collection('overhead_expenses').doc(`payroll_sync_${runId}_govt`);
  const batch = db.batch();
  batch.delete(salariesRef);
  batch.delete(govtRef);
  await batch.commit();
  await Promise.all([
    syncExpenseFundingInvestment(salariesRef.id, 'overhead_expenses', {}),
    syncExpenseFundingInvestment(govtRef.id, 'overhead_expenses', {}),
  ]);
}

function isSuperadmin(user) {
  return user && user.role === 'superadmin';
}

function stripRates(obj) {
  if (!obj) return obj;
  const { dailyRate, monthlyRate, mealAllowance, ...rest } = obj;
  return rest;
}

// ── Employees ──────────────────────────────────────────────────────────────
app.get('/api/payroll/employees', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_employees').orderBy('name').get();
    const employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(isSuperadmin(user) ? employees : employees.map(e => stripRates(e)));
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
    const normalizedFunding = normalizeFundingSource(data.fundingSource);
    if (normalizedFunding) data.fundingSource = normalizedFunding; else delete data.fundingSource;
    const ref = await db.collection('payroll_runs').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) { res.status(500).json({ error: 'Failed to create payroll run' }); }
});

app.post('/api/payroll/runs/:id/approve', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const runId = req.params.id;
    const ref = db.collection('payroll_runs').doc(runId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Run not found' });

    const runData = doc.data();
    // Don't downgrade an already-PAID run back to APPROVED on a re-approve call.
    const nextStatus = runData.status === 'PAID' ? 'PAID' : 'APPROVED';
    await ref.update({ status: nextStatus, approvedBy: user.username, approvedAt: new Date().toISOString() });

    // Overhead sync is best-effort and must never fail the approval itself.
    let overheadSynced = false;
    try {
      await syncPayrollOverheadExpenses(runId, runData, user);
      overheadSynced = true;
    } catch (syncErr) {
      console.error('Payroll overhead sync failed for run', runId, syncErr);
    }

    res.json({ success: true, overheadSynced });
  } catch (err) { res.status(500).json({ error: 'Failed to approve run' }); }
});

// Superadmin-only: rewrite an existing run's period/funding/payslips and, if its target status
// changes, reconcile the overhead_expenses sync accordingly (post it if now APPROVED/PAID, pull
// it back out if downgraded to DRAFT). Existing payslip docs not present in the new set are
// deleted so removing an employee from the run actually removes their entry, not just leaves it
// stale.
app.put('/api/payroll/runs/:id', async (req, res) => {
  const user = await requireSuperadminPayrollAccess(req, res); if (!user) return;
  try {
    const runId = req.params.id;
    const ref = db.collection('payroll_runs').doc(runId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Run not found' });
    const existing = doc.data();

    const { payslips, status, id, createdAt, createdBy, ...runFields } = req.body;
    if (!Array.isArray(payslips)) return res.status(400).json({ error: 'payslips must be an array' });
    const nextStatus = ['DRAFT', 'APPROVED', 'PAID'].includes(status) ? status : existing.status;

    const normalizedFunding = normalizeFundingSource(runFields.fundingSource);
    const updates = { ...runFields, status: nextStatus, updatedBy: user.username, updatedAt: new Date().toISOString() };
    // Unlike the create endpoint's `.add()`, this is an `.update()` on an existing doc — simply
    // omitting the key would leave a stale fundingSource in place, so an explicit FieldValue.delete()
    // is required to actually clear it when funding is switched back to corporate_bank.
    updates.fundingSource = normalizedFunding || FieldValue.delete();
    if (nextStatus === 'APPROVED' && existing.status !== 'APPROVED') { updates.approvedBy = user.username; updates.approvedAt = new Date().toISOString(); }
    if (nextStatus === 'PAID' && existing.status !== 'PAID') { updates.paidAt = new Date().toISOString(); }
    await ref.update(updates);

    // Replace the payslip set: drop rows for employees no longer included, overwrite the rest.
    const payslipsCol = ref.collection('payslips');
    const existingSlipsSnap = await payslipsCol.get();
    const nextIds = new Set(payslips.map((p) => p.employeeId));
    const batch = db.batch();
    existingSlipsSnap.forEach((d) => { if (!nextIds.has(d.id)) batch.delete(d.ref); });
    payslips.forEach((slip) => {
      const slipRef = slip.employeeId ? payslipsCol.doc(slip.employeeId) : payslipsCol.doc();
      batch.set(slipRef, slip);
    });
    await batch.commit();

    let overheadSynced = false;
    try {
      if (nextStatus === 'APPROVED' || nextStatus === 'PAID') {
        // Re-fetch rather than reuse the local `updates` object — it may still hold an unresolved
        // FieldValue.delete() sentinel for fundingSource, which the sync helper can't interpret.
        const freshData = (await ref.get()).data();
        await syncPayrollOverheadExpenses(runId, freshData, user);
        overheadSynced = true;
      } else {
        await reversePayrollOverheadExpenses(runId);
      }
    } catch (syncErr) {
      console.error('Payroll overhead sync failed while editing run', runId, syncErr);
    }

    res.json({ success: true, overheadSynced });
  } catch (err) { res.status(500).json({ error: 'Failed to update payroll run' }); }
});

// Superadmin-only: delete a run outright, cascading to its payslips/DTR subcollections and
// reversing any overhead_expenses rows (and linked Investment Tracker entries) it had posted —
// so a deleted run doesn't leave phantom OPEX behind in the company P&L.
app.delete('/api/payroll/runs/:id', async (req, res) => {
  const user = await requireSuperadminPayrollAccess(req, res); if (!user) return;
  try {
    const runId = req.params.id;
    const ref = db.collection('payroll_runs').doc(runId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Run not found' });

    try {
      await reversePayrollOverheadExpenses(runId);
    } catch (syncErr) {
      console.error('Overhead reversal failed for deleted run', runId, syncErr);
    }

    const [payslipsSnap, dtrSnap] = await Promise.all([
      ref.collection('payslips').get(),
      ref.collection('dtrEntries').get(),
    ]);
    const batch = db.batch();
    payslipsSnap.forEach((d) => batch.delete(d.ref));
    dtrSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete payroll run' }); }
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

// OFFICE-only, rate-stripped payslip breakdown for a run — the per-employee detail behind the
// two lump-sum "Overhead (Payroll)" rows the Tax Filer Ledger already shows. FIELD payslips are
// excluded (their cost isn't synced into overhead_expenses, so they're irrelevant to those rows).
app.get('/api/payroll/runs/:runId/office-breakdown', async (req, res) => {
  const user = await requireTaxLedgerPayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('payroll_runs').doc(req.params.runId).collection('payslips').get();
    const office = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.employeeSnapshot && p.employeeSnapshot.employeeType === 'OFFICE');
    res.json(isSuperadmin(user) ? office : office.map(p => ({ ...p, employeeSnapshot: stripRates(p.employeeSnapshot) })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch payroll breakdown' }); }
});

// ── Employee Payslip (self-service) ────────────────────────────────────────
app.get('/api/payroll/my-payslips', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const runsSnap = await db.collection('payroll_runs').orderBy('payDate', 'desc').get();
    const payslips = [];
    for (const runDoc of runsSnap.docs) {
      // Payslip doc ID = employeeId
      const slipDoc = await runDoc.ref.collection('payslips').doc(user.id).get();
      if (slipDoc.exists) {
        payslips.push({
          ...slipDoc.data(),
          id: slipDoc.id,
          payrollRunId: runDoc.id,
          payDate: runDoc.data().payDate,
          periodStart: runDoc.data().periodStart,
          periodEnd: runDoc.data().periodEnd,
          runStatus: runDoc.data().status,
        });
      }
    }
    res.json(payslips);
  } catch (err) {
    console.error('GET /api/payroll/my-payslips error:', err);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
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

// Grand total of a calcsheet quotation — seeds contract_amount on the synced
// Project List record. Faithful plain-JS port of the client calc engine
// (src/utils/calcsheet/calc.ts: computeTotals + computeTotalsLegacy). It lives
// inline because the functions deploy copies only server.js. The parity test
// src/utils/calcsheet/serverGrandTotal.parity.test.ts extracts this function
// from server.js and compares it against the engine — keep the two in sync,
// and keep string literals here brace-free so the test's extraction works.
function quotationGrandTotal(q) {
  if (!q) return 0;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const generalReqts = Array.isArray(q.generalReqts) ? q.generalReqts : [];
  const components = Array.isArray(q.components) ? q.components : [];
  const manpower = Array.isArray(q.manpower) ? q.manpower : [];
  const services = Array.isArray(q.services) ? q.services : [];
  const lineGeneralTotal = (l) => num(l.unitPrice) * num(l.qty);
  const servicesLineSum = () => services.reduce((s, l) => s + num(l.amount), 0);
  const finish = (subtotal) => {
    const afterDiscount = subtotal * (1 - num(q.discountPct) / 100);
    return afterDiscount * (1 + num(q.vatPct) / 100);
  };

  if (q.formulaVersion === 'legacy') {
    if (q.legacyTotalsSnapshot && Number.isFinite(Number(q.legacyTotalsSnapshot.grandTotal))) {
      return Number(q.legacyTotalsSnapshot.grandTotal);
    }
    const cont = num(q.globalContingencyPct) / 100;
    const generalReqtsCost = generalReqts.reduce((s, l) => s + lineGeneralTotal(l), 0);
    const generalReqtsWithContingency = q.generalReqContingencyMode === 'baked'
      ? generalReqtsCost
      : generalReqtsCost * (1 + cont);
    const generalReqtsSubtotal = generalReqtsWithContingency * (1 + num(q.generalReqMarkupPct) / 100);
    const componentsSubtotal = components.reduce((s, l) => {
      const base = num(l.unitCost) * (num(l.forex) || 1);
      const adjusted = base * (1 + num(l.contingencyPct) / 100 - num(l.discountPct) / 100);
      return s + adjusted * (1 + num(q.productMarkupPct) / 100) * num(l.qty);
    }, 0);
    let servicesSub;
    if (q.servicesFromManpower) {
      const laborWithContingency = manpower.reduce((s, m) => {
        const unit = (num(m.dailyRate) + num(m.allowance)) * (1 + cont);
        return s + num(m.headcount) * num(m.mandays) * unit;
      }, 0);
      servicesSub = laborWithContingency * (1 + num(q.laborMarkupPct) / 100);
    } else {
      servicesSub = servicesLineSum();
    }
    return finish(generalReqtsSubtotal + componentsSubtotal + servicesSub);
  }

  const generalReqtsQty = q.exportGeneralReqtsAsLot ? Math.max(1, num(q.generalReqtsExportQty) || 1) : 1;
  const hasPerLineGenMarkup = generalReqts.some((l) => l.markupPct != null);
  const generalReqtsSubtotal = hasPerLineGenMarkup
    ? generalReqts.reduce((s, l) => {
        const markup = l.markupPct != null ? num(l.markupPct) : num(q.generalReqMarkupPct);
        return s + lineGeneralTotal(l) * (1 + markup / 100);
      }, 0) * generalReqtsQty
    : generalReqts.reduce((s, l) => s + lineGeneralTotal(l), 0) * generalReqtsQty * (1 + num(q.generalReqMarkupPct) / 100);
  const componentsSubtotal = components.reduce((s, l) => {
    const costUnit = num(l.unitCost) * (num(l.forex) || 1) * (1 - num(l.discountPct) / 100);
    const adjusted = costUnit * (1 + num(l.contingencyPct) / 100);
    const markup = l.markupPct != null ? num(l.markupPct) : num(q.productMarkupPct);
    return s + adjusted * (1 + markup / 100) * num(l.qty);
  }, 0);
  let servicesSub;
  if (q.servicesFromManpower) {
    if (q.servicesPerLinePricing) {
      servicesSub = servicesLineSum();
    } else {
      const engineeringServicesQty = Math.max(1, num(q.engineeringServicesQty) || 1);
      const manpowerCost = manpower.reduce((s, m) => s + num(m.headcount) * num(m.mandays) * (num(m.dailyRate) + num(m.allowance)), 0);
      servicesSub = manpowerCost * engineeringServicesQty * (1 + num(q.laborMarkupPct) / 100);
    }
  } else {
    servicesSub = servicesLineSum();
  }
  return finish(generalReqtsSubtotal + componentsSubtotal + servicesSub);
}

function clientApproverFromClient(client) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  const primary = contacts.find((c) => c.isPrimary) || contacts[0];
  return primary ? [primary.name, primary.position].filter(Boolean).join(' – ') : '';
}

function mapCalcsheetToMainProject(project, client, quotation, now, projectNo, partner, withActi) {
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
    with_acti: !!withActi,
    partner_id: (partner && partner.id) || project.partnerId || null,
    partner_name: (partner && partner.name) || '',
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
  const [clientDoc, partnerDoc, qSnap] = await Promise.all([
    project.customerId ? db.collection('clients').doc(String(project.customerId)).get() : Promise.resolve(null),
    project.partnerId ? db.collection('clients').doc(String(project.partnerId)).get() : Promise.resolve(null),
    db.collection('calcsheet_quotations').where('projectId', '==', projectId).get(),
  ]);
  const client = clientDoc && clientDoc.exists ? { id: clientDoc.id, ...clientDoc.data() } : null;
  const partner = partnerDoc && partnerDoc.exists ? { id: partnerDoc.id, ...partnerDoc.data() } : null;
  const quotations = qSnap.docs.map((d) => {
    const { id: _stored, ...data } = d.data();
    return { ...data, id: d.id };
  });
  const ioct = quotations.filter((q) => q.kind === 'IOCT').sort(newestQuotation)[0];
  const acti = quotations.filter((q) => q.kind === 'ACTI').sort(newestQuotation)[0];
  const selectedQuotation = ioct || acti;
  // Joint-with-ACTI: the project carries a partner link, or an ACTI-kind quotation exists.
  const withActi = !!project.partnerId || quotations.some((q) => q.kind === 'ACTI');
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
    mapped = mapCalcsheetToMainProject(project, client, selectedQuotation, now, projectNo, partner, withActi);
    mainProjectId = linkedDoc.id;
    action = 'updated';
    await linkedDoc.ref.update({ ...mapped, updated_at: now });
  } else {
    const projectNo = await nextIoctProjectNo(now);
    mapped = mapCalcsheetToMainProject(project, client, selectedQuotation, now, projectNo, partner, withActi);
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
    const { id: _ignored, createdBy: _cb, createdByName: _cbn, ...body } = req.body || {};
    const data = {
      ...body,
      // Who created the opportunity — factual audit fields, always stamped from the
      // authenticated user (client-supplied values are stripped above).
      createdBy: user.id,
      createdByName: user.full_name || user.username || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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
    // can mask the real ID during debugging. `createdBy`/`createdByName` are
    // stamped at creation and stay factual — never updatable.
    const { id: _ignored, createdBy: _cb, createdByName: _cbn, ...body } = req.body || {};
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

app.delete('/api/calcsheet/quotations/:id/versions/:versionId', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    const ref = db.collection('calcsheet_quotation_versions').doc(req.params.versionId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().quotationId !== req.params.id) {
      return res.status(404).json({ error: 'Version not found' });
    }
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('[calcsheet] delete quotation version failed:', { id: req.params.id, versionId: req.params.versionId, err: err && err.message });
    res.status(500).json({ error: 'Failed to delete version' });
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
    // Spread data first so a stray stored `id` field can't clobber the doc id.
    const clients = snap.docs.map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; });
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
    // Spread data first so a stray stored `id` field can't clobber the doc id.
    const presets = snap.docs.map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; });
    res.json({ success: true, presets });
  } catch (err) { res.status(500).json({ error: 'Failed to get presets' }); }
});

app.post('/api/calcsheet/presets', async (req, res) => {
  try {
    const user = await requireActiveUser(req, res);
    if (!user) return;
    // Strip any client-supplied `id` before storing, and return the Firestore
    // ref.id as the canonical id — otherwise the client's nanoid would clobber
    // ref.id in the response (id BEFORE spread) and get persisted as a stray
    // field, so the created preset's id would NOT match what GET returns
    // (GET strips the field and uses d.id). That mismatch orphaned every
    // manpower `presetId` captured in the same session on the next reload,
    // and made same-session PUT/DELETE hit a non-existent doc id.
    const { id: _ignored, ...data } = req.body || {};
    const ref = await db.collection('calcsheet_presets').add(data);
    res.json({ success: true, preset: { ...data, id: ref.id } });
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

// ========== PROGRESS REPORTS (saved WBS snapshots) ==========
// Filter by project_id with an in-memory sort (no composite index required —
// same pattern as calcsheet_quotation_versions).
app.get('/api/progress-reports', async (req, res) => {
  const { project_id } = req.query;
  try {
    let snap;
    if (project_id) {
      snap = await db.collection('progress_reports')
        .where('project_id', '==', String(project_id))
        .limit(200)
        .get();
    } else {
      snap = await db.collection('progress_reports').orderBy('created_at', 'desc').limit(200).get();
    }
    const rows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(rows);
  } catch (err) {
    console.error('Error fetching progress reports:', err);
    res.status(500).json({ error: 'Failed to fetch progress reports' });
  }
});

app.post('/api/progress-reports', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.created_at = data.created_at || new Date().toISOString();
    data.updated_at = new Date().toISOString();
    const ref = await db.collection('progress_reports').add(data);
    res.json({ ...data, id: ref.id });
  } catch (err) {
    console.error('Error creating progress report:', err);
    res.status(500).json({ error: 'Failed to create progress report' });
  }
});

app.put('/api/progress-reports/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.updated_at = new Date().toISOString();
    const ref = db.collection('progress_reports').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Progress report not found' });
    await ref.update(data);
    res.json({ ...doc.data(), ...data, id: ref.id });
  } catch (err) {
    console.error('Error updating progress report:', err);
    res.status(500).json({ error: 'Failed to update progress report' });
  }
});

app.delete('/api/progress-reports/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const ref = db.collection('progress_reports').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Progress report not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting progress report:', err);
    res.status(500).json({ error: 'Failed to delete progress report' });
  }
});

// ========== COMPLETION CERTIFICATES ==========
// Filter by project_id with an in-memory sort (no composite index required).
app.get('/api/completion-certificates', async (req, res) => {
  const { project_id } = req.query;
  try {
    let snap;
    if (project_id) {
      snap = await db.collection('completion_certificates')
        .where('project_id', '==', String(project_id))
        .limit(200)
        .get();
    } else {
      snap = await db.collection('completion_certificates').orderBy('created_at', 'desc').limit(200).get();
    }
    const rows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(rows);
  } catch (err) {
    console.error('Error fetching completion certificates:', err);
    res.status(500).json({ error: 'Failed to fetch completion certificates' });
  }
});

app.post('/api/completion-certificates', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.created_at = data.created_at || new Date().toISOString();
    data.updated_at = new Date().toISOString();
    const ref = await db.collection('completion_certificates').add(data);
    res.json({ ...data, id: ref.id });
  } catch (err) {
    console.error('Error creating completion certificate:', err);
    res.status(500).json({ error: 'Failed to create completion certificate' });
  }
});

app.put('/api/completion-certificates/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const data = stripUndefinedFields({ ...req.body });
    delete data.id;
    data.updated_at = new Date().toISOString();
    const ref = db.collection('completion_certificates').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Completion certificate not found' });
    await ref.update(data);
    res.json({ ...doc.data(), ...data, id: ref.id });
  } catch (err) {
    console.error('Error updating completion certificate:', err);
    res.status(500).json({ error: 'Failed to update completion certificate' });
  }
});

app.delete('/api/completion-certificates/:id', async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;
  const { id } = req.params;
  try {
    const ref = db.collection('completion_certificates').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Completion certificate not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting completion certificate:', err);
    res.status(500).json({ error: 'Failed to delete completion certificate' });
  }
});

// ─── DTR Aggregation (for payroll auto-populate) ────────────────────────────
app.get('/api/dtr/aggregate', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { periodStart, periodEnd } = req.query;
  if (!periodStart || !periodEnd) return res.status(400).json({ error: 'periodStart and periodEnd required' });
  try {
    // Fetch all DTR entries within the date range
    const snap = await db.collection('dtr_entries')
      .where('entryDate', '>=', periodStart)
      .where('entryDate', '<=', periodEnd)
      .get();

    // Group by employeeId and aggregate
    const byEmployee = {};
    snap.docs.forEach(d => {
      const entry = d.data();
      const eid = entry.employeeId;
      if (!byEmployee[eid]) {
        byEmployee[eid] = {
          employeeId: eid,
          workingDays: 0,
          regularHours: 0,
          overtimeHours: 0,
          nightDiffHours: 0,
          tardinessMinutes: 0,
          regularHolidayDays: 0,
          specialHolidayDays: 0,
          restDayOTHours: 0,
          regularHolidayOTHours: 0,
          regularHolidayRestDayDays: 0,
          specialHolidayRestDayDays: 0,
          regularHolidayRestDayOTHours: 0,
          specialHolidayRestDayOTHours: 0,
        };
      }
      const agg = byEmployee[eid];
      if (!entry.isAbsent) {
        // No inputted hours = no pay. A REGULAR day only counts as a working day
        // when hours were actually recorded (computed from time-in/out on save, or
        // entered manually for paid leave). A blank day earns nothing.
        const hasHours = (Number(entry.regularHours) || 0) > 0;
        if (entry.dayType === 'REGULAR') { if (hasHours) agg.workingDays++; }
        else if (entry.dayType === 'REST_DAY') { /* rest day doesn't count as working day unless OT */ }
        else if (entry.dayType === 'REGULAR_HOLIDAY') agg.regularHolidayDays++;
        else if (entry.dayType === 'SPECIAL_HOLIDAY') agg.specialHolidayDays++;
        else if (entry.dayType === 'DOUBLE_HOLIDAY') { agg.regularHolidayDays++; agg.specialHolidayDays++; }
      }
      agg.regularHours += Number(entry.regularHours) || 0;
      agg.overtimeHours += Number(entry.overtimeHours) || 0;
      agg.nightDiffHours += Number(entry.nightDiffHours) || 0;
      agg.tardinessMinutes += Number(entry.tardinessMinutes) || 0;
    });

    // Look up submitter names for each DTR employeeId (user account). Batch the
    // reads in parallel instead of awaiting one doc at a time (was O(n) serial).
    const submitterIds = Object.keys(byEmployee);
    const submitters = {};
    try {
      const userDocs = await Promise.all(
        submitterIds.map((uid) => db.collection('users').doc(uid).get().catch(() => null)),
      );
      submitterIds.forEach((uid, i) => {
        const uDoc = userDocs[i];
        const u = uDoc && uDoc.exists ? uDoc.data() : null;
        submitters[uid] = (u && (u.full_name || u.username)) || uid;
      });
    } catch (e) {
      console.error('GET /api/dtr/aggregate submitter lookup error:', e);
      submitterIds.forEach((uid) => { submitters[uid] = submitters[uid] || uid; });
    }

    res.json({ success: true, aggregates: byEmployee, submitters });
  } catch (err) {
    console.error('GET /api/dtr/aggregate error:', err);
    res.status(500).json({ error: 'Failed to aggregate DTR entries' });
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
  if (!isAdmin && String(employeeId) !== String(user.id)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const snap = await db.collection('dtr_entries').where('employeeId', '==', employeeId).get();
    const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    res.json(entries);
  } catch (e) {
    console.error('GET /api/dtr error:', e);
    res.status(500).json({ error: 'Failed to fetch DTR entries' });
  }
});

// Normalize a clock-in/out GPS fix to { lat, lng, accuracy } numbers, or null.
function sanitizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const accuracy = Number(loc.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : null };
}

// True when an employee's DTR date sits inside a PAID payroll period. Mirrors the
// employee-portal paid-date lock (isPaidDate) so the server enforces it too — an
// employee must not be able to edit/create a punch after that period is paid.
async function isDtrDateLocked(employeeId, entryDate) {
  const date = String(entryDate || '').slice(0, 10);
  if (!employeeId || !date) return false;
  const runs = await db.collection('payroll_runs').where('status', '==', 'PAID').get();
  for (const run of runs.docs) {
    const d = run.data();
    const start = String(d.periodStart || '').slice(0, 10);
    const end = String(d.periodEnd || '').slice(0, 10);
    if (!start || !end || date < start || date > end) continue;
    // Confirm this employee was actually included in the paid run.
    const slip = await run.ref.collection('payslips').doc(String(employeeId)).get();
    if (slip.exists) return true;
  }
  return false;
}

app.post('/api/dtr', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { employeeId, entryDate, timeIn, timeOut, dayType, regularHours, overtimeHours, nightDiffHours, isAbsent, tardinessMinutes, remarks, clockInLocation, clockOutLocation, projectId, projectName } = req.body;
  if (!employeeId || !entryDate || !dayType) return res.status(400).json({ error: 'employeeId, entryDate, and dayType are required' });
  // Non-admin users can only create entries for themselves
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (!isAdmin && String(employeeId) !== String(user.id)) return res.status(403).json({ error: 'Forbidden' });
  // Employees can't create a punch inside an already-paid period (admins may correct).
  if (!isAdmin && await isDtrDateLocked(employeeId, entryDate)) {
    return res.status(409).json({ error: 'This date is in a paid payroll period and is locked.' });
  }
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
      timeIn: timeIn || '',
      timeOut: timeOut || '',
      dayType,
      regularHours: Number(regularHours) || 0,
      overtimeHours: Number(overtimeHours) || 0,
      nightDiffHours: Number(nightDiffHours) || 0,
      isAbsent: !!isAbsent,
      tardinessMinutes: Number(tardinessMinutes) || 0,
      remarks: remarks || '',
      projectId: projectId || null,
      projectName: projectName || null,
      clockInLocation: sanitizeLocation(clockInLocation),
      clockOutLocation: sanitizeLocation(clockOutLocation),
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
    if (!isAdmin && String(data.employeeId) !== String(user.id)) return res.status(403).json({ error: 'Forbidden' });
    // Locked once the covering payroll period is paid (admins may still correct).
    if (!isAdmin && await isDtrDateLocked(data.employeeId, data.entryDate)) {
      return res.status(409).json({ error: 'This date is in a paid payroll period and is locked.' });
    }
    const { employeeId, id: _id, ...updates } = req.body;
    // Normalize location payloads so we never store arbitrary client objects.
    if ('clockInLocation' in updates) updates.clockInLocation = sanitizeLocation(updates.clockInLocation);
    if ('clockOutLocation' in updates) updates.clockOutLocation = sanitizeLocation(updates.clockOutLocation);
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
    if (!isAdmin && String(data.employeeId) !== String(user.id)) return res.status(403).json({ error: 'Forbidden' });
    // Locked once the covering payroll period is paid (admins may still correct).
    if (!isAdmin && await isDtrDateLocked(data.employeeId, data.entryDate)) {
      return res.status(409).json({ error: 'This date is in a paid payroll period and is locked.' });
    }
    await docRef.delete();
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/dtr/:id error:', e);
    res.status(500).json({ error: 'Failed to delete DTR entry' });
  }
});

// ─── Work Sites ───────────────────────────────────────────────────────────────
// Named locations (name + coordinates) used to attribute clocked hours to a site
// on the per-employee hours dashboard. Reads: any active user. Writes: payroll.
app.get('/api/work-sites', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  try {
    const snap = await db.collection('work_sites').orderBy('name').get();
    const sites = snap.docs.map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; });
    res.json({ success: true, sites });
  } catch (e) {
    console.error('GET /api/work-sites error:', e);
    res.status(500).json({ error: 'Failed to get work sites' });
  }
});

// Suggest site coordinates from where employees actually clocked in: greedily
// cluster recorded clock-in/out GPS points (~75m) and return the busiest spots.
function haversineMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

app.get('/api/work-sites/suggestions', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const snap = await db.collection('dtr_entries').orderBy('entryDate', 'desc').limit(2000).get();
    const pts = [];
    snap.docs.forEach((d) => {
      const e = d.data();
      for (const loc of [e.clockInLocation, e.clockOutLocation]) {
        if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
          pts.push({ lat: Number(loc.lat), lng: Number(loc.lng), date: e.entryDate || '' });
        }
      }
    });
    const clusters = [];
    for (const p of pts) {
      const c = clusters.find((cl) => haversineMeters(cl.lat, cl.lng, p.lat, p.lng) <= 75);
      if (c) {
        c.lat = (c.lat * c.count + p.lat) / (c.count + 1);
        c.lng = (c.lng * c.count + p.lng) / (c.count + 1);
        c.count += 1;
        if (p.date > c.lastSeen) c.lastSeen = p.date;
      } else {
        clusters.push({ lat: p.lat, lng: p.lng, count: 1, lastSeen: p.date });
      }
    }
    clusters.sort((a, b) => b.count - a.count);
    res.json({ success: true, points: clusters.slice(0, 30) });
  } catch (e) {
    console.error('GET /api/work-sites/suggestions error:', e);
    res.status(500).json({ error: 'Failed to suggest clock-in points' });
  }
});

app.post('/api/work-sites', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  const { name, lat, lng, radiusMeters } = req.body || {};
  if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: 'name, lat, lng are required' });
  }
  try {
    const now = new Date().toISOString();
    const site = {
      name: String(name).trim(),
      lat: Number(lat),
      lng: Number(lng),
      radiusMeters: Number(radiusMeters) > 0 ? Number(radiusMeters) : 150,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection('work_sites').add(site);
    res.status(201).json({ ...site, id: ref.id });
  } catch (e) {
    console.error('POST /api/work-sites error:', e);
    res.status(500).json({ error: 'Failed to create work site' });
  }
});

app.put('/api/work-sites/:id', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    const { id: _id, ...body } = req.body || {};
    const updates = { updatedAt: new Date().toISOString() };
    if (body.name != null) updates.name = String(body.name).trim();
    if (Number.isFinite(Number(body.lat))) updates.lat = Number(body.lat);
    if (Number.isFinite(Number(body.lng))) updates.lng = Number(body.lng);
    if (Number(body.radiusMeters) > 0) updates.radiusMeters = Number(body.radiusMeters);
    await db.collection('work_sites').doc(req.params.id).update(updates);
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /api/work-sites/:id error:', e);
    res.status(500).json({ error: 'Failed to update work site' });
  }
});

app.delete('/api/work-sites/:id', async (req, res) => {
  const user = await requirePayrollAccess(req, res); if (!user) return;
  try {
    await db.collection('work_sites').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/work-sites/:id error:', e);
    res.status(500).json({ error: 'Failed to delete work site' });
  }
});

// ─── Pricelists ───────────────────────────────────────────────────────────────
// Read-only catalog for the Sales pricelist browser (seeded by import scripts).
// Filters applied in memory (collection is small, equality/range only).
app.get('/api/pricelists', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  try {
    const snap = await db.collection('pricelist_items').get();
    let items = snap.docs.map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; });

    const { search, poles, minPrice, maxPrice } = req.query;
    const categories = [].concat(req.query.category || []).filter(Boolean);
    const brands = [].concat(req.query.brand || []).filter(Boolean);
    if (categories.length) items = items.filter((i) => categories.includes(i.category));
    if (brands.length) items = items.filter((i) => brands.includes(i.brand));
    if (poles != null && poles !== '') items = items.filter((i) => Number(i.poles) === Number(poles));
    if (minPrice != null && minPrice !== '') items = items.filter((i) => Number(i.sellingPrice) >= Number(minPrice));
    if (maxPrice != null && maxPrice !== '') items = items.filter((i) => Number(i.sellingPrice) <= Number(maxPrice));
    if (search) {
      const t = String(search).toLowerCase();
      items = items.filter((i) =>
        [i.catalogNo, i.description, i.brand, i.category, i.abbRefNo, i.sepEquivalent]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
    }
    res.json({ success: true, items });
  } catch (e) {
    console.error('GET /api/pricelists error:', e);
    res.status(500).json({ error: 'Failed to fetch pricelist' });
  }
});

app.get('/api/pricelists/filters', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  try {
    const snap = await db.collection('pricelist_items').get();
    const suppliers = new Set(), brands = new Set(), categories = new Set(), poles = new Set();
    snap.docs.forEach((d) => {
      const i = d.data();
      if (i.supplier) suppliers.add(i.supplier);
      if (i.brand) brands.add(i.brand);
      if (i.category) categories.add(i.category);
      if (Number.isFinite(Number(i.poles)) && i.poles) poles.add(Number(i.poles));
    });
    res.json({
      suppliers: Array.from(suppliers).sort(),
      brands: Array.from(brands).sort(),
      categories: Array.from(categories).sort(),
      poles: Array.from(poles).sort((a, b) => a - b),
    });
  } catch (e) {
    console.error('GET /api/pricelists/filters error:', e);
    res.status(500).json({ error: 'Failed to fetch pricelist filters' });
  }
});

// Normalize a pricelist item payload from the manual add/edit form.
function pricelistItemFromBody(b) {
  const numOrNull = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    supplier: String(b.supplier || 'IOCT').trim(),
    brand: String(b.brand || '').trim(),
    pricelistName: String(b.pricelistName || 'Manual entries').trim(),
    pricelistDate: String(b.pricelistDate || new Date().toISOString().slice(0, 7)),
    category: String(b.category || 'Uncategorized').trim(),
    categoryLabel: String(b.categoryLabel || b.category || 'Uncategorized').trim(),
    catalogNo: String(b.catalogNo || '').trim(),
    abbRefNo: String(b.abbRefNo || '').trim(),
    description: String(b.description || '').trim(),
    uom: String(b.uom || 'pc').trim(),
    poles: numOrNull(b.poles),
    ampRating: numOrNull(b.ampRating),
    sellingPrice: Number(b.sellingPrice) || 0,
    sepEquivalent: String(b.sepEquivalent || '').trim() || null,
  };
}

const PRICELIST_AUDIT_FIELDS = ['description', 'sellingPrice', 'uom', 'category', 'brand', 'supplier', 'catalogNo', 'poles', 'ampRating', 'sepEquivalent'];
async function logPricelistAudit(entry) {
  try { await db.collection('pricelist_audit').add(entry); }
  catch (e) { console.warn('[pricelist] audit write failed (non-blocking):', e && e.message); }
}

app.post('/api/pricelists', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  const b = req.body || {};
  if (!b.description || !(Number(b.sellingPrice) >= 0)) {
    return res.status(400).json({ error: 'description and a numeric sellingPrice are required' });
  }
  try {
    const now = new Date().toISOString();
    const who = user.full_name || user.username || String(user.id);
    const item = pricelistItemFromBody(b);
    if (!item.catalogNo) item.catalogNo = `MAN-${Date.now().toString(36).toUpperCase()}`;
    item.createdAt = now; item.updatedAt = now;
    item.createdBy = who; item.updatedBy = who;
    const ref = await db.collection('pricelist_items').add(item);
    await logPricelistAudit({ itemId: ref.id, catalogNo: item.catalogNo, action: 'create', snapshot: { description: item.description, sellingPrice: item.sellingPrice }, byId: String(user.id), byName: who, at: now });
    res.status(201).json({ ...item, id: ref.id });
  } catch (e) {
    console.error('POST /api/pricelists error:', e);
    res.status(500).json({ error: 'Failed to create pricelist item' });
  }
});

app.put('/api/pricelists/:id', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  const b = req.body || {};
  if (!b.description || !(Number(b.sellingPrice) >= 0)) {
    return res.status(400).json({ error: 'description and a numeric sellingPrice are required' });
  }
  try {
    const now = new Date().toISOString();
    const who = user.full_name || user.username || String(user.id);
    const ref = db.collection('pricelist_items').doc(req.params.id);
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? prevSnap.data() : {};
    const updates = pricelistItemFromBody(b);
    updates.updatedAt = now; updates.updatedBy = who;
    await ref.update(updates);
    const changes = {};
    for (const f of PRICELIST_AUDIT_FIELDS) {
      const from = prev[f] ?? null, to = updates[f] ?? null;
      if (String(from) !== String(to)) changes[f] = { from, to };
    }
    if (Object.keys(changes).length) {
      await logPricelistAudit({ itemId: req.params.id, catalogNo: updates.catalogNo, action: 'update', changes, byId: String(user.id), byName: who, at: now });
    }
    res.json({ success: true, ...updates, id: req.params.id });
  } catch (e) {
    console.error('PUT /api/pricelists/:id error:', e);
    res.status(500).json({ error: 'Failed to update pricelist item' });
  }
});

app.delete('/api/pricelists/:id', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  try {
    const now = new Date().toISOString();
    const who = user.full_name || user.username || String(user.id);
    const ref = db.collection('pricelist_items').doc(req.params.id);
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? prevSnap.data() : {};
    await ref.delete();
    await logPricelistAudit({ itemId: req.params.id, catalogNo: prev.catalogNo || null, action: 'delete', snapshot: { description: prev.description, sellingPrice: prev.sellingPrice }, byId: String(user.id), byName: who, at: now });
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/pricelists/:id error:', e);
    res.status(500).json({ error: 'Failed to delete pricelist item' });
  }
});

app.get('/api/pricelists/:id/audit', async (req, res) => {
  const user = await requireActiveUser(req, res); if (!user) return;
  try {
    const snap = await db.collection('pricelist_audit').where('itemId', '==', req.params.id).get();
    const entries = snap.docs
      .map((d) => { const { id: _id, ...data } = d.data(); return { ...data, id: d.id }; })
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    res.json({ success: true, entries });
  } catch (e) {
    console.error('GET /api/pricelists/:id/audit error:', e);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// ========== ONEDRIVE / MICROSOFT GRAPH HEALTH ==========
// Smoke test for server-side app-only Graph auth. Never exposes token/secret.
app.get('/api/onedrive/health', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    res.json({ ok: true, owner: process.env.ONEDRIVE_DRIVE_OWNER, driveId, tokenCached: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== APP-ONLY ONEDRIVE FILE OPERATIONS (Phase A) ==========
// Idempotently ensure a nested folder path exists under the drive root; returns the deepest folder's { id, webUrl, name }.
async function ensureFolderByPath(token, driveId, folderPath) {
  const segments = String(folderPath).split('/').map((s) => s.trim()).filter(Boolean);
  let parentPath = '';
  let current = null;
  for (const name of segments) {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    // lookup-first
    const enc = fullPath.split('/').map(encodeURIComponent).join('/');
    const lookup = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${enc}`, { headers: { Authorization: 'Bearer ' + token } });
    if (lookup.ok) { current = await lookup.json(); parentPath = fullPath; continue; }
    // create
    const encParent = parentPath ? parentPath.split('/').map(encodeURIComponent).join('/') : '';
    const createUrl = parentPath
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encParent}:/children`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;
    const cr = await fetch(createUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
    if (cr.status === 409) {
      const again = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${enc}`, { headers: { Authorization: 'Bearer ' + token } });
      current = await again.json();
    } else if (cr.ok) {
      current = await cr.json();
    } else {
      const t = await cr.text().catch(() => '');
      throw new Error(`Folder create failed (${cr.status}) at "${fullPath}": ${t.slice(0, 300)}`);
    }
    parentPath = fullPath;
  }
  if (!current) throw new Error('Empty folder path');
  return { id: current.id, webUrl: current.webUrl || '', name: current.name };
}

function contentTypeForFilename(filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

// 1. Upload a base64 file into a folder path (folder ensured idempotently).
app.post('/api/onedrive/upload', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { folderPath, filename, contentBase64 } = req.body || {};
  if (!folderPath || !filename || !contentBase64) {
    return res.status(400).json({ error: 'folderPath, filename, and contentBase64 are required' });
  }
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const folder = await ensureFolderByPath(token, driveId, folderPath);
    const buf = Buffer.from(contentBase64, 'base64');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(filename)}:/content`,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': contentTypeForFilename(filename) }, body: buf }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Upload failed (${r.status}): ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    res.json({ ok: true, id: data.id, webUrl: data.webUrl });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 2. Delete an item by id (404 treated as success — already gone).
app.delete('/api/onedrive/item/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(req.params.id)}`,
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
    );
    if (!r.ok && r.status !== 404) {
      const t = await r.text().catch(() => '');
      throw new Error(`Delete failed (${r.status}): ${t.slice(0, 300)}`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 3. Medium thumbnail URL for an item.
app.get('/api/onedrive/item/:id/thumbnail', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(req.params.id)}/thumbnails/0/medium`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (r.ok) {
      const json = await r.json();
      if (json && json.url) return res.json({ ok: true, url: json.url });
    }
    res.json({ ok: false });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 4. Stream an item's raw bytes (Graph redirects to content; fetch follows).
app.get('/api/onedrive/item/:id/content', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(req.params.id)}/content`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Content fetch failed (${r.status}): ${t.slice(0, 300)}`);
    }
    const ab = await r.arrayBuffer();
    res.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.send(Buffer.from(ab));
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 4b. Overwrite an existing item's bytes in place — id and webUrl stay the same,
// so no Firestore/receipts_json reference ever needs to change. Used to bake a
// client-side receipt rotation into the stored file so a plain download (or
// OneDrive itself) shows it upright, not just this app's in-viewer CSS rotate.
app.put('/api/onedrive/item/:id/content', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { contentBase64 } = req.body || {};
  if (!contentBase64) return res.status(400).json({ error: 'contentBase64 is required' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const buf = Buffer.from(contentBase64, 'base64');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(req.params.id)}/content`,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'image/jpeg' }, body: buf }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Replace content failed (${r.status}): ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    res.json({ ok: true, id: data.id, webUrl: data.webUrl });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 5. Ensure a folder path exists.
app.post('/api/onedrive/ensure-folder', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { path: folderPath } = req.body || {};
  if (!folderPath) return res.status(400).json({ error: 'path is required' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const f = await ensureFolderByPath(token, driveId, folderPath);
    res.json({ ok: true, id: f.id, webUrl: f.webUrl });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// 6. Move (and optionally rename) an item into a destination folder path.
app.post('/api/onedrive/move', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { itemId, destPath, name } = req.body || {};
  if (!itemId || !destPath) return res.status(400).json({ error: 'itemId and destPath are required' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const dest = await ensureFolderByPath(token, driveId, destPath);
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentReference: { id: dest.id }, ...(name ? { name } : {}) }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Move failed (${r.status}): ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    res.json({ ok: true, id: data.id, webUrl: data.webUrl });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// Upload a file directly into a folder identified by its drive item id.
app.post('/api/onedrive/upload-by-id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { folderId, filename, contentBase64 } = req.body || {};
  if (!folderId || !filename || !contentBase64) {
    return res.status(400).json({ error: 'folderId, filename and contentBase64 are required' });
  }
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const buf = Buffer.from(contentBase64, 'base64');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': contentTypeForFilename(filename) }, body: buf }
    );
    if (!r.ok) throw new Error('upload-by-id failed ' + r.status + ' ' + (await r.text()).slice(0, 300));
    const data = await r.json();
    res.json({ ok: true, id: data.id, webUrl: data.webUrl });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// Metadata lookup by drive item id. Placed AFTER /item/:id/thumbnail and /item/:id/content.
app.get('/api/onedrive/item/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(req.params.id)}?$select=id,webUrl,name`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (r.status === 404 || r.status === 410) return res.json({ ok: false });
    if (!r.ok) throw new Error('item meta failed ' + r.status);
    const d = await r.json();
    res.json({ ok: true, id: d.id, webUrl: d.webUrl, name: d.name });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// Resolve a drive item by its path under the corporate drive root.
app.get('/api/onedrive/by-path', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.query.path) return res.status(400).json({ error: 'path is required' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const enc = String(req.query.path).split('/').map(encodeURIComponent).join('/');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${enc}?$select=id,webUrl,name`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (r.status === 404) return res.json({ ok: false });
    if (!r.ok) throw new Error('by-path failed ' + r.status);
    const d = await r.json();
    res.json({ ok: true, id: d.id, webUrl: d.webUrl, name: d.name });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// List children of a folder (by path; empty path = root) with optional name-prefix filter.
app.get('/api/onedrive/children', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const path = req.query.path ? String(req.query.path) : '';
    const prefix = req.query.prefix ? String(req.query.prefix).toLowerCase() : '';
    const enc = path ? path.split('/').map(encodeURIComponent).join('/') : '';
    const url = path
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${enc}:/children?$top=500&$select=id,webUrl,name,folder`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$top=500&$select=id,webUrl,name,folder`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 404) return res.json({ ok: true, items: [] });
    if (!r.ok) throw new Error('children failed ' + r.status);
    const d = await r.json();
    let items = (d.value || []).map(x => ({ id: x.id, webUrl: x.webUrl, name: x.name, isFolder: !!x.folder }));
    if (prefix) items = items.filter(x => (x.name || '').toLowerCase().startsWith(prefix));
    res.json({ ok: true, items });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// Get-or-create a child folder under a parent identified by its drive item id.
app.post('/api/onedrive/child-folder', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { parentId, name } = req.body || {};
  if (!parentId || !name) return res.status(400).json({ error: 'parentId and name are required' });
  try {
    const token = await getGraphAppToken();
    const driveId = await resolveCorporateDriveId(token);
    const cr = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(parentId)}/children`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) }
    );
    if (cr.status === 409) {
      // already exists — find it among children
      const lr = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$top=500&$select=id,webUrl,name`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      const ld = await lr.json();
      const found = (ld.value || []).find(x => x.name === name);
      if (found) return res.json({ ok: true, id: found.id, webUrl: found.webUrl, name: found.name });
      throw new Error('child-folder 409 but not found');
    }
    if (!cr.ok) throw new Error('child-folder failed ' + cr.status + ' ' + (await cr.text()).slice(0, 200));
    const d = await cr.json();
    res.json({ ok: true, id: d.id, webUrl: d.webUrl, name: d.name });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// Resolve a sharing URL to the underlying drive item.
app.post('/api/onedrive/share', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const token = await getGraphAppToken();
    const u = String(url);
    const b64 = Buffer.from(u).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/shares/u!${b64}/driveItem?$select=id,webUrl,name,folder`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!r.ok) throw new Error('share resolve failed ' + r.status);
    const d = await r.json();
    res.json({ ok: true, id: d.id, webUrl: d.webUrl, name: d.name, isFolder: !!d.folder });
  } catch (err) {
    res.status(502).json({ error: 'OneDrive operation failed', detail: err.message });
  }
});

// ========== QR PHONE-PAIRING AUTH (Phase C) ==========
// Desktop user starts a pairing — short-lived token encoded into a QR code.
app.post('/api/auth/qr/start', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { context } = req.body || {};
  try {
    // Invalidate any prior unused pairings for this user (caps active codes; complements single-use).
    const prior = await db.collection('qr_pairings').where('userId', '==', user.id).where('used', '==', false).get();
    if (!prior.empty) { const b = db.batch(); prior.docs.forEach((d) => b.delete(d.ref)); await b.commit(); }
    const pairingToken = crypto.randomBytes(24).toString('hex');
    await db.collection('qr_pairings').doc(pairingToken).set({
      token: pairingToken,
      userId: user.id,
      username: user.username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 120000,
      used: false,
      ...(context && typeof context === 'object' ? { context } : {}),
    });
    if (context && typeof context === 'object') {
      await db.collection('scan_jobs').doc(pairingToken).set({
        jobId: pairingToken,
        userId: user.id,
        context,
        results: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60000,
      });
    }
    res.json({ ok: true, pairingToken, expiresInMs: 120000 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start pairing', detail: err.message });
  }
});

// Phone scans the QR and exchanges the pairing token for a scanner session token. PUBLIC.
app.post('/api/auth/qr/exchange', async (req, res) => {
  const { pairingToken } = req.body || {};
  if (!pairingToken) return res.status(400).json({ error: 'pairingToken is required' });
  try {
    const pairRef = db.collection('qr_pairings').doc(pairingToken);
    // Atomically validate + mark used so a pairing token can never be exchanged twice (TOCTOU-safe).
    let pairing;
    try {
      pairing = await db.runTransaction(async (tx) => {
        const snap = await tx.get(pairRef);
        if (!snap.exists) { const e = new Error('Invalid code'); e.httpStatus = 404; throw e; }
        const p = snap.data();
        if (p.used === true) { const e = new Error('Code already used'); e.httpStatus = 410; throw e; }
        if (Date.now() > p.expiresAt) { const e = new Error('Code expired'); e.httpStatus = 410; throw e; }
        tx.update(pairRef, { used: true });
        return p;
      });
    } catch (e) {
      if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
      throw e;
    }
    const userDoc = await db.collection('users').doc(pairing.userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const scannerToken = 'scan_' + crypto.randomBytes(24).toString('hex');
    // Expire at the next midnight in PH time (UTC+8), independent of the server's timezone.
    // Shift now into PH wall-clock, snap to next midnight, then shift back to real UTC.
    const PH_OFFSET = 8 * 3600000;
    const phMidnight = new Date(Date.now() + PH_OFFSET);
    phMidnight.setUTCHours(24, 0, 0, 0);
    const expiresAt = phMidnight.getTime() - PH_OFFSET;
    await db.collection('scanner_sessions').doc(scannerToken).set({
      token: scannerToken,
      userId: pairing.userId,
      username: pairing.username,
      createdAt: Date.now(),
      expiresAt,
    });
    res.json({ ok: true, token: scannerToken, user: userResponse(userDoc.id, userDoc.data()), expiresAt, context: pairing.context || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to exchange code', detail: err.message });
  }
});

// Desktop polls whether the QR has been scanned/paired yet.
app.get('/api/auth/qr/status', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { pairingToken } = req.query || {};
  if (!pairingToken) return res.status(400).json({ error: 'pairingToken is required' });
  try {
    const pairSnap = await db.collection('qr_pairings').doc(String(pairingToken)).get();
    const pairing = pairSnap.exists ? pairSnap.data() : null;
    res.json({ ok: true, paired: !!(pairing && pairing.used) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read pairing status', detail: err.message });
  }
});

// Phone posts a captured-and-uploaded receipt back to the scan job channel.
// Auth: scanner session (or login token) of the SAME user who started the job.
app.post('/api/scan-jobs/:jobId/result', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { jobId } = req.params;
  const { receipt } = req.body || {};
  if (!receipt || typeof receipt !== 'object' || !receipt.oneDriveId) {
    return res.status(400).json({ error: 'receipt with oneDriveId is required' });
  }
  // Bound the stored thumbnail so a doc can never blow the 1MB Firestore limit.
  const clean = {
    oneDriveId: String(receipt.oneDriveId),
    webUrl: receipt.webUrl ? String(receipt.webUrl) : '',
    filename: receipt.filename ? String(receipt.filename) : 'receipt.jpg',
  };
  if (typeof receipt.thumbnailDataUrl === 'string' && receipt.thumbnailDataUrl.length <= 18000) {
    clean.thumbnailDataUrl = receipt.thumbnailDataUrl;
  }
  if (receipt.parsed && typeof receipt.parsed === 'object') {
    const p = receipt.parsed;
    clean.parsed = {
      amount: typeof p.amount === 'number' ? p.amount : null,
      date: p.date ? String(p.date) : null,
      category: p.category ? String(p.category) : null,
      particulars: p.particulars ? String(p.particulars) : null,
      vendor: p.vendor ? String(p.vendor) : null,
      invoiceNo: p.invoiceNo ? String(p.invoiceNo) : null,
      deductible: typeof p.deductible === 'boolean' ? p.deductible : null,
      deductibleReason: p.deductibleReason ? String(p.deductibleReason) : null,
      customerInfoIssues: Array.isArray(p.customerInfoIssues)
        ? p.customerInfoIssues.filter((x) => typeof x === 'string').slice(0, 10).map((x) => String(x).slice(0, 300))
        : [],
      confidence: typeof p.confidence === 'number' ? p.confidence : null,
    };
  }
  try {
    const ref = db.collection('scan_jobs').doc(jobId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) { const e = new Error('Scan job not found'); e.httpStatus = 404; throw e; }
      const job = snap.data();
      if (job.userId !== user.id) { const e = new Error('Forbidden'); e.httpStatus = 403; throw e; }
      const results = Array.isArray(job.results) ? job.results : [];
      if (results.length >= 50) { const e = new Error('Too many results'); e.httpStatus = 409; throw e; }
      results.push(clean);
      tx.update(ref, { results, updatedAt: Date.now() });
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    res.status(500).json({ error: 'Failed to record scan result', detail: err.message });
  }
});

// Desktop polls for new receipts on a scan job. Owner-only. `since` = count already seen.
app.get('/api/scan-jobs/:jobId', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { jobId } = req.params;
  try {
    const snap = await db.collection('scan_jobs').doc(jobId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Scan job not found' });
    const job = snap.data();
    if (job.userId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    const all = Array.isArray(job.results) ? job.results : [];
    const since = Math.max(0, Number(req.query.since) || 0);
    res.json({ ok: true, results: all.slice(since), total: all.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scan job', detail: err.message });
  }
});

// --- BEGIN RECEIPT PARSING BLOCK ---
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('NO_JSON_IN_RESPONSE');
  return text.slice(start, end + 1);
}

const IOCT_CUSTOMER = { name: 'IO Control Technologie OPC', tinDigits: '697029976' };

// Levenshtein edit distance — tolerates OCR/typo wobble (e.g. "Techonologie"
// for "Technologie", anglicized "Technology") when matching the customer name.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function validateCustomerInfo(name, tin, address) {
  const norm = (s) => (typeof s === 'string' ? s : '').toLowerCase().replace(/ñ/g, 'n').replace(/[^a-z0-9]/g, '');
  const issues = [];
  const nName = norm(name);
  // Require the COMPLETE, correctly-spelled registered name. Allow only a single
  // OCR/handwriting slip (e.g. "TECHONOLOGIE" = 1 edit → OK) but reject WRONG
  // spellings like "Technology" (2 edits) and any abbreviation/incomplete name
  // (e.g. just "IO Control", or missing "OPC" = 3+ edits).
  const canonicalName = norm(IOCT_CUSTOMER.name); // "iocontroltechnologieopc"
  const nameOk = nName.length > 0 && levenshtein(nName, canonicalName) <= 1;
  if (!name || norm(name).length === 0) issues.push('Customer name is missing on the receipt');
  else if (!nameOk) issues.push(`Customer name on receipt ("${String(name).trim()}") does not match "IO Control Technologie OPC"`);
  const tinDigits = (typeof tin === 'string' ? tin : '').replace(/\D/g, '');
  const tinOk = tinDigits.startsWith(IOCT_CUSTOMER.tinDigits);
  if (!tin || tinDigits.length === 0) issues.push('Customer TIN is missing on the receipt');
  else if (!tinOk) issues.push(`Customer TIN on receipt ("${String(tin).trim()}") does not match 697-029-976`);
  const nAddr = norm(address);
  const addressOk = nAddr.includes('binan');
  if (!address || nAddr.length === 0) issues.push('Customer address is missing on the receipt');
  else if (!addressOk) issues.push(`Customer address on receipt ("${String(address).trim()}") does not look like Biñan, Laguna`);
  return { nameOk, tinOk, addressOk, issues };
}

function normalizeReceipt(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_JSON_OBJECT');
  const safeNum = (val) => {
    if (typeof val !== 'number' && typeof val !== 'string') return null;
    if (typeof val === 'string' && val.trim() === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };

  const allowedCategories = ['Tools / Direct', 'Gas', 'Materials', 'Transportation', 'Accommodation', '3rd Party Labor', 'Others'];
  const dateMatch = (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) ? raw.date : null;
  const suggestedCategory = allowedCategories.includes(raw.suggestedCategory) ? raw.suggestedCategory : 'Others';

  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems.filter(item => item && typeof item === 'object').map(item => ({
    description: typeof item.description === 'string' ? item.description : String(item.description || ''),
    qty: safeNum(item.qty),
    unitPrice: safeNum(item.unitPrice),
    amount: safeNum(item.amount)
  })) : [];

  const allowedInvoiceTypes = ['Service Invoice', 'Sales Invoice', 'Official Receipt', 'Other'];
  const invoiceType = allowedInvoiceTypes.includes(raw.invoiceType) ? raw.invoiceType : null;
  const vatable = typeof raw.vatable === 'boolean' ? raw.vatable : null;
  const deductible = typeof raw.deductible === 'boolean' ? raw.deductible : null;
  const deductibleReason = (typeof raw.deductibleReason === 'string' && raw.deductibleReason.trim().length > 0) ? raw.deductibleReason.trim() : null;

  const customerName = (typeof raw.customerName === 'string' && raw.customerName.trim().length > 0) ? raw.customerName.trim() : null;
  const customerTin = (typeof raw.customerTin === 'string' && raw.customerTin.trim().length > 0) ? raw.customerTin.trim() : null;
  const customerAddress = (typeof raw.customerAddress === 'string' && raw.customerAddress.trim().length > 0) ? raw.customerAddress.trim() : null;
  const customerValidation = validateCustomerInfo(customerName, customerTin, customerAddress);

  const hasCustomerIssues = customerValidation.issues.length > 0;
  const finalDeductible = hasCustomerIssues ? false : deductible;
  const issuesPrefix = hasCustomerIssues
    ? customerValidation.issues.join('; ')
    : null;
  const finalDeductibleReason = hasCustomerIssues
    ? (deductibleReason ? `${issuesPrefix}. ${deductibleReason}` : issuesPrefix)
    : deductibleReason;

  return {
    vendor: typeof raw.vendor === 'string' ? raw.vendor : null,
    description: (typeof raw.description === 'string' && raw.description.trim().length > 0) ? raw.description.trim() : null,
    invoiceNumber: (typeof raw.invoiceNumber === 'string' && raw.invoiceNumber.trim().length > 0) ? raw.invoiceNumber.trim() : null,
    invoiceType,
    date: dateMatch,
    currency: (typeof raw.currency === 'string' && raw.currency.trim().length > 0) ? raw.currency.trim() : 'PHP',
    subtotal: safeNum(raw.subtotal),
    tax: safeNum(raw.tax),
    vatable,
    total: safeNum(raw.total),
    paymentMethod: typeof raw.paymentMethod === 'string' ? raw.paymentMethod : null,
    suggestedCategory,
    deductible: finalDeductible,
    deductibleReason: finalDeductibleReason,
    customerName,
    customerTin,
    customerAddress,
    customerValidation,
    lineItems,
    confidence
  };
}

async function parseReceiptWithGemini(imageBase64, mimeType) {
  const { GoogleGenerativeAI } = require('@google/generative-ai'); // Lazy require
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });

  const RECEIPT_PROMPT = `You are an expert AI data extraction assistant. Extract receipt data from the provided image/pdf into a strict JSON object.
Do NOT wrap the output in markdown code blocks. Output ONLY valid, parsable JSON.
If a value is not found or unreadable, use null.
Remove all currency symbols (e.g., ', '₱', 'PHP') and commas from numeric values before outputting.

The JSON MUST exactly match this structure:
{
  "vendor": "The SELLER's business / trade name — the main business name printed prominently at the TOP of the receipt (the letterhead/header), e.g. 'HOUSEOFCARDSPH DESKTOP PUBLISHING SERVICES'. Use this business/trade name. Do NOT use the proprietor's / owner's personal name even if present — ignore any name labeled 'Prop.', 'Proprietor', or 'Owner' (e.g. 'John Joebee W. Capino - Prop.' is the owner, NOT the vendor). Also prefer the registered business over a franchise/brand/logo (e.g. a Petron station's dealer 'Primera Una Gas Management Trading Inc.' rather than 'Petron'). String or null",
  "customerName": "The CUSTOMER / buyer name written on the receipt — the 'Customer Name' / 'Sold To' / 'Registered Name' of the PURCHASER (NOT the seller). String or null",
  "customerTin": "The CUSTOMER's TIN as written on the receipt (the buyer's TIN, NOT the seller's). String or null",
  "customerAddress": "The CUSTOMER's address as written on the receipt (the buyer's address). String or null",
  "description": "Short plain summary of the goods or services purchased (e.g. 'Business cards', 'Diesel fuel', 'Office supplies'). Read the 'description / nature of service / particulars' area and any line items. Do NOT just repeat the vendor name. String or null",
  "invoiceNumber": "The receipt/invoice serial number exactly as printed (e.g. the 'No.' value, OR/SI number). String or null",
  "invoiceType": "The document type from its title/header. One of: 'Service Invoice', 'Sales Invoice', 'Official Receipt', 'Other', or null",
  "date": "YYYY-MM-DD string or null",
  "currency": "String, use 'PHP' if not explicitly stated otherwise",
  "subtotal": Number or null,
  "tax": "The VAT / tax amount as a number, or null if none. Non-VAT receipts have null.",
  "vatable": "Boolean: true if this is a VAT receipt (VAT-registered, shows a VAT amount or '12% VAT'); false if it is explicitly NON-VAT; null if unclear",
  "total": Number or null,
  "paymentMethod": "String or null",
  "suggestedCategory": "Must be exactly one of: 'Tools / Direct', 'Gas', 'Materials', 'Transportation', 'Accommodation', '3rd Party Labor', 'Others'. Guess the best fit based on vendor and items.",
  "deductible": "Boolean: true if this is a legitimate, substantiated BUSINESS expense that can be written off / claimed as an income-tax-deductible expense — i.e. it is an ordinary business purchase AND the document is a valid BIR receipt/invoice (shows the seller's registered name + VAT REG TIN, and a serial number). Set false for clearly personal/non-business items, or when the document is an informal/incomplete receipt that would not substantiate a deduction. null if unclear.",
  "deductibleReason": "Short plain reason for the deductible value (e.g. 'Valid Sales Invoice with seller TIN — fuel for operations', or 'No seller TIN / informal receipt'). String or null",
  "confidence": Number between 0.0 and 1.0 indicating extraction quality,
  "lineItems": [
    {
      "description": "String",
      "qty": Number or null,
      "unitPrice": Number or null,
      "amount": Number or null
    }
  ]
}`;

  const result = await model.generateContent([
    { text: RECEIPT_PROMPT },
    { inlineData: { mimeType, data: imageBase64.replace(/^data:.*?;base64,/, '') } }
  ]);

  const text = result.response.text();
  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr);
  return normalizeReceipt(parsed);
}

app.post('/api/receipts/parse', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing or invalid imageBase64' });
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  if (!mimeType || !allowedMimes.includes(mimeType)) {
    return res.status(400).json({ ok: false, error: 'Unsupported mimeType. Allowed: jpeg, png, webp, heic, heif, pdf' });
  }

  try {
    const receipt = await parseReceiptWithGemini(imageBase64, mimeType);
    return res.json({ ok: true, receipt });
  } catch (err) {
    if (err.message === 'GEMINI_API_KEY not configured') {
      return res.status(500).json({ ok: false, error: err.message });
    }
    console.error('[ReceiptParse Error]', err.message);
    return res.status(502).json({ ok: false, error: err.message || 'Failed to parse receipt' });
  }
});
async function detectCropWithGemini(imageBase64, mimeType) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_CROP_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });

  const CROP_PROMPT = `Locate the document, receipt, or piece of paper in this photo and return the coordinates of its 4 corners.
Output ONLY valid JSON — no markdown, no explanation.
Coordinates are fractions from 0.0 to 1.0 relative to image size (0,0 = top-left corner, 1,1 = bottom-right corner).
Return corners in this exact order: topLeft, topRight, bottomRight, bottomLeft.
Example: {"topLeft":{"x":0.05,"y":0.1},"topRight":{"x":0.9,"y":0.08},"bottomRight":{"x":0.92,"y":0.95},"bottomLeft":{"x":0.04,"y":0.93}}
If no document is visible, return: null`;

  const result = await model.generateContent([
    { text: CROP_PROMPT },
    { inlineData: { mimeType, data: imageBase64.replace(/^data:.*?;base64,/, '') } },
  ]);

  const text = result.response.text();
  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr);
  if (!parsed || typeof parsed !== 'object') return null;

  const clamp = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const tl = parsed.topLeft || {};
  const tr = parsed.topRight || {};
  const br = parsed.bottomRight || {};
  const bl = parsed.bottomLeft || {};

  return [
    { x: clamp(tl.x), y: clamp(tl.y) },
    { x: clamp(tr.x), y: clamp(tr.y) },
    { x: clamp(br.x), y: clamp(br.y) },
    { x: clamp(bl.x), y: clamp(bl.y) },
  ];
}

app.post('/api/receipts/detect-crop', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing imageBase64' });
  }

  try {
    const quad = await detectCropWithGemini(imageBase64, mimeType || 'image/jpeg');
    return res.json({ ok: true, quad });
  } catch (err) {
    console.error('[CropDetect Error]', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// POST /api/receipts/check-duplicates — cross-checks a batch of candidate receipts
// (from client-side scans, before they're saved) against everything already stored:
// project_expenses, overhead_expenses, and liquidation rows (rows_json/receipts_json).
// In-memory scan over the three collections, same pattern as /api/finance/pnl — these
// collections are small (a few hundred docs), no composite index needed.
function normInvoice(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normSupplier(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// Coerce to a finite number ONLY for actual numbers or non-empty numeric strings;
// null/undefined/''/NaN all return null (never coerce to 0, which would otherwise
// falsely match against unset/zero amounts). Mirrored client-side in
// receiptDuplicateService.ts — keep both in sync.
function toFiniteAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function amountsEqual(a, b) {
  const na = toFiniteAmount(a);
  const nb = toFiniteAmount(b);
  return na !== null && nb !== null && Math.abs(na - nb) < 0.01;
}

app.post('/api/receipts/check-duplicates', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  const isTaxFiler = user.role === 'tax_filer';

  const { candidates } = req.body || {};
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ success: false, error: 'candidates must be a non-empty array' });
  }
  if (candidates.length > 25) {
    return res.status(400).json({ success: false, error: 'candidates array exceeds max of 25' });
  }

  try {
    const [projectExpSnap, overheadExpSnap, liqSnap] = await Promise.all([
      db.collection('project_expenses').get(),
      db.collection('overhead_expenses').get(),
      db.collection('liquidations').get(),
    ]);

    // Build a flat list of "records" (image hash, invoice, supplier, amount, date) to
    // match candidates against, tagged with enough provenance to build a match entry.
    // `visible` mirrors the ownership/role rules of the sibling GET routes for the same
    // collection (GET /api/project-expenses, GET /api/overhead-expenses, GET /api/liquidations)
    // so a caller who couldn't normally see a record only gets a redacted match for it.
    const records = [];

    // Sibling rule (GET /api/project-expenses): non-admin, non-tax_filer callers see only
    // rows they created OR system-generated sync rows (po_sync/liquidation_sync/migrated).
    const SYNC_SOURCE_TYPES = new Set(['po_sync', 'liquidation_sync', 'migrated']);
    for (const doc of projectExpSnap.docs) {
      const d = doc.data();
      const visible = isAdmin || isTaxFiler || d.createdBy === user.id || SYNC_SOURCE_TYPES.has(d.sourceType);
      records.push({
        source: 'project_expense',
        id: doc.id,
        liquidationId: null,
        formNo: null,
        projectId: d.projectId || null,
        projectName: d.projectName || null,
        supplier: d.supplier || null,
        invoiceNo: d.invoiceNo || null,
        amount: d.amount,
        date: d.date || null,
        description: d.description || null,
        imageHash: d.imageHash || null,
        createdBy: d.createdBy || null,
        createdAt: d.createdAt || null,
        visible,
      });
    }

    // Sibling rule (GET /api/overhead-expenses): non-admin, non-tax_filer callers see only
    // rows they created.
    for (const doc of overheadExpSnap.docs) {
      const d = doc.data();
      const visible = isAdmin || isTaxFiler || d.createdBy === user.id;
      records.push({
        source: 'overhead_expense',
        id: doc.id,
        liquidationId: null,
        formNo: null,
        projectId: null,
        projectName: null,
        supplier: d.supplier || null,
        invoiceNo: d.invoiceNo || null,
        amount: d.amount,
        date: d.date || null,
        description: d.description || null,
        imageHash: d.imageHash || null,
        createdBy: d.createdBy || null,
        createdAt: d.createdAt || null,
        visible,
      });
    }

    // Sibling rule (GET /api/liquidations): non-admin callers see only liquidations whose
    // user_id matches them (no tax_filer carve-out on this route).
    for (const doc of liqSnap.docs) {
      const d = doc.data();
      const visible = isAdmin || d.user_id === user.id;
      let rows = [];
      let receipts = [];
      try { const parsed = JSON.parse(d.rows_json || '[]'); rows = Array.isArray(parsed) ? parsed : []; } catch (e) { rows = []; }
      try { const parsed = JSON.parse(d.receipts_json || '[]'); receipts = Array.isArray(parsed) ? parsed : []; } catch (e) { receipts = []; }
      for (const row of rows) {
        try {
          if (!row || !row.id) continue;
          // Any receipt attached to this row carries its image hash (if the client set one).
          const rowReceipt = receipts.find(r => r && r.rowId === row.id && r.imageHash);
          records.push({
            source: 'liquidation_row',
            id: row.id,
            liquidationId: doc.id,
            formNo: d.form_no || null,
            projectId: row.projectId || null,
            projectName: row.projectName || null,
            supplier: row.supplier || null,
            invoiceNo: row.invoiceNo || null,
            amount: row.amount,
            date: row.date || null,
            description: row.particulars || null,
            imageHash: rowReceipt ? rowReceipt.imageHash : null,
            createdBy: d.employee_name || null,
            createdAt: null,
            visible,
          });
        } catch (rowErr) {
          // Skip just this malformed row rather than failing the whole request.
          console.error('[check-duplicates] Skipping malformed liquidation row', doc.id, rowErr.message);
        }
      }
    }

    const toMatchEntry = (rec, matchType) => {
      if (!rec.visible) {
        // Redact: keep only what's needed to tell the user "something matched", not what it is.
        return {
          source: rec.source,
          matchType,
          redacted: true,
        };
      }
      return {
        source: rec.source,
        id: rec.id,
        liquidationId: rec.liquidationId,
        formNo: rec.formNo,
        projectId: rec.projectId,
        projectName: rec.projectName,
        supplier: rec.supplier,
        invoiceNo: rec.invoiceNo,
        amount: rec.amount,
        date: rec.date,
        description: rec.description,
        matchType,
        createdBy: rec.createdBy,
        createdAt: rec.createdAt,
      };
    };

    const results = candidates.map(candidate => {
      const key = candidate && candidate.key;
      const candImageHash = candidate && candidate.imageHash ? String(candidate.imageHash) : '';
      const candInvoice = normInvoice(candidate && candidate.invoiceNo);
      const candSupplier = normSupplier(candidate && candidate.supplier);
      const candAmount = candidate && candidate.amount;
      const candDate = candidate && candidate.date ? String(candidate.date) : '';

      const matches = [];
      for (const rec of records) {
        let matchType = null;

        if (candImageHash && rec.imageHash && candImageHash === String(rec.imageHash)) {
          matchType = 'image_hash';
        } else {
          const recInvoice = normInvoice(rec.invoiceNo);
          const recSupplier = normSupplier(rec.supplier);
          if (candInvoice && recInvoice && candInvoice === recInvoice &&
              (candSupplier && recSupplier && candSupplier === recSupplier || amountsEqual(candAmount, rec.amount))) {
            matchType = 'invoice';
          } else if (candSupplier && recSupplier && candSupplier === recSupplier &&
                     amountsEqual(candAmount, rec.amount) &&
                     candDate && rec.date && candDate === String(rec.date)) {
            matchType = 'content';
          }
        }

        if (matchType) {
          matches.push(toMatchEntry(rec, matchType));
        }
      }

      // Strongest match first (image_hash > invoice > content), cap at 5.
      const rank = { image_hash: 0, invoice: 1, content: 2 };
      matches.sort((a, b) => rank[a.matchType] - rank[b.matchType]);

      return { key, matches: matches.slice(0, 5) };
    });

    res.json({ success: true, results });
  } catch (err) {
    console.error('Error checking receipt duplicates:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// --- END RECEIPT PARSING BLOCK ---

// ========== OVERHEAD EXPENSES ==========
// Firestore collection: overhead_expenses
// Company expenses NOT tied to any project (rent, utilities, supplies, subs).
// Fields: description, amount, date (YYYY-MM-DD), category, createdAt (ISO),
//   createdBy (userId), sourceType (manual|receipt_scan), optional updatedAt,
//   optional receiptRef { oneDriveId, webUrl, filename }.
// Queries are equality-only (where createdBy ==) + in-memory sort, so Firestore
// automatic single-field indexes cover them — NO composite index needed.

app.get('/api/overhead-expenses/summary', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const { year } = req.query;
    let query = db.collection('overhead_expenses');
    if (!isAdmin) query = query.where('createdBy', '==', user.id);
    const snap = await query.get();
    let rows = snap.docs.map(doc => doc.data());
    if (year) rows = rows.filter(r => r.date && String(r.date).startsWith(String(year)));
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    res.json({ success: true, total, count: rows.length, year: year || 'all' });
  } catch (err) {
    console.error('Error fetching overhead_expenses summary:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/finance/pnl?year=YYYY — company-wide income statement (Profit & Loss).
// Aggregates invoices (revenue, accrual), project_expenses (cost of services) and
// overhead_expenses (operating expenses) for the given year. In-memory date-prefix
// filtering mirrors the summary endpoints — NO composite index required.
// COMPANY-WIDE for all authenticated users (management report; no per-user scoping).
app.get('/api/finance/pnl', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  // P&L is a management report — superadmin only (no per-user/role separation yet).
  if (user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Forbidden' });
  try {
    const year = req.query.year ? String(req.query.year) : String(new Date().getFullYear());
    const [invoicesSnap, projExpSnap, overExpSnap] = await Promise.all([
      db.collection('invoices').get(),
      db.collection('project_expenses').get(),
      db.collection('overhead_expenses').get(),
    ]);

    let revenue = 0, revenueCollected = 0, invoiceCount = 0;
    invoicesSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.invoice_date && String(d.invoice_date).startsWith(year)) {
        revenue += Number(d.amount) || 0;
        revenueCollected += Number(d.amount_collected) || 0;
        invoiceCount++;
      }
    });

    let costOfServices = 0;
    projExpSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.date && String(d.date).startsWith(year)) {
        costOfServices += Number(d.amount) || 0;
      }
    });

    let operatingExpenses = 0;
    const catMap = {};
    overExpSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.date && String(d.date).startsWith(year)) {
        const amt = Number(d.amount) || 0;
        operatingExpenses += amt;
        const cat = d.category || 'Uncategorized';
        catMap[cat] = (catMap[cat] || 0) + amt;
      }
    });
    const overheadByCategory = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const grossProfit = revenue - costOfServices;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const operatingIncome = grossProfit - operatingExpenses;
    const percentageTaxEstimate = revenueCollected * 0.03; // PH 2551Q: 3% on gross receipts (collected), not accrual
    const netIncomeBeforeIncomeTax = operatingIncome - percentageTaxEstimate;

    res.json({
      success: true,
      year,
      generatedAt: new Date().toISOString(),
      revenue,
      revenueCollected,
      invoiceCount,
      costOfServices,
      grossProfit,
      grossMarginPct,
      operatingExpenses,
      overheadByCategory,
      operatingIncome,
      percentageTaxEstimate,
      netIncomeBeforeIncomeTax,
    });
  } catch (err) {
    console.error('Error computing finance P&L:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/overhead-expenses', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const { year, category } = req.query;
    let query = db.collection('overhead_expenses');
    // tax_filer needs full visibility for BIR substantiation (Tax Filer Ledger) — it's a
    // read-only role; write access stays admin/owner-gated separately in the PATCH handler below.
    if (!isAdmin && user.role !== 'tax_filer') query = query.where('createdBy', '==', user.id);
    if (category) query = query.where('category', '==', String(category));
    const snap = await query.get();
    let rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (year) rows = rows.filter(r => r.date && String(r.date).startsWith(String(year)));
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ success: true, expenses: rows });
  } catch (err) {
    console.error('Error fetching overhead_expenses:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/overhead-expenses', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const body = req.body;
    const now = new Date().toISOString();
    if (Array.isArray(body.expenses)) {
      const toInsert = body.expenses.filter(e => Number(e.amount) > 0);
      if (toInsert.length === 0) return res.status(400).json({ success: false, error: 'No valid expenses in array' });
      const inserted = [];
      for (let i = 0; i < toInsert.length; i += 499) {
        const chunk = toInsert.slice(i, i + 499);
        const batch = db.batch();
        for (const exp of chunk) {
          const ref = db.collection('overhead_expenses').doc();
          const doc = {
            description: exp.description || '',
            amount: Number(exp.amount),
            date: exp.date || now.slice(0, 10),
            category: exp.category || 'Others',
            createdAt: exp.createdAt || now,
            createdBy: user.id,
            sourceType: exp.sourceType || 'manual',
          };
          if (exp.receiptRef) doc.receiptRef = exp.receiptRef;
          if (exp.remarks) doc.remarks = String(exp.remarks);
          if (exp.supplier) doc.supplier = String(exp.supplier);
          if (exp.invoiceNo) doc.invoiceNo = String(exp.invoiceNo);
          if (exp.invoiceType) doc.invoiceType = String(exp.invoiceType);
          if (exp.tin) doc.tin = String(exp.tin);
          if (exp.imageHash) doc.imageHash = String(exp.imageHash);
          if (exp.vat != null && Number.isFinite(Number(exp.vat))) doc.vat = Number(exp.vat);
          if (typeof exp.deductible === 'boolean') doc.deductible = exp.deductible;
          if (exp.deductibleReason) doc.deductibleReason = String(exp.deductibleReason);
          const fundingSource = normalizeFundingSource(exp.fundingSource);
          if (fundingSource) doc.fundingSource = fundingSource;
          batch.set(ref, doc);
          inserted.push({ id: ref.id, ...doc });
        }
        await batch.commit();
      }
      const outOfPocketInserted = inserted.filter(exp => exp.fundingSource && exp.fundingSource.type === 'investor_outofpocket');
      await Promise.all(outOfPocketInserted.map(exp => syncExpenseFundingInvestment(exp.id, 'overhead_expenses', exp)));
      return res.status(201).json({ success: true, count: inserted.length, expenses: inserted });
    }
    const { description, remarks, amount, date, category, sourceType, receiptRef,
            supplier, invoiceNo, invoiceType, vat, tin, imageHash, deductible, deductibleReason, fundingSource } = body;
    if (!amount) return res.status(400).json({ success: false, error: 'amount is required' });
    const doc = {
      description: description || '',
      amount: Number(amount),
      date: date || now.slice(0, 10),
      category: category || 'Others',
      createdAt: now,
      createdBy: user.id,
      sourceType: sourceType || 'manual',
    };
    if (receiptRef) doc.receiptRef = receiptRef;
    if (remarks) doc.remarks = String(remarks);
    if (supplier) doc.supplier = String(supplier);
    if (invoiceNo) doc.invoiceNo = String(invoiceNo);
    if (invoiceType) doc.invoiceType = String(invoiceType);
    if (tin) doc.tin = String(tin);
    if (imageHash) doc.imageHash = String(imageHash);
    if (vat != null && Number.isFinite(Number(vat))) doc.vat = Number(vat);
    if (typeof deductible === 'boolean') doc.deductible = deductible;
    if (deductibleReason) doc.deductibleReason = String(deductibleReason);
    const normalizedFunding = normalizeFundingSource(fundingSource);
    if (normalizedFunding) doc.fundingSource = normalizedFunding;
    const ref = await db.collection('overhead_expenses').add(doc);
    if (doc.fundingSource) await syncExpenseFundingInvestment(ref.id, 'overhead_expenses', doc);
    res.status(201).json({ success: true, expense: { id: ref.id, ...doc } });
  } catch (err) {
    console.error('Error creating overhead_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.patch('/api/overhead-expenses/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('overhead_expenses').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!isAdmin && snap.data().createdBy !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const allowed = {};
    const { description, remarks, amount, date, category, receiptRef, supplier, invoiceNo, invoiceType, vat, tin, imageHash, deductible, deductibleReason, fundingSource } = req.body;
    if (description !== undefined) allowed.description = String(description);
    if (remarks !== undefined) allowed.remarks = String(remarks);
    if (amount !== undefined) allowed.amount = Number(amount);
    if (date !== undefined) allowed.date = String(date);
    if (category !== undefined) allowed.category = String(category);
    if (receiptRef !== undefined) allowed.receiptRef = receiptRef;
    if (supplier !== undefined) allowed.supplier = String(supplier);
    if (invoiceNo !== undefined) allowed.invoiceNo = String(invoiceNo);
    if (invoiceType !== undefined) allowed.invoiceType = String(invoiceType);
    if (vat !== undefined && Number.isFinite(Number(vat))) allowed.vat = Number(vat);
    if (tin !== undefined) allowed.tin = String(tin);
    if (imageHash !== undefined) allowed.imageHash = imageHash == null ? null : String(imageHash);
    if (typeof deductible === 'boolean') allowed.deductible = deductible;
    else if (deductible === null) allowed.deductible = null;
    if (deductibleReason !== undefined) allowed.deductibleReason = deductibleReason == null ? null : String(deductibleReason);
    if (fundingSource !== undefined) {
      const nf = normalizeFundingSource(fundingSource);
      allowed.fundingSource = (nf && nf.type === 'investor_outofpocket') ? nf : FieldValue.delete();
    }
    allowed.updatedAt = new Date().toISOString();
    await ref.update(allowed);
    const updated = await ref.get();
    await syncExpenseFundingInvestment(updated.id, 'overhead_expenses', updated.data());
    res.json({ success: true, expense: { id: updated.id, ...updated.data() } });
  } catch (err) {
    console.error('Error updating overhead_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/overhead-expenses/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const ref = db.collection('overhead_expenses').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Not found' });
    if (!isAdmin && doc.data().createdBy !== user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await ref.delete();
    await syncExpenseFundingInvestment(req.params.id, 'overhead_expenses', {});
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting overhead_expense:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// Overhead <-> project expense transfer. Since the two collections stay separate
// (unification is UI-layer only), "move this expense" is a copy-into-target +
// delete-original, done in one Firestore batch so the cost can never exist in
// both (or neither) collection. Sync-sourced rows are refused: their origin job
// (PO/liquidation/payroll re-sync) would recreate the original and double-count.
// ---------------------------------------------------------------------------
const SYNC_SOURCE_TYPES_NO_CONVERT = new Set(['po_sync', 'liquidation_sync', 'payroll_sync']);

function convertibleExpenseOrError(docSnap, user, isAdmin) {
  if (!docSnap.exists) return { error: { status: 404, message: 'Not found' } };
  const data = docSnap.data();
  if (!isAdmin && data.createdBy !== user.id) return { error: { status: 403, message: 'Forbidden' } };
  if (SYNC_SOURCE_TYPES_NO_CONVERT.has(data.sourceType) || docSnap.id.startsWith('payroll_sync_')) {
    return { error: { status: 400, message: 'System-synced expenses cannot be moved — the source sync would recreate them.' } };
  }
  return { data };
}

// Fields shared by both collections that survive a move unchanged.
function portableExpenseFields(data) {
  const out = {
    description: data.description || '',
    amount: Number(data.amount) || 0,
    date: data.date,
    category: data.category || 'Others',
    createdAt: data.createdAt,
    createdBy: data.createdBy,
    sourceType: data.sourceType || 'manual',
  };
  for (const k of ['receiptRef', 'supplier', 'invoiceNo', 'invoiceType', 'vat', 'tin', 'deductible', 'deductibleReason', 'fundingSource', 'imageHash']) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

app.post('/api/overhead-expenses/:id/convert-to-project', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const { projectId, projectName, category } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });
    const oldRef = db.collection('overhead_expenses').doc(req.params.id);
    const snap = await oldRef.get();
    const { data, error } = convertibleExpenseOrError(snap, user, isAdmin);
    if (error) return res.status(error.status).json({ success: false, error: error.message });
    const newDoc = {
      ...portableExpenseFields(data),
      projectId: String(projectId),
      projectName: projectName || '',
      updatedAt: new Date().toISOString(),
    };
    if (category) newDoc.category = String(category);
    const newRef = db.collection('project_expenses').doc();
    const batch = db.batch();
    batch.set(newRef, newDoc);
    batch.delete(oldRef);
    await batch.commit();
    // The old id no longer exists — clear any investments row linked to it, then
    // re-link under the new id/collection.
    await syncExpenseFundingInvestment(req.params.id, 'overhead_expenses', {});
    await syncExpenseFundingInvestment(newRef.id, 'project_expenses', newDoc);
    res.json({ success: true, expense: { ...newDoc, id: newRef.id } });
  } catch (err) {
    console.error('Error converting overhead_expense to project:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/project-expenses/:id/convert-to-overhead', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  try {
    const { category } = req.body || {};
    const oldRef = db.collection('project_expenses').doc(req.params.id);
    const snap = await oldRef.get();
    const { data, error } = convertibleExpenseOrError(snap, user, isAdmin);
    if (error) return res.status(error.status).json({ success: false, error: error.message });
    // projectId/projectName and PO/liquidation/CA linkage fields are meaningless on
    // an overhead row — portableExpenseFields already excludes them.
    const newDoc = {
      ...portableExpenseFields(data),
      updatedAt: new Date().toISOString(),
    };
    if (category) newDoc.category = String(category);
    const newRef = db.collection('overhead_expenses').doc();
    const batch = db.batch();
    batch.set(newRef, newDoc);
    batch.delete(oldRef);
    await batch.commit();
    await syncExpenseFundingInvestment(req.params.id, 'project_expenses', {});
    await syncExpenseFundingInvestment(newRef.id, 'overhead_expenses', newDoc);
    res.json({ success: true, expense: { ...newDoc, id: newRef.id } });
  } catch (err) {
    console.error('Error converting project_expense to overhead:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// ========== END OVERHEAD EXPENSES ==========

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
