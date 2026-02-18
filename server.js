require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize database: SQLite Cloud if DATABASE_URL is set, else local SQLite
const databaseUrl = process.env.DATABASE_URL;
let db;
let dbLabel = 'SQLite (local)';

if (databaseUrl && databaseUrl.startsWith('sqlitecloud://')) {
  const { Database } = require('@sqlitecloud/drivers');
  dbLabel = 'SQLite Cloud';
  db = new Database(databaseUrl, (err) => {
    if (err) {
      console.error('Error connecting to SQLite Cloud:', err);
    } else {
      console.log('Connected to SQLite Cloud');
      db.serialize = (fn) => fn(); // no-op; driver queues commands internally
      initializeDatabase();
    }
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = databaseUrl || path.join(__dirname, 'projects.db');
  dbLabel = dbPath;
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
    } else {
      console.log('Connected to SQLite database');
      initializeDatabase();
    }
  });
}

// Initialize database tables
function initializeDatabase() {
  const createProjectsTable = `
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_no TEXT,
      item_no INTEGER,
      year INTEGER,
      am TEXT,
      ovp_number TEXT,
      po_number TEXT,
      po_date INTEGER,
      client_status TEXT,
      account_name TEXT,
      project_name TEXT NOT NULL,
      project_category TEXT,
      project_location TEXT,
      scope_of_work TEXT,
      qtn_no TEXT,
      ovp_category TEXT,
      contract_amount REAL DEFAULT 0,
      updated_contract_amount REAL DEFAULT 0,
      down_payment_percent REAL DEFAULT 0,
      retention_percent REAL DEFAULT 0,
      start_date INTEGER,
      duration_days INTEGER DEFAULT 0,
      completion_date INTEGER,
      payment_schedule TEXT,
      payment_terms TEXT,
      bonds_requirement TEXT,
      project_director TEXT,
      client_approver TEXT,
      progress_billing_schedule TEXT,
      mobilization_date INTEGER,
      updated_completion_date INTEGER,
      project_status TEXT DEFAULT 'OPEN',
      actual_site_progress_percent REAL DEFAULT 0,
      actual_progress REAL DEFAULT 0,
      evaluated_progress_percent REAL DEFAULT 0,
      evaluated_progress REAL DEFAULT 0,
      for_rfb_percent REAL DEFAULT 0,
      for_rfb_amount REAL DEFAULT 0,
      rfb_date INTEGER,
      type_of_rfb TEXT,
      work_in_progress_ap REAL DEFAULT 0,
      work_in_progress_ep REAL DEFAULT 0,
      updated_contract_balance_percent REAL DEFAULT 0,
      total_contract_balance REAL DEFAULT 0,
      updated_contract_balance_net_percent REAL DEFAULT 0,
      updated_contract_balance_net REAL DEFAULT 0,
      remarks TEXT,
      contract_billed_gross_percent REAL DEFAULT 0,
      contract_billed REAL DEFAULT 0,
      contract_billed_net_percent REAL DEFAULT 0,
      amount_contract_billed_net REAL DEFAULT 0,
      for_retention_billing_percent REAL DEFAULT 0,
      amount_for_retention_billing REAL DEFAULT 0,
      retention_status TEXT,
      unevaluated_progress REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createProjectsTable, (err) => {
    if (err) {
      console.error('Error creating projects table:', err);
      process.exit(1);
    } else {
      console.log('Projects table ready');
      // Add project_no column if missing (local SQLite only; SQLite Cloud schema is already up to date)
      if (!databaseUrl || !databaseUrl.startsWith('sqlitecloud://')) {
        db.run('ALTER TABLE projects ADD COLUMN project_no TEXT', () => {});
      }
    }
    startServer();
  });

  // Create users table
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      approved INTEGER DEFAULT 0,
      full_name TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `;

  db.run(createUsersTable, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table ready');
      // Add columns if missing (local SQLite only; SQLite Cloud schema is already up to date)
      if (!databaseUrl || !databaseUrl.startsWith('sqlitecloud://')) {
        db.run('ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 1', () => {});
        db.run('ALTER TABLE users ADD COLUMN full_name TEXT', () => {});
      }
      setTimeout(() => {
        createDefaultUsers();
      }, 100);
    }
  });

  // Create clients table
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      address TEXT,
      payment_terms TEXT,
      contact_person TEXT,
      designation TEXT,
      email_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;
  db.run(createClientsTable, (err) => {
    if (err) console.error('Error creating clients table:', err);
    else console.log('Clients table ready');
  });

  // Project attachments (OneDrive metadata)
  const createAttachmentsTable = `
    CREATE TABLE IF NOT EXISTS project_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      onedrive_item_id TEXT NOT NULL,
      onedrive_web_url TEXT,
      file_size INTEGER,
      uploaded_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `;
  db.run(createAttachmentsTable, (err) => {
    if (err) console.error('Error creating project_attachments table:', err);
    else console.log('project_attachments table ready');
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_attachments_project ON project_attachments(project_id)', () => {});

  // Suppliers and supplier products (replaces Suppliers_All_POs.csv)
  const createSuppliersTable = `
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      payment_terms TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;
  db.run(createSuppliersTable, (err) => {
    if (err) console.error('Error creating suppliers table:', err);
    else console.log('Suppliers table ready');
  });
  const createSupplierProductsTable = `
    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      name TEXT,
      part_no TEXT,
      description TEXT,
      brand TEXT,
      unit TEXT DEFAULT 'pcs',
      unit_price REAL,
      price_date TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `;
  db.run(createSupplierProductsTable, (err) => {
    if (err) console.error('Error creating supplier_products table:', err);
    else console.log('Supplier_products table ready');
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id)', () => {});

  // Cash advances (CA): user requests CA; admin approves; liquidation submission reduces balance
  const createCashAdvancesTable = `
    CREATE TABLE IF NOT EXISTS cash_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      balance_remaining REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      purpose TEXT,
      requested_at INTEGER,
      approved_at INTEGER,
      approved_by INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `;
  db.run(createCashAdvancesTable, (err) => {
    if (err) console.error('Error creating cash_advances table:', err);
    else console.log('cash_advances table ready');
  });

  // Liquidations: draft or submitted; can link to CA to reduce its balance on submit
  const createLiquidationsTable = `
    CREATE TABLE IF NOT EXISTS liquidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      form_no TEXT,
      date_of_submission TEXT,
      employee_name TEXT,
      employee_number TEXT,
      rows_json TEXT,
      total_amount REAL DEFAULT 0,
      ca_id INTEGER,
      status TEXT DEFAULT 'draft',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (ca_id) REFERENCES cash_advances(id)
    )
  `;
  db.run(createLiquidationsTable, (err) => {
    if (err) console.error('Error creating liquidations table:', err);
    else console.log('liquidations table ready');
  });

  // Create indexes for better performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_director ON projects(project_director)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_status ON projects(project_status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_year ON projects(year)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_username ON users(username)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email ON users(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cash_advances_user ON cash_advances(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_liquidations_user ON liquidations(user_id)`);
}

