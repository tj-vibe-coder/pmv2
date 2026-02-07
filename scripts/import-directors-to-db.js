const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, '..', 'projects.db');
const MAPPINGS_DIR = path.join(__dirname, '..', 'director-mappings');

// Initialize database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Create comprehensive projects table with all Excel columns
function createProjectsTable() {
  return new Promise((resolve, reject) => {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS projects_excel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_no TEXT,
        year INTEGER,
        am TEXT,
        ovp_number TEXT UNIQUE,
        po_no TEXT,
        po_date TEXT,
        client_status TEXT,
        account_name TEXT,
        project_name TEXT,
        project_category TEXT,
        project_location TEXT,
        scope_of_work TEXT,
        qtn_no TEXT,
        ovp_category TEXT,
        contract_amount REAL,
        updated_contract_amount REAL,
        down_payment_percent REAL,
        retention_percent REAL,
        start_date TEXT,
        duration_days INTEGER,
        completion_date TEXT,
        payment_schedule TEXT,
        payment_terms_days INTEGER,
        bonds_requirement TEXT,
        project_director TEXT,
        client_approver TEXT,
        progress_billing_schedule TEXT,
        mobilization_date TEXT,
        updated_completion_date TEXT,
        project_status TEXT,
        actual_site_progress_percent REAL,
        actual_progress REAL,
        evaluated_progress_percent REAL,
        evaluated_progress REAL,
        for_rfb_percent REAL,
        for_rfb_amount REAL,
        rfb_date TEXT,
        type_of_rfb TEXT,
        work_in_progress_uc_ap REAL,
        work_in_progress_uc_ep REAL,
        updated_contract_balance_percent_gross REAL,
        total_contract_balance REAL,
        updated_contract_balance_percent_net REAL,
        updated_contract_balance_net REAL,
        remarks TEXT,
        contract_billed_gross_percent REAL,
        contract_billed REAL,
        contract_billed_net_percent REAL,
        amount_contract_billed_net REAL,
        for_retention_billing_percent REAL,
        amount_for_retention_billing REAL,
        retention_status TEXT,
        un_evaluated_progress REAL,
        source_sheet TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    db.run(createTableSQL, (err) => {
      if (err) {
        console.error('Error creating projects_excel table:', err);
        reject(err);
      } else {
        console.log('Projects_excel table created successfully');
        resolve();
      }
    });
  });
}

// Create indexes for better performance
function createIndexes() {
  return new Promise((resolve, reject) => {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_project_director ON projects_excel(project_director)',
      'CREATE INDEX IF NOT EXISTS idx_year ON projects_excel(year)',
      'CREATE INDEX IF NOT EXISTS idx_project_status ON projects_excel(project_status)',
      'CREATE INDEX IF NOT EXISTS idx_ovp_number ON projects_excel(ovp_number)',
      'CREATE INDEX IF NOT EXISTS idx_account_name ON projects_excel(account_name)',
      'CREATE INDEX IF NOT EXISTS idx_project_category ON projects_excel(project_category)',
      'CREATE INDEX IF NOT EXISTS idx_contract_amount ON projects_excel(contract_amount)',
      'CREATE INDEX IF NOT EXISTS idx_updated_contract_amount ON projects_excel(updated_contract_amount)'
    ];

    let completed = 0;
    indexes.forEach(indexSQL => {
      db.run(indexSQL, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          reject(err);
          return;
        }
        completed++;
        if (completed === indexes.length) {
          console.log('All indexes created successfully');
          resolve();
        }
      });
    });
  });
}

// Map Excel column names to database column names
function mapColumnNames(excelData) {
  const mappedData = {};
  
  Object.keys(excelData).forEach(key => {
    // Clean the key by removing special characters and normalizing
    let cleanKey = key
      .replace(/\r\n/g, '_')  // Replace \r\n with _
      .replace(/\r/g, '_')    // Replace \r with _
      .replace(/\n/g, '_')    // Replace \n with _
      .replace(/[^a-zA-Z0-9\s]/g, '_')  // Replace special chars with _
      .replace(/\s+/g, '_')   // Replace spaces with _
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .toLowerCase();
    
    // Handle specific mappings
    const specificMappings = {
      'item_no': 'item_no',
      'year': 'year',
      'am': 'am',
      'ovp_number': 'ovp_number',
      'po_no': 'po_no',
      'po_date': 'po_date',
      'client_status': 'client_status',
      'account_name': 'account_name',
      'project_name': 'project_name',
      'project_category': 'project_category',
      'project_location': 'project_location',
      'scope_of_work': 'scope_of_work',
      'qtn_no': 'qtn_no',
      'ovp_category': 'ovp_category',
      'contract_amount': 'contract_amount',
      'updated_contract_amount': 'updated_contract_amount',
      'down_payment_': 'down_payment_percent',
      'retention_': 'retention_percent',
      'start_date': 'start_date',
      'duration_calendar_days': 'duration_days',
      'completion_date': 'completion_date',
      'payment_schedule_dp_pb_ret': 'payment_schedule',
      'payment_terms_days': 'payment_terms_days',
      'bonds_requirement': 'bonds_requirement',
      'project_director': 'project_director',
      'client_approver': 'client_approver',
      'progress_billing_schedule': 'progress_billing_schedule',
      'mobilization_date': 'mobilization_date',
      'updated_completion_date': 'updated_completion_date',
      'project_status': 'project_status',
      '_actual_site_progress': 'actual_site_progress_percent',
      'actual_progress': 'actual_progress',
      '_evaluated_progress': 'evaluated_progress_percent',
      'evaluated_progress_ep': 'evaluated_progress',
      '_for_rfb_evaluated_contract_billed_gross': 'for_rfb_percent',
      'for_rfb_ep_cb': 'for_rfb_amount',
      'rfb_date': 'rfb_date',
      'type_of_rfb_dp_pb_fb_ret': 'type_of_rfb',
      'work_in_progress_uc_ap': 'work_in_progress_uc_ap',
      'work_in_progress_uc_ep': 'work_in_progress_uc_ep',
      '_updated_contract_balance_uc_updated_contract_billed_gross': 'updated_contract_balance_percent_gross',
      'total_contract_balance_uca_cb': 'total_contract_balance',
      '_updated_contract_balance_uca_cb_net': 'updated_contract_balance_percent_net',
      'updated_contract_balance_uca_cb_net': 'updated_contract_balance_net',
      'remarks': 'remarks',
      '_contract_billed_gross_rfb': 'contract_billed_gross_percent',
      'contract_billed_cb': 'contract_billed',
      '_contract_billed_net_invoiced': 'contract_billed_net_percent',
      'amount_contract_billed_net_invoiced': 'amount_contract_billed_net',
      '_for_retention_billing': 'for_retention_billing_percent',
      'amount_for_retention_billing': 'amount_for_retention_billing',
      'retention_status': 'retention_status',
      'un_evaluated_progress': 'un_evaluated_progress'
    };

    const dbColumn = specificMappings[cleanKey] || cleanKey;
    mappedData[dbColumn] = excelData[key];
  });

  return mappedData;
}

