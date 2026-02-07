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

// Create a simple projects table with essential columns
function createSimpleProjectsTable() {
  return new Promise((resolve, reject) => {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS projects_from_excel (
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
        duration_text TEXT,
        completion_date TEXT,
        payment_schedule TEXT,
        payment_terms TEXT,
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
        data_json TEXT,  -- Store the complete original data as JSON
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    db.run(createTableSQL, (err) => {
      if (err) {
        console.error('Error creating projects_from_excel table:', err);
        reject(err);
      } else {
        console.log('Projects_from_excel table created successfully');
        resolve();
      }
    });
  });
}

// Create indexes
function createIndexes() {
  return new Promise((resolve, reject) => {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_excel_project_director ON projects_from_excel(project_director)',
      'CREATE INDEX IF NOT EXISTS idx_excel_year ON projects_from_excel(year)',
      'CREATE INDEX IF NOT EXISTS idx_excel_project_status ON projects_from_excel(project_status)',
      'CREATE INDEX IF NOT EXISTS idx_excel_ovp_number ON projects_from_excel(ovp_number)',
      'CREATE INDEX IF NOT EXISTS idx_excel_account_name ON projects_from_excel(account_name)',
      'CREATE INDEX IF NOT EXISTS idx_excel_project_category ON projects_from_excel(project_category)'
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

// Map Excel data to our simplified schema
function mapToSimpleSchema(excelData) {
  // Parse numeric values safely
  const parseNumber = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  };

  return {
    item_no: excelData['Item No.'] || null,
    year: parseNumber(excelData['YEAR']) || null,
    am: excelData['AM'] || null,
    ovp_number: excelData['OVP NUMBER'] || null,
    po_no: excelData['PO NO.'] || null,
    po_date: excelData['PO DATE'] || null,
    client_status: excelData['CLIENT STATUS'] || null,
    account_name: excelData['ACCOUNT NAME'] || null,
    project_name: excelData['PROJECT NAME'] || null,
    project_category: excelData['PROJECT CATEGORY'] || null,
    project_location: excelData['PROJECT LOCATION'] || null,
    scope_of_work: excelData['SCOPE OF WORK'] || null,
    qtn_no: excelData['QTN NO.'] || null,
    ovp_category: excelData['OVP CATEGORY'] || null,
    contract_amount: parseNumber(excelData['CONTRACT AMOUNT']),
    updated_contract_amount: parseNumber(excelData['UPDATED CONTRACT AMOUNT']),
    down_payment_percent: parseNumber(excelData['DOWN PAYMENT %']),
    retention_percent: parseNumber(excelData['RETENTION %']),
    start_date: excelData['START DATE'] || null,
    duration_text: excelData['DURATION\r\n(CALENDAR DAYS)'] || excelData['DURATION\\r\\n(CALENDAR DAYS)'] || null,
    completion_date: excelData['COMPLETION DATE'] || null,
    payment_schedule: excelData['PAYMENT SCHEDULE\r\n(DP-PB-RET)'] || excelData['PAYMENT SCHEDULE\\r\\n(DP-PB-RET)'] || null,
    payment_terms: excelData['PAYMENT TERMS\r\n(DAYS)'] || excelData['PAYMENT TERMS\\r\\n(DAYS)'] || null,
    bonds_requirement: excelData['BONDS REQUIREMENT'] || null,
    project_director: (excelData['PROJECT DIRECTOR'] || '').trim(),
    client_approver: excelData['CLIENT APPROVER'] || null,
    progress_billing_schedule: excelData['PROGRESS BILLING SCHEDULE'] || null,
    mobilization_date: excelData['MOBILIZATION DATE'] || null,
    updated_completion_date: excelData['UPDATED COMPLETION DATE'] || null,
    project_status: excelData['PROJECT STATUS'] || null,
    actual_site_progress_percent: parseNumber(excelData['% - ACTUAL SITE PROGRESS']),
    actual_progress: parseNumber(excelData['ACTUAL PROGRESS']),
    evaluated_progress_percent: parseNumber(excelData['% - EVALUATED PROGRESS']),
    evaluated_progress: parseNumber(excelData['EVALUATED PROGRESS\r\n(EP)'] || excelData['EVALUATED PROGRESS\\r\\n(EP)']),
    for_rfb_percent: parseNumber(excelData[' % - FOR RFB (EVALUATED  - CONTRACT BILLED GROSS)']),
    for_rfb_amount: parseNumber(excelData['FOR RFB (EP-CB)']),
    rfb_date: excelData['RFB DATE'] || null,
    type_of_rfb: excelData['TYPE OF RFB (DP, PB, FB, RET)'] || null,
    work_in_progress_uc_ap: parseNumber(excelData['WORK IN PROGRESS\r\n(UC-AP)'] || excelData['WORK IN PROGRESS\\r\\n(UC-AP)']),
    work_in_progress_uc_ep: parseNumber(excelData['WORK IN PROGRESS\r\n(UC-EP)'] || excelData['WORK IN PROGRESS\\r\\n(UC-EP)']),
    updated_contract_balance_percent_gross: parseNumber(excelData['% - UPDATED CONTRACT BALANCE\r\n(UC - Updated Contract Billed) Gross'] || excelData['% - UPDATED CONTRACT BALANCE\\r\\n(UC - Updated Contract Billed) Gross']),
    total_contract_balance: parseNumber(excelData['TOTAL CONTRACT BALANCE (UCA-CB)']),
    updated_contract_balance_percent_net: parseNumber(excelData['% - UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net'] || excelData['% - UPDATED CONTRACT BALANCE\\r\\n(UCA-CB)Net']),
    updated_contract_balance_net: parseNumber(excelData['UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net'] || excelData['UPDATED CONTRACT BALANCE\\r\\n(UCA-CB)Net']),
    remarks: excelData['REMARKS'] || null,
    contract_billed_gross_percent: parseNumber(excelData['% - CONTRACT BILLED GROSS (RFB)']),
    contract_billed: parseNumber(excelData['CONTRACT  BILLED\r\n(CB)'] || excelData['CONTRACT  BILLED\\r\\n(CB)']),
    contract_billed_net_percent: parseNumber(excelData['% - CONTRACT BILLED NET (INVOICED)']),
    amount_contract_billed_net: parseNumber(excelData['AMOUNT - CONTRACT BILLED NET (INVOICED)']),
    for_retention_billing_percent: parseNumber(excelData['% - FOR RETENTION BILLING']),
    amount_for_retention_billing: parseNumber(excelData['AMOUNT - FOR RETENTION BILLING']),
    retention_status: excelData['RETENTION STATUS'] || null,
    un_evaluated_progress: parseNumber(excelData['UN-EVALUATED PROGRESS']),
    data_json: JSON.stringify(excelData)  // Store complete original data
  };
}

// Insert projects for a specific director
function insertDirectorProjects(directorName, projects) {
  return new Promise((resolve, reject) => {
    console.log(`\nProcessing ${directorName}: ${projects.length} projects`);
    
    // Clear existing data for this director
    db.run('DELETE FROM projects_from_excel WHERE project_director = ?', [directorName], (err) => {
      if (err) {
        console.error(`Error clearing existing data for ${directorName}:`, err);
        reject(err);
        return;
      }

      if (projects.length === 0) {
        resolve({ inserted: 0, errors: 0 });
        return;
      }

      let insertedCount = 0;
      let errorCount = 0;

      projects.forEach((project, index) => {
        const projectData = project.data || project;
        const mappedData = mapToSimpleSchema(projectData);
        
        // Ensure director name consistency
        mappedData.project_director = directorName;

        const columns = Object.keys(mappedData);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => mappedData[col]);

        const insertSQL = `
          INSERT OR REPLACE INTO projects_from_excel (${columns.join(', ')})
          VALUES (${placeholders})
        `;

        db.run(insertSQL, values, function(err) {
          if (err) {
            console.error(`Error inserting project ${index + 1} (${mappedData.ovp_number}) for ${directorName}:`, err.message);
            errorCount++;
          } else {
            insertedCount++;
            if (insertedCount % 50 === 0) {
              process.stdout.write('.');
            }
          }

          // Check if this is the last project
          if (insertedCount + errorCount === projects.length) {
            console.log(`\n${directorName}: ${insertedCount} projects inserted, ${errorCount} errors`);
            resolve({ inserted: insertedCount, errors: errorCount });
          }
        });
      });
    });
  });
}

// Main import function
async function importAllDirectors() {
  try {
    console.log('Starting database import process...');

    // Create table and indexes
    await createSimpleProjectsTable();
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

    // Generate verification queries
    console.log('\n=== VERIFICATION ===');
    
    // Count by director
    db.all(`
      SELECT project_director, COUNT(*) as project_count, 
             ROUND(SUM(COALESCE(updated_contract_amount, contract_amount, 0)), 2) as total_contract_amount,
             ROUND(SUM(COALESCE(contract_billed, 0)), 2) as total_billed_amount
      FROM projects_from_excel 
      WHERE project_director IS NOT NULL AND project_director != ''
      GROUP BY project_director 
      ORDER BY project_count DESC
    `, (err, rows) => {
      if (err) {
        console.error('Error in verification query:', err);
      } else {
        console.log('\nProjects by Director:');
        rows.forEach(row => {
          console.log(`${row.project_director}: ${row.project_count} projects, Contract: ₱${(row.total_contract_amount || 0).toLocaleString()}, Billed: ₱${(row.total_billed_amount || 0).toLocaleString()}`);
        });
      }

      // Close database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('\nDatabase import completed successfully!');
          console.log('Data saved to table: projects_from_excel');
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