// Create default users (all approved)
function createDefaultUsers() {
  const adminPasswordHash = Buffer.from('admin123').toString('base64');
  const userPasswordHash = Buffer.from('user123').toString('base64');
  const superadminPasswordHash = Buffer.from('IOCT0201!').toString('base64');

  // Superadmin: TJC
  db.get('SELECT id FROM users WHERE username = ? OR email = ?', ['TJC', 'tyronejames.caballero@gmail.com'], (err, row) => {
    if (err) {
      console.error('Error checking for superadmin:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role, approved, full_name) VALUES (?, ?, ?, ?, ?, ?)',
        ['TJC', 'tyronejames.caballero@gmail.com', superadminPasswordHash, 'superadmin', 1, 'Tyrone James Caballero'],
        (err) => {
          if (err) {
            console.error('Error creating superadmin user:', err);
          } else {
            console.log('Superadmin created (username: TJC, email: tyronejames.caballero@gmail.com)');
          }
        }
      );
    } else {
      db.run('UPDATE users SET full_name = ? WHERE username = ?', ['Tyrone James Caballero', 'TJC'], () => {});
    }
  });

  db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
    if (err) {
      console.error('Error checking for admin user:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role, approved) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@netpacific.com', adminPasswordHash, 'admin', 1],
        (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('Default admin user created (username: admin, password: admin123)');
          }
        }
      );
    }
  });

  db.get('SELECT id FROM users WHERE username = ?', ['user'], (err, row) => {
    if (err) {
      console.error('Error checking for user:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role, approved) VALUES (?, ?, ?, ?, ?)',
        ['user', 'user@netpacific.com', userPasswordHash, 'user', 1],
        (err) => {
          if (err) {
            console.error('Error creating user:', err);
          } else {
            console.log('Default user created (username: user, password: user123)');
          }
        }
      );
    }
  });

  const projectsPasswordHash = Buffer.from('IOCT0201!').toString('base64');
  db.get('SELECT id FROM users WHERE username = ? OR email = ?', ['projects', 'projects@iocontroltech.com'], (err, row) => {
    if (err) {
      console.error('Error checking for projects admin:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role, approved) VALUES (?, ?, ?, ?, ?)',
        ['projects', 'projects@iocontroltech.com', projectsPasswordHash, 'admin', 1],
        (err) => {
          if (err) {
            console.error('Error creating projects admin user:', err);
          } else {
            console.log('Projects admin created (username: projects, email: projects@iocontroltech.com)');
          }
        }
      );
    }
  });
}

// API Routes

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('Database error during login:', err);
      return res.json({ success: false, error: 'Database error' });
    }

    if (!user) {
      return res.json({ success: false, error: 'Invalid credentials' });
    }

    // Simple password verification (in production, use bcrypt)
    const providedPasswordHash = Buffer.from(password).toString('base64');
    
    if (user.password_hash !== providedPasswordHash) {
      return res.json({ success: false, error: 'Invalid credentials' });
    }

    // Only superadmin or approved users can log in
    const approved = user.approved === 1 || user.approved === true;
    if (!approved && user.role !== 'superadmin') {
      return res.json({ success: false, error: 'Account pending approval. Contact an administrator.' });
    }

    // Generate simple token (in production, use JWT)
    const token = Buffer.from(`${user.id}:${user.username}:${Date.now()}`).toString('base64');

    // Return user data (without password)
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      approved: user.approved ? 1 : 0,
      full_name: user.full_name || null,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    res.json({
      success: true,
      user: userData,
      token: token
    });
  });
});

// Register new user
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, role = 'user' } = req.body;

  if (!username || !email || !password) {
    return res.json({ success: false, error: 'Username, email, and password are required' });
  }

  if (password.length < 6) {
    return res.json({ success: false, error: 'Password must be at least 6 characters long' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.json({ success: false, error: 'Please enter a valid email address' });
  }

  // Registration only allows user or viewer; admin/superadmin are created by superadmin
  if (!['user', 'viewer'].includes(role)) {
    return res.json({ success: false, error: 'Invalid role specified' });
  }

  // Check if username or email already exists
  db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, existingUser) => {
    if (err) {
      console.error('Database error during registration:', err);
      return res.json({ success: false, error: 'Database error' });
    }

    if (existingUser) {
      return res.json({ success: false, error: 'Username or email already exists' });
    }

    // Hash password (simple base64 encoding - use bcrypt in production)
    const passwordHash = Buffer.from(password).toString('base64');
    const createdAt = Math.floor(Date.now() / 1000);
    const approved = 0; // New users require superadmin approval

    db.run(
      'INSERT INTO users (username, email, password_hash, role, approved, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, role, approved, createdAt, createdAt],
      function(err) {
        if (err) {
          console.error('Error creating user:', err);
          return res.json({ success: false, error: 'Failed to create user account' });
        }

        console.log(`New user registered: ${username} (${email}) with role: ${role} (pending approval)`);
        res.json({ 
          success: true, 
          message: 'Account created. You will be able to log in after an administrator approves your account.',
          user: {
            id: this.lastID,
            username,
            email,
            role,
            approved: 0,
            created_at: createdAt
          }
        });
      }
    );
  });
});