// Insert projects for a specific director
function insertDirectorProjects(directorName, projects) {
  return new Promise((resolve, reject) => {
    console.log(`\nProcessing ${directorName}: ${projects.length} projects`);
    
    // Clear existing data for this director
    db.run('DELETE FROM projects_excel WHERE project_director = ?', [directorName], (err) => {
      if (err) {
        console.error(`Error clearing existing data for ${directorName}:`, err);
        reject(err);
        return;
      }

      let insertedCount = 0;
      let errorCount = 0;

      projects.forEach((project, index) => {
        const mappedProject = mapColumnNames(project.data || project);
        
        // Ensure project_director is set
        mappedProject.project_director = directorName;
        mappedProject.source_sheet = project.sheet || 'All PD\'s';

        // Generate column names and placeholders
        const columns = Object.keys(mappedProject).filter(key => mappedProject[key] !== undefined);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => mappedProject[col]);

        const insertSQL = `
          INSERT OR REPLACE INTO projects_excel (${columns.join(', ')})
          VALUES (${placeholders})
        `;

        db.run(insertSQL, values, function(err) {
          if (err) {
            console.error(`Error inserting project ${index + 1} for ${directorName}:`, err);
            errorCount++;
          } else {
            insertedCount++;
          }

          // Check if this is the last project
          if (insertedCount + errorCount === projects.length) {
            console.log(`${directorName}: ${insertedCount} projects inserted, ${errorCount} errors`);
            resolve({ inserted: insertedCount, errors: errorCount });
          }
        });
      });

      if (projects.length === 0) {
        resolve({ inserted: 0, errors: 0 });
      }
    });
  });
}

// Main import function
async function importAllDirectors() {
  try {
    console.log('Starting database import process...');

    // Create table and indexes
    await createProjectsTable();
    await createIndexes();

    // Read complete mapping data
    const completeMappingPath = path.join(MAPPINGS_DIR, 'complete-director-mapping.json');
    
    if (!fs.existsSync(completeMappingPath)) {
      throw new Error('Complete mapping file not found. Please run the Excel mapping script first.');
    }

    console.log('Reading complete director mapping data...');
    const completeMapping = JSON.parse(fs.readFileSync(completeMappingPath, 'utf8'));

    let totalInserted = 0;
    let totalErrors = 0;

    // Process each director
    for (const [directorName, directorData] of Object.entries(completeMapping)) {
      try {
        const result = await insertDirectorProjects(directorName, directorData.projects);
        totalInserted += result.inserted;
        totalErrors += result.errors;
      } catch (err) {
        console.error(`Failed to process ${directorName}:`, err);
        totalErrors++;
      }
    }

    console.log('\n=== IMPORT SUMMARY ===');
    console.log(`Total projects inserted: ${totalInserted}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Directors processed: ${Object.keys(completeMapping).length}`);

    // Generate some verification queries
    console.log('\n=== VERIFICATION ===');
    
    // Count by director
    db.all(`
      SELECT project_director, COUNT(*) as project_count, 
             SUM(updated_contract_amount) as total_contract_amount
      FROM projects_excel 
      GROUP BY project_director 
      ORDER BY project_count DESC
    `, (err, rows) => {
      if (err) {
        console.error('Error in verification query:', err);
      } else {
        console.log('\nProjects by Director:');
        rows.forEach(row => {
          console.log(`${row.project_director}: ${row.project_count} projects, Total Contract: ₱${(row.total_contract_amount || 0).toLocaleString()}`);
        });
      }

      // Close database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('\nDatabase import completed successfully!');
        }
      });
    });

  } catch (error) {
    console.error('Import process failed:', error);
    db.close();
    process.exit(1);
  }
}

// Run import if called directly
if (require.main === module) {
  importAllDirectors();
}

module.exports = { importAllDirectors };