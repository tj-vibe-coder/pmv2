const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize SQLite database
const dbPath = path.join(__dirname, 'projects.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

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
    } else {
      console.log('Projects table ready');
      // Add project_no column if missing (for existing databases)
      db.run('ALTER TABLE projects ADD COLUMN project_no TEXT', () => {});
    }
  });

  // Create users table
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `;

  db.run(createUsersTable, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table ready');
      // Create default admin user with a delay to ensure table is ready
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

  // Create indexes for better performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_director ON projects(project_director)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_project_status ON projects(project_status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_year ON projects(year)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_username ON users(username)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email ON users(email)`);
}

// Create default users
function createDefaultUsers() {
  // Simple password hashing (in production, use bcrypt)
  const adminPasswordHash = Buffer.from('admin123').toString('base64');
  const userPasswordHash = Buffer.from('user123').toString('base64');
  
  db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
    if (err) {
      console.error('Error checking for admin user:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@netpacific.com', adminPasswordHash, 'admin'],
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
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['user', 'user@netpacific.com', userPasswordHash, 'user'],
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

  // IOCT admin: projects@iocontroltech.com
  const projectsPasswordHash = Buffer.from('IOCT0201!').toString('base64');
  db.get('SELECT id FROM users WHERE username = ? OR email = ?', ['projects', 'projects@iocontroltech.com'], (err, row) => {
    if (err) {
      console.error('Error checking for projects admin:', err);
    } else if (!row) {
      db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['projects', 'projects@iocontroltech.com', projectsPasswordHash, 'admin'],
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

    // Generate simple token (in production, use JWT)
    const token = Buffer.from(`${user.id}:${user.username}:${Date.now()}`).toString('base64');

    // Return user data (without password)
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
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

  if (!['admin', 'user', 'viewer'].includes(role)) {
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

    db.run(
      'INSERT INTO users (username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, role, createdAt, createdAt],
      function(err) {
        if (err) {
          console.error('Error creating user:', err);
          return res.json({ success: false, error: 'Failed to create user account' });
        }

        console.log(`New user registered: ${username} (${email}) with role: ${role}`);
        res.json({ 
          success: true, 
          message: 'User account created successfully',
          user: {
            id: this.lastID,
            username,
            email,
            role,
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
        created_at: user.created_at,
        updated_at: user.updated_at
      };

      res.json({ success: true, user: userData });
    });
  } catch (error) {
    res.json({ success: false, error: 'Invalid token' });
  }
});

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

  stmt.finalize();
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: 'Connected',
    timestamp: new Date().toISOString()
  });
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${dbPath}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});