// Get current user (for token validation)
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [userId] = decoded.split(':');
    
    db.get('SELECT * FROM users WHERE id = ?', [parseInt(userId)], (err, user) => {
      if (err || !user) {
        return res.json({ success: false, error: 'Invalid token' });
      }

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        approved: user.approved ? 1 : 0,
        full_name: user.full_name || null,
        created_at: user.created_at,
        updated_at: user.updated_at
      };

      res.json({ success: true, user: userData });
    });
  } catch (error) {
    res.json({ success: false, error: 'Invalid token' });
  }
});

// Helper: get current user from Bearer token (for protected routes)
function getCurrentUser(req, callback) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return callback(null, null);
  }
  const token = authHeader.substring(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [userId] = decoded.split(':');
    db.get('SELECT * FROM users WHERE id = ?', [parseInt(userId)], (err, user) => {
      if (err || !user) return callback(err, null);
      callback(null, user);
    });
  } catch (e) {
    callback(null, null);
  }
}

// Users API (superadmin only) – mounted at /api/users
const usersRouter = express.Router();

// List all users – also registered on app so GET /api/users always matches
function listAllUsers(req, res) {
  console.log('GET /api/users');
  getCurrentUser(req, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin only' });
    }
    db.all(
      'SELECT id, username, email, full_name, role, approved, created_at, updated_at FROM users ORDER BY id',
      [],
      (err, rows) => {
        if (err) {
          console.error('Error fetching users:', err);
          return res.status(500).json({ success: false, error: 'Database error' });
        }
        res.json({ success: true, users: rows });
      }
    );
  });
}
app.get('/api/users', listAllUsers);
usersRouter.get('/', listAllUsers);

// List users pending approval (GET /api/users/pending)
usersRouter.get('/pending', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin only' });
    }
    db.all('SELECT id, username, email, role, created_at FROM users WHERE approved = 0 ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        console.error('Error fetching pending users:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, users: rows });
    });
  });
});

// Update a user (PATCH /api/users/:id)
usersRouter.patch('/:id', (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (!targetId) return res.status(400).json({ success: false, error: 'Invalid user id' });
  getCurrentUser(req, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin only' });
    }
    const { full_name, role, approved } = req.body;
    const updates = [];
    const values = [];
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name == null ? null : String(full_name).trim());
    }
    if (role !== undefined && ['superadmin', 'admin', 'user', 'viewer'].includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }
    if (approved !== undefined) {
      updates.push('approved = ?');
      values.push(approved ? 1 : 0);
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(targetId);
    db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          console.error('Error updating user:', err);
          return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.json({ success: true, message: 'User updated' });
      }
    );
  });
});

// Approve a user (POST /api/users/:id/approve)
usersRouter.post('/:id/approve', (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (!targetId) return res.status(400).json({ success: false, error: 'Invalid user id' });
  getCurrentUser(req, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin only' });
    }
    db.run('UPDATE users SET approved = 1, updated_at = ? WHERE id = ?', [Math.floor(Date.now() / 1000), targetId], function (err) {
      if (err) {
        console.error('Error approving user:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      console.log(`User ${targetId} approved by superadmin ${user.username}`);
      res.json({ success: true, message: 'User approved' });
    });
  });
});

// Delete a user – superadmin only; cannot delete self or last superadmin (shared handler)
function deleteUserHandler(req, res) {
  const targetId = parseInt(req.params.id, 10);
  if (!targetId) return res.status(400).json({ success: false, error: 'Invalid user id' });
  getCurrentUser(req, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Superadmin only' });
    }
    if (user.id === targetId) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }
    db.get('SELECT id, role FROM users WHERE id = ?', [targetId], (err, target) => {
      if (err) {
        console.error('Error fetching user for delete:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (!target) return res.status(404).json({ success: false, error: 'User not found' });
      if (target.role === 'superadmin') {
        db.get('SELECT COUNT(*) AS n FROM users WHERE role = ?', ['superadmin'], (err, row) => {
          if (err) return res.status(500).json({ success: false, error: 'Database error' });
          if (row && row.n <= 1) {
            return res.status(400).json({ success: false, error: 'Cannot delete the last superadmin' });
          }
          doDelete();
        });
      } else {
        doDelete();
      }
    });
    function doDelete() {
      db.run('DELETE FROM users WHERE id = ?', [targetId], function (err) {
        if (err) {
          console.error('Error deleting user:', err);
          return res.status(500).json({ success: false, error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'User not found' });
        console.log(`User ${targetId} deleted by superadmin ${user.username}`);
        res.json({ success: true, message: 'User deleted' });
      });
    }
  });
}
app.delete('/api/users/:id', deleteUserHandler);
usersRouter.delete('/:id', deleteUserHandler);

app.use('/api/users', usersRouter);

// Get all projects
app.get('/api/projects', (req, res) => {
  const { status, year, search, client, category } = req.query;
  
  let query = 'SELECT * FROM projects WHERE 1=1';
  let params = [];

  if (status) {
    query += ' AND project_status = ?';
    params.push(status);
  }

  if (client) {
    query += ' AND account_name = ?';
    params.push(client);
  }

  if (category) {
    query += ' AND project_category = ?';
    params.push(category);
  }

  if (year) {
    query += ' AND year = ?';
    params.push(parseInt(year));
  }

  if (search) {
    query += ' AND (project_name LIKE ? OR account_name LIKE ? OR ovp_number LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching projects:', err);
      res.status(500).json({ error: 'Failed to fetch projects' });
    } else {
      res.json(rows);
    }
  });
});

// Get project count
app.get('/api/projects/count', (req, res) => {
  const query = 'SELECT COUNT(*) as count FROM projects';
  
  db.get(query, [], (err, row) => {
    if (err) {
      console.error('Error fetching project count:', err);
      return res.status(500).json({ error: 'Failed to fetch project count' });
    }
    
    res.json({ count: row.count });
  });
});

// Get project by ID
app.get('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching project:', err);
      res.status(500).json({ error: 'Failed to fetch project' });
    } else if (!row) {
      res.status(404).json({ error: 'Project not found' });
    } else {
      res.json(row);
    }
  });
});

// Create new project
app.post('/api/projects', (req, res) => {
  const projectData = req.body;
  
  const columns = Object.keys(projectData).filter(key => key !== 'id');
  const placeholders = columns.map(() => '?').join(',');
  const values = columns.map(key => projectData[key]);
  
  const query = `INSERT INTO projects (${columns.join(',')}, created_at, updated_at) 
                 VALUES (${placeholders}, datetime('now'), datetime('now'))`;

  db.run(query, values, function(err) {
    if (err) {
      console.error('Error creating project:', err);
      res.status(500).json({ error: 'Failed to create project' });
    } else {
      res.status(201).json({ 
        id: this.lastID,
        message: 'Project created successfully' 
      });
    }
  });
});

// Bulk create projects
app.post('/api/projects/bulk', (req, res) => {
  const projects = req.body.projects;
  
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: 'Projects must be an array' });
  }

  const stmt = db.prepare(`
    INSERT INTO projects (
      item_no, year, am, ovp_number, po_number, po_date, client_status,
      account_name, project_name, project_category, project_location,
      scope_of_work, qtn_no, ovp_category, contract_amount, updated_contract_amount,
      down_payment_percent, retention_percent, start_date, duration_days,
      completion_date, payment_schedule, payment_terms, bonds_requirement,
      project_director, client_approver, progress_billing_schedule,
      mobilization_date, updated_completion_date, project_status,
      actual_site_progress_percent, actual_progress, evaluated_progress_percent,
      evaluated_progress, for_rfb_percent, for_rfb_amount, rfb_date,
      type_of_rfb, work_in_progress_ap, work_in_progress_ep,
      updated_contract_balance_percent, total_contract_balance,
      updated_contract_balance_net_percent, updated_contract_balance_net,
      remarks, contract_billed_gross_percent, contract_billed,
      contract_billed_net_percent, amount_contract_billed_net,
      for_retention_billing_percent, amount_for_retention_billing,
      retention_status, unevaluated_progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let successCount = 0;
  const errors = [];

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    projects.forEach((project, index) => {
      try {
        stmt.run(
          project.item_no || 0,
          project.year || new Date().getFullYear(),
          project.am || '',
          project.ovp_number || '',
          project.po_number || '',
          project.po_date || null,
          project.client_status || '',
          project.account_name || '',
          project.project_name || '',
          project.project_category || '',
          project.project_location || '',
          project.scope_of_work || '',
          project.qtn_no || '',
          project.ovp_category || '',
          project.contract_amount || 0,
          project.updated_contract_amount || 0,
          project.down_payment_percent || 0,
          project.retention_percent || 0,
          project.start_date || null,
          project.duration_days || 0,
          project.completion_date || null,
          project.payment_schedule || '',
          project.payment_terms || '',
          project.bonds_requirement || '',
          project.project_director || '',
          project.client_approver || '',
          project.progress_billing_schedule || '',
          project.mobilization_date || null,
          project.updated_completion_date || null,
          project.project_status || 'OPEN',
          project.actual_site_progress_percent || 0,
          project.actual_progress || 0,
          project.evaluated_progress_percent || 0,
          project.evaluated_progress || 0,
          project.for_rfb_percent || 0,
          project.for_rfb_amount || 0,
          project.rfb_date || null,
          project.type_of_rfb || '',
          project.work_in_progress_ap || 0,
          project.work_in_progress_ep || 0,
          project.updated_contract_balance_percent || 0,
          project.total_contract_balance || 0,
          project.updated_contract_balance_net_percent || 0,
          project.updated_contract_balance_net || 0,
          project.remarks || '',
          project.contract_billed_gross_percent || 0,
          project.contract_billed || 0,
          project.contract_billed_net_percent || 0,
          project.amount_contract_billed_net || 0,
          project.for_retention_billing_percent || 0,
          project.amount_for_retention_billing || 0,
          project.retention_status || '',
          project.unevaluated_progress || 0
        );
        successCount++;
      } catch (error) {
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    });

    db.run('COMMIT', (err) => {
      if (err) {
        console.error('Error committing transaction:', err);
        res.status(500).json({ error: 'Failed to save projects' });
      } else {
        res.json({
          success: true,
          addedCount: successCount,
          errors: errors
        });
      }
    });
  });

  if (typeof stmt.finalize === 'function') stmt.finalize();
});

// Update project
app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const projectData = req.body;
  
  const columns = Object.keys(projectData).filter(key => key !== 'id');
  const setClause = columns.map(key => `${key} = ?`).join(',');
  const values = columns.map(key => projectData[key]);
  values.push(id);
  
  const query = `UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;

  db.run(query, values, function(err) {
    if (err) {
      console.error('Error updating project:', err);
      res.status(500).json({ error: 'Failed to update project' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Project not found' });
    } else {
      res.json({ message: 'Project updated successfully' });
    }
  });
});

// Delete projects
app.delete('/api/projects', (req, res) => {
  const { ids } = req.body;
  
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'IDs must be an array' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const query = `DELETE FROM projects WHERE id IN (${placeholders})`;

  db.run(query, ids, function(err) {
    if (err) {
      console.error('Error deleting projects:', err);
      res.status(500).json({ error: 'Failed to delete projects' });
    } else {
      res.json({ 
        success: true,
        deletedCount: this.changes 
      });
    }
  });
});

// Get project statistics
app.get('/api/stats', (req, res) => {
  const queries = {
    totalProjects: 'SELECT COUNT(*) as count FROM projects',
    projectsByStatus: `SELECT project_status, COUNT(*) as count FROM projects 
                      WHERE project_status IS NOT NULL 
                      GROUP BY project_status`,
    projectsByDirector: `SELECT project_director, COUNT(*) as count FROM projects 
                        WHERE project_director IS NOT NULL AND project_director != '' 
                        GROUP BY project_director`,
    totalContractValue: 'SELECT SUM(updated_contract_amount) as total FROM projects',
    totalBilled: 'SELECT SUM(contract_billed) as total FROM projects'
  };

  const stats = {};
  let completedQueries = 0;

  Object.keys(queries).forEach(key => {
    db.all(queries[key], [], (err, rows) => {
      if (err) {
        console.error(`Error in ${key} query:`, err);
        stats[key] = null;
      } else {
        stats[key] = rows;
      }
      
      completedQueries++;
      if (completedQueries === Object.keys(queries).length) {
        res.json(stats);
      }
    });
  });
});

// Get unique statuses
app.get('/api/projects/unique/statuses', (req, res) => {
  const query = 'SELECT DISTINCT project_status FROM projects WHERE project_status IS NOT NULL AND project_status != "" ORDER BY project_status';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching unique statuses:', err);
      return res.status(500).json({ error: 'Failed to fetch statuses' });
    }
    
    const statuses = rows.map(row => row.project_status);
    res.json(statuses);
  });
});

// Get unique years
app.get('/api/projects/unique/years', (req, res) => {
  const query = 'SELECT DISTINCT year FROM projects WHERE year IS NOT NULL ORDER BY year DESC';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching unique years:', err);
      return res.status(500).json({ error: 'Failed to fetch years' });
    }
    
    const years = rows.map(row => row.year);
    res.json(years);
  });
});

// Get unique categories
app.get('/api/projects/unique/categories', (req, res) => {
  const query = 'SELECT DISTINCT project_category FROM projects WHERE project_category IS NOT NULL AND project_category != "" ORDER BY project_category';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching unique categories:', err);
      return res.status(500).json({ error: 'Failed to fetch categories' });
    }
    
    const categories = rows.map(row => row.project_category);
    res.json(categories);
  });
});

// Get unique clients
app.get('/api/projects/unique/clients', (req, res) => {
  const query = 'SELECT DISTINCT account_name FROM projects WHERE account_name IS NOT NULL AND account_name != "" ORDER BY account_name';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching unique clients:', err);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }
    
    const clients = rows.map(row => row.account_name);
    res.json(clients);
  });
});

// ========== Clients API ==========
// Get all clients
app.get('/api/clients', (req, res) => {
  db.all('SELECT * FROM clients ORDER BY client_name', [], (err, rows) => {
    if (err) {
      console.error('Error fetching clients:', err);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }
    res.json(rows);
  });
});

// Get client by ID
app.get('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching client:', err);
      return res.status(500).json({ error: 'Failed to fetch client' });
    }
    if (!row) return res.status(404).json({ error: 'Client not found' });
    res.json(row);
  });
});

// Create client
app.post('/api/clients', (req, res) => {
  const { client_name, address, payment_terms, contact_person, designation, email_address } = req.body;
  if (!client_name || !client_name.trim()) {
    return res.status(400).json({ error: 'Client name is required' });
  }
  const query = `INSERT INTO clients (client_name, address, payment_terms, contact_person, designation, email_address, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
  db.run(query, [client_name.trim(), address || '', payment_terms || '', contact_person || '', designation || '', email_address || ''], function(err) {
    if (err) {
      console.error('Error creating client:', err);
      return res.status(500).json({ error: 'Failed to create client' });
    }
    res.status(201).json({ id: this.lastID, message: 'Client created successfully' });
  });
});

// Update client
app.put('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  const { client_name, address, payment_terms, contact_person, designation, email_address } = req.body;
  if (!client_name || !client_name.trim()) {
    return res.status(400).json({ error: 'Client name is required' });
  }
  const query = `UPDATE clients SET client_name = ?, address = ?, payment_terms = ?, contact_person = ?, designation = ?, email_address = ?, updated_at = datetime('now') WHERE id = ?`;
  db.run(query, [client_name.trim(), address || '', payment_terms || '', contact_person || '', designation || '', email_address || '', id], function(err) {
    if (err) {
      console.error('Error updating client:', err);
      return res.status(500).json({ error: 'Failed to update client' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client updated successfully' });
  });
});

// Delete client
app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting client:', err);
      return res.status(500).json({ error: 'Failed to delete client' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted successfully' });
  });
});

// Expense Management Endpoints

// Get expense categories
app.get('/api/expenses/categories', (req, res) => {
  res.json([]);
});

// Get expenses
app.get('/api/expenses', (req, res) => {
  const { projectId, category, status, year } = req.query;

  const expenses = [];
  let filteredExpenses = expenses;
  
  if (projectId) {
    filteredExpenses = filteredExpenses.filter(exp => exp.projectId === parseInt(projectId));
  }
  if (category) {
    filteredExpenses = filteredExpenses.filter(exp => exp.category === category);
  }
  if (status) {
    filteredExpenses = filteredExpenses.filter(exp => exp.status === status);
  }
  
  res.json(filteredExpenses);
});

// Add new expense
app.post('/api/expenses', (req, res) => {
  const { projectId, category, description, amount, date } = req.body;
  
  if (!projectId || !category || !description || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // In real app, save to database
  const newExpense = {
    id: Date.now().toString(),
    projectId: parseInt(projectId),
    category,
    description,
    amount: parseFloat(amount),
    date: date || new Date().toISOString(),
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  res.status(201).json({ success: true, expense: newExpense });
});

// Cash Advances (CA): request, list, approve (admin)
app.get('/api/cash-advances', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    const sql = isAdmin
      ? 'SELECT ca.*, u.username, u.full_name FROM cash_advances ca JOIN users u ON ca.user_id = u.id ORDER BY ca.id DESC'
      : 'SELECT ca.*, u.username, u.full_name FROM cash_advances ca JOIN users u ON ca.user_id = u.id WHERE ca.user_id = ? ORDER BY ca.id DESC';
    const params = isAdmin ? [] : [user.id];
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error fetching cash advances:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, cash_advances: rows || [] });
    });
  });
});

app.post('/api/cash-advances', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });
    const purpose = (req.body.purpose || '').trim() || null;
    const requestedAt = Math.floor(Date.now() / 1000);
    db.run(
      'INSERT INTO cash_advances (user_id, amount, balance_remaining, status, purpose, requested_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, amount, 0, 'pending', purpose, requestedAt, requestedAt],
      function (err) {
        if (err) {
          console.error('Error creating cash advance:', err);
          return res.status(500).json({ success: false, error: 'Database error' });
        }
        res.status(201).json({ success: true, id: this.lastID, message: 'Cash advance requested' });
      }
    );
  });
});

app.patch('/api/cash-advances/:id', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
    const { status } = req.body;
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'Status must be approved or rejected' });
    }
    db.get('SELECT id, amount, status FROM cash_advances WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!row) return res.status(404).json({ success: false, error: 'Cash advance not found' });
      if (row.status !== 'pending') return res.status(400).json({ success: false, error: 'Already processed' });
      const now = Math.floor(Date.now() / 1000);
      const balanceRemaining = status === 'approved' ? row.amount : 0;
      db.run(
        'UPDATE cash_advances SET status = ?, balance_remaining = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?',
        [status, balanceRemaining, status === 'approved' ? now : null, status === 'approved' ? user.id : null, now, id],
        function (err) {
          if (err) return res.status(500).json({ success: false, error: 'Database error' });
          res.json({ success: true, message: status === 'approved' ? 'Cash advance approved' : 'Cash advance rejected' });
        }
      );
    });
  });
});

// Liquidations: save draft, load, submit (optional link to CA to reduce balance)
app.get('/api/liquidations', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    const sql = isAdmin
      ? 'SELECT l.*, u.username, u.full_name FROM liquidations l JOIN users u ON l.user_id = u.id ORDER BY l.id DESC'
      : 'SELECT l.*, u.username, u.full_name FROM liquidations l JOIN users u ON l.user_id = u.id WHERE l.user_id = ? ORDER BY l.id DESC';
    const params = isAdmin ? [] : [user.id];
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error fetching liquidations:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, liquidations: rows || [] });
    });
  });
});

app.get('/api/liquidations/:id', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
    db.get('SELECT * FROM liquidations WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!row) return res.status(404).json({ success: false, error: 'Liquidation not found' });
      if (user.role !== 'superadmin' && user.role !== 'admin' && row.user_id !== user.id) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      res.json({ success: true, liquidation: row });
    });
  });
});

app.post('/api/liquidations', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { form_no, date_of_submission, employee_name, employee_number, rows_json, total_amount, status, ca_id } = req.body;
    const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
    const total = parseFloat(total_amount) || 0;
    const now = Math.floor(Date.now() / 1000);
    const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
    const caId = ca_id ? parseInt(ca_id, 10) : null;

    const insert = () => {
      db.run(
        'INSERT INTO liquidations (user_id, form_no, date_of_submission, employee_name, employee_number, rows_json, total_amount, ca_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.id, form_no || null, date_of_submission || null, employee_name || null, employee_number || null, JSON.stringify(rows), total, caId, liqStatus, now, now],
        function (err) {
          if (err) {
            console.error('Error creating liquidation:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
          }
          const lid = this.lastID;
          if (liqStatus === 'submitted' && caId) {
            db.run('UPDATE cash_advances SET balance_remaining = balance_remaining - ?, updated_at = ? WHERE id = ?', [total, now, caId], (err) => {
              if (err) console.error('Error reducing CA balance:', err);
            });
          }
          res.status(201).json({ success: true, id: lid, message: liqStatus === 'submitted' ? 'Liquidation submitted' : 'Draft saved' });
        }
      );
    };

    if (liqStatus === 'submitted' && caId) {
      db.get('SELECT id, balance_remaining FROM cash_advances WHERE id = ? AND user_id = ? AND status = ?', [caId, user.id, 'approved'], (err, ca) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });
        if (!ca) return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
        insert();
      });
    } else {
      insert();
    }
  });
});

app.put('/api/liquidations/:id', (req, res) => {
  getCurrentUser(req, (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
    db.get('SELECT id, user_id, status FROM liquidations WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!row) return res.status(404).json({ success: false, error: 'Liquidation not found' });
      if (row.user_id !== user.id) return res.status(403).json({ success: false, error: 'Forbidden' });
      if (row.status === 'submitted') return res.status(400).json({ success: false, error: 'Cannot edit submitted liquidation' });

      const { form_no, date_of_submission, employee_name, employee_number, rows_json, total_amount, status, ca_id } = req.body;
      const rows = rows_json ? (typeof rows_json === 'string' ? JSON.parse(rows_json) : rows_json) : [];
      const total = parseFloat(total_amount) || 0;
      const now = Math.floor(Date.now() / 1000);
      const liqStatus = status === 'submitted' ? 'submitted' : 'draft';
      const caId = ca_id ? parseInt(ca_id, 10) : null;

      const update = () => {
        db.run(
          'UPDATE liquidations SET form_no = ?, date_of_submission = ?, employee_name = ?, employee_number = ?, rows_json = ?, total_amount = ?, ca_id = ?, status = ?, updated_at = ? WHERE id = ?',
          [form_no || null, date_of_submission || null, employee_name || null, employee_number || null, JSON.stringify(rows), total, caId, liqStatus, now, id],
          function (err) {
            if (err) return res.status(500).json({ success: false, error: 'Database error' });
            if (liqStatus === 'submitted' && caId) {
              db.run('UPDATE cash_advances SET balance_remaining = balance_remaining - ?, updated_at = ? WHERE id = ?', [total, now, caId], (err) => {
                if (err) console.error('Error reducing CA balance:', err);
              });
            }
            res.json({ success: true, message: liqStatus === 'submitted' ? 'Liquidation submitted' : 'Draft updated' });
          }
        );
      };

      if (liqStatus === 'submitted' && caId) {
        db.get('SELECT id, balance_remaining FROM cash_advances WHERE id = ? AND user_id = ? AND status = ?', [caId, user.id, 'approved'], (err, ca) => {
          if (err) return res.status(500).json({ success: false, error: 'Database error' });
          if (!ca) return res.status(400).json({ success: false, error: 'Invalid or unauthorized cash advance' });
          update();
        });
      } else {
        update();
      }
    });
  });
});

// Forecasting Endpoints

// Get revenue forecast
app.get('/api/forecasting/revenue', (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  
  const revenueForecast = [
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
    { month: 'Dec 2025', historicalRevenue: 0, forecastedRevenue: 13500000, billingSchedule: 13000000, collections: 12200000 }
  ];
  
  res.json(revenueForecast);
});

// Get cash flow forecast
app.get('/api/forecasting/cashflow', (req, res) => {
  const cashFlowForecast = [
    { period: 'Q1 2025', actual: 25500000, predicted: 26200000, confidence: 85, upperBound: 28000000, lowerBound: 24400000 },
    { period: 'Q2 2025', predicted: 32100000, confidence: 78, upperBound: 35200000, lowerBound: 29000000 },
    { period: 'Q3 2025', predicted: 38900000, confidence: 72, upperBound: 43100000, lowerBound: 34700000 },
    { period: 'Q4 2025', predicted: 41200000, confidence: 68, upperBound: 46800000, lowerBound: 35600000 },
    { period: 'Q1 2026', predicted: 44500000, confidence: 62, upperBound: 51200000, lowerBound: 37800000 },
    { period: 'Q2 2026', predicted: 47800000, confidence: 58, upperBound: 55600000, lowerBound: 40000000 }
  ];
  
  res.json(cashFlowForecast);
});

// Get project forecasts
app.get('/api/forecasting/projects', (req, res) => {
  const projectForecasts = [
    {
      projectId: 1,
      projectName: 'PLDT CLARKTEL PAMPANGA',
      currentProgress: 65,
      predictedCompletion: new Date('2025-08-15').toISOString(),
      riskLevel: 'low',
      estimatedCost: 597582.68,
      actualCost: 389128.74,
      projectedFinalCost: 612000
    },
    {
      projectId: 2,
      projectName: 'SMART CAMPUS MODERNIZATION',
      currentProgress: 45,
      predictedCompletion: new Date('2025-12-20').toISOString(),
      riskLevel: 'medium',
      estimatedCost: 5000000,
      actualCost: 2250000,
      projectedFinalCost: 5200000
    },
    {
      projectId: 3,
      projectName: 'Network Infrastructure Upgrade',
      currentProgress: 25,
      predictedCompletion: new Date('2026-03-10').toISOString(),
      riskLevel: 'high',
      estimatedCost: 3200000,
      actualCost: 800000,
      projectedFinalCost: 3800000
    }
  ];
  
  res.json(projectForecasts);
});

// Get forecasting metrics
app.get('/api/forecasting/metrics', (req, res) => {
  const metrics = {
    totalForecastedRevenue: 142700000,
    growthRate: 15.2,
    highRiskProjects: 1,
    avgConfidence: 70.5,
    nextQuarterRevenue: 32100000,
    projectedProfit: 8500000
  };
  
  res.json(metrics);
});

// ========== Project Attachments API (OneDrive metadata) ==========
app.get('/api/projects/:id/attachments', (req, res) => {
  const projectId = req.params.id;
  db.all('SELECT * FROM project_attachments WHERE project_id = ? ORDER BY created_at DESC', [projectId], (err, rows) => {
    if (err) {
      console.error('Error fetching attachments:', err);
      return res.status(500).json({ error: 'Failed to fetch attachments' });
    }
    res.json(rows || []);
  });
});

app.post('/api/projects/:id/attachments', (req, res) => {
  const projectId = req.params.id;
  const { filename, onedrive_item_id, onedrive_web_url, file_size, uploaded_by } = req.body;
  if (!filename || !onedrive_item_id) {
    return res.status(400).json({ error: 'filename and onedrive_item_id are required' });
  }
  db.run(
    'INSERT INTO project_attachments (project_id, filename, onedrive_item_id, onedrive_web_url, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, filename, onedrive_item_id, onedrive_web_url || null, file_size || null, uploaded_by || null],
    function(err) {
      if (err) {
        console.error('Error creating attachment:', err);
        return res.status(500).json({ error: 'Failed to save attachment' });
      }
      res.status(201).json({ id: this.lastID, message: 'Attachment saved' });
    }
  );
});

app.delete('/api/projects/:projectId/attachments/:attachmentId', (req, res) => {
  const { projectId, attachmentId } = req.params;
  db.run('DELETE FROM project_attachments WHERE id = ? AND project_id = ?', [attachmentId, projectId], function(err) {
    if (err) {
      console.error('Error deleting attachment:', err);
      return res.status(500).json({ error: 'Failed to delete attachment' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Attachment not found' });
    res.json({ message: 'Attachment deleted' });
  });
});

// Suppliers (from DB; replaces CSV)
function ensureSuppliersTables(callback) {
  db.run('CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT, address TEXT, payment_terms TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)', (err) => {
    if (err) return callback(err);
    db.run('CREATE TABLE IF NOT EXISTS supplier_products (id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, name TEXT, part_no TEXT, description TEXT, brand TEXT, unit TEXT DEFAULT \'pcs\', unit_price REAL, price_date TEXT, FOREIGN KEY (supplier_id) REFERENCES suppliers(id))', (err2) => {
      if (err2) return callback(err2);
      callback();
    });
  });
}

app.get('/api/suppliers', (req, res) => {
  ensureSuppliersTables((err) => {
    if (err) {
      console.error('Error ensuring suppliers tables:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    db.all('SELECT * FROM suppliers ORDER BY name', [], (err, suppliers) => {
      if (err) {
        console.error('Error fetching suppliers:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!suppliers || suppliers.length === 0) {
        return res.json([]);
      }
      db.all('SELECT * FROM supplier_products ORDER BY supplier_id', [], (err2, products) => {
      if (err2) {
        console.error('Error fetching supplier_products:', err2);
        return res.status(500).json({ error: 'Database error' });
      }
      const bySupplier = (products || []).reduce((acc, p) => {
        if (!acc[p.supplier_id]) acc[p.supplier_id] = [];
        acc[p.supplier_id].push({
          id: p.id,
          name: p.name || '',
          partNo: p.part_no || '',
          description: p.description || '',
          brand: p.brand || undefined,
          unit: p.unit || 'pcs',
          unitPrice: p.unit_price != null ? p.unit_price : undefined,
          priceDate: p.price_date || undefined,
        });
        return acc;
      }, {});
      const list = suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        contactName: s.contact_name || '',
        email: s.email || '',
        phone: s.phone || '',
        address: s.address || '',
        paymentTerms: s.payment_terms || undefined,
        products: bySupplier[s.id] || [],
        createdAt: s.created_at || new Date().toISOString(),
      }));
      res.json(list);
    });
  });
  });
});

app.post('/api/suppliers', (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: 'Body must be an array of suppliers' });
  }
  ensureSuppliersTables((err) => {
    if (err) {
      console.error('Error ensuring suppliers tables:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    db.serialize(() => {
      db.run('DELETE FROM supplier_products', [], (delProdErr) => {
        if (delProdErr) {
          console.error('Error clearing supplier_products:', delProdErr);
          return res.status(500).json({ error: 'Database error' });
        }
        db.run('DELETE FROM suppliers', [], (delSupErr) => {
          if (delSupErr) {
            console.error('Error clearing suppliers:', delSupErr);
            return res.status(500).json({ error: 'Database error' });
          }
          if (list.length === 0) {
            return res.json({ saved: true, count: 0 });
          }
          const placeholders = list.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const supplierRows = list.flatMap((s) => [
            s.id,
            (s.name || '').trim() || 'Unknown',
            (s.contactName || '').trim() || null,
            (s.email || '').trim() || null,
            (s.phone || '').trim() || null,
            (s.address || '').trim() || null,
            (s.paymentTerms || '').trim() || null,
            s.createdAt || new Date().toISOString(),
          ]);
          db.run(`INSERT INTO suppliers (id, name, contact_name, email, phone, address, payment_terms, created_at) VALUES ${placeholders}`, supplierRows, (insSupErr) => {
            if (insSupErr) {
              console.error('Error inserting suppliers:', insSupErr);
              return res.status(500).json({ error: 'Database error' });
            }
            const products = list.flatMap((s) => (s.products || []).map((p) => ({
              id: p.id,
              supplier_id: s.id,
              name: p.name || null,
              part_no: p.partNo || null,
              description: p.description || null,
              brand: p.brand || null,
              unit: p.unit || 'pcs',
              unit_price: p.unitPrice != null ? p.unitPrice : null,
              price_date: p.priceDate || null,
            })));
            if (products.length === 0) {
              return res.json({ saved: true, count: list.length });
            }
            const prodPlaceholders = products.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const prodRows = products.flatMap((p) => [p.id, p.supplier_id, p.name, p.part_no, p.description, p.brand, p.unit, p.unit_price, p.price_date]);
            db.run(`INSERT INTO supplier_products (id, supplier_id, name, part_no, description, brand, unit, unit_price, price_date) VALUES ${prodPlaceholders}`, prodRows, (insProdErr) => {
              if (insProdErr) {
                console.error('Error inserting supplier_products:', insProdErr);
                return res.status(500).json({ error: 'Database error' });
              }
              res.json({ saved: true, count: list.length });
            });
          });
        });
      });
    });
  });
});

app.delete('/api/suppliers/:id', (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Supplier id required' });
  ensureSuppliersTables((err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.run('DELETE FROM supplier_products WHERE supplier_id = ?', [id], function (delProdErr) {
      if (delProdErr) {
        console.error('Error deleting supplier products:', delProdErr);
        return res.status(500).json({ error: 'Database error' });
      }
      db.run('DELETE FROM suppliers WHERE id = ?', [id], function (delSupErr) {
        if (delSupErr) {
          console.error('Error deleting supplier:', delSupErr);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ deleted: true });
      });
    });
  });
});

app.delete('/api/supplier-products/:id', (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Product id required' });
  ensureSuppliersTables((err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.run('DELETE FROM supplier_products WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('Error deleting supplier product:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ deleted: true });
    });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: 'Connected',
    timestamp: new Date().toISOString()
  });
});

// Production: serve React build (Render single-service deploy)
const buildPath = path.join(__dirname, 'build');
const { existsSync } = require('fs');
if (existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// Start server only after DB is ready (called from initializeDatabase createProjectsTable callback)
let server;
function startServer() {
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database: ${dbLabel}`);
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
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  if (server) server.close(() => {});
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});