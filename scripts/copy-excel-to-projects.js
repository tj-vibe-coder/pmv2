const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, '..', 'projects.db');

// Initialize database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Function to parse Excel date (if it's a number, convert from Excel serial date)
function parseExcelDate(dateValue) {
  if (!dateValue) return null;
  
  // If it's already a string date, try to parse it
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : Math.floor(parsed.getTime() / 1000);
  }
  
  // If it's a number, assume it's Excel serial date
  if (typeof dateValue === 'number' && dateValue > 25000) {
    // Excel serial date to Unix timestamp
    // Excel epoch starts at 1900-01-01, but has a bug counting 1900 as leap year
    const excelEpoch = new Date('1899-12-30'); // Adjusted for the bug
    const jsDate = new Date(excelEpoch.getTime() + (dateValue * 24 * 60 * 60 * 1000));
    return Math.floor(jsDate.getTime() / 1000);
  }
  
  return null;
}

// Function to safely parse numbers
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

// Function to clean text values
function cleanText(value) {
  if (!value) return null;
  return String(value).trim() || null;
}

// Main copy function
async function copyExcelToProjects() {
  try {
    console.log('Starting copy process from projects_from_excel to projects...');
    
    // First, let's check how many records we have in the source table
    const countResult = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM projects_from_excel', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`Found ${countResult.count} projects in Excel data`);
    
    // Clear existing data in projects table (optional - comment out if you want to keep existing data)
    console.log('Clearing existing projects table...');
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM projects', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Reset the auto-increment counter
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence WHERE name="projects"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Get all Excel data
    console.log('Fetching Excel project data...');
    const excelProjects = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM projects_from_excel ORDER BY year DESC, item_no ASC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`Processing ${excelProjects.length} projects...`);
    
    // Insert each project with proper data mapping
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < excelProjects.length; i++) {
      const project = excelProjects[i];
      
      try {
        // Map Excel data to projects table structure
        const mappedProject = {
          item_no: parseNumber(project.item_no) || null,
          year: parseNumber(project.year) || new Date().getFullYear(),
          am: cleanText(project.am),
          ovp_number: cleanText(project.ovp_number),
          po_number: cleanText(project.po_no),
          po_date: parseExcelDate(project.po_date),
          client_status: cleanText(project.client_status),
          account_name: cleanText(project.account_name) || 'Unknown Account',
          project_name: cleanText(project.project_name) || 'Unnamed Project',
          project_category: cleanText(project.project_category),
          project_location: cleanText(project.project_location),
          scope_of_work: cleanText(project.scope_of_work),
          qtn_no: cleanText(project.qtn_no),
          ovp_category: cleanText(project.ovp_category),
          contract_amount: parseNumber(project.contract_amount),
          updated_contract_amount: parseNumber(project.updated_contract_amount),
          down_payment_percent: parseNumber(project.down_payment_percent),
          retention_percent: parseNumber(project.retention_percent),
          start_date: parseExcelDate(project.start_date),
          duration_days: parseNumber(project.duration_text?.match(/\\d+/)?.[0]) || 0,
          completion_date: parseExcelDate(project.completion_date),
          payment_schedule: cleanText(project.payment_schedule),
          payment_terms: cleanText(project.payment_terms),
          bonds_requirement: cleanText(project.bonds_requirement),
          project_director: cleanText(project.project_director) || 'Unknown Director',
          client_approver: cleanText(project.client_approver),
          progress_billing_schedule: cleanText(project.progress_billing_schedule),
          mobilization_date: parseExcelDate(project.mobilization_date),
          updated_completion_date: parseExcelDate(project.updated_completion_date),
          project_status: cleanText(project.project_status) || 'OPEN',
          actual_site_progress_percent: parseNumber(project.actual_site_progress_percent),
          actual_progress: parseNumber(project.actual_progress),
          evaluated_progress_percent: parseNumber(project.evaluated_progress_percent),
          evaluated_progress: parseNumber(project.evaluated_progress),
          for_rfb_percent: parseNumber(project.for_rfb_percent),
          for_rfb_amount: parseNumber(project.for_rfb_amount),
          rfb_date: parseExcelDate(project.rfb_date),
          type_of_rfb: cleanText(project.type_of_rfb),
          work_in_progress_ap: parseNumber(project.work_in_progress_uc_ap),
          work_in_progress_ep: parseNumber(project.work_in_progress_uc_ep),
          updated_contract_balance_percent: parseNumber(project.updated_contract_balance_percent_gross),
          total_contract_balance: parseNumber(project.total_contract_balance),
          updated_contract_balance_net_percent: parseNumber(project.updated_contract_balance_percent_net),
          updated_contract_balance_net: parseNumber(project.updated_contract_balance_net),
          remarks: cleanText(project.remarks),
          contract_billed_gross_percent: parseNumber(project.contract_billed_gross_percent),
          contract_billed: parseNumber(project.contract_billed),
          contract_billed_net_percent: parseNumber(project.contract_billed_net_percent),
          amount_contract_billed_net: parseNumber(project.amount_contract_billed_net),
          for_retention_billing_percent: parseNumber(project.for_retention_billing_percent),
          amount_for_retention_billing: parseNumber(project.amount_for_retention_billing),
          retention_status: cleanText(project.retention_status),
          unevaluated_progress: parseNumber(project.un_evaluated_progress)
        };
        
        // Insert into projects table
        const columns = Object.keys(mappedProject);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => mappedProject[col]);
        
        const insertSQL = `
          INSERT INTO projects (${columns.join(', ')})
          VALUES (${placeholders})
        `;
        
        await new Promise((resolve, reject) => {
          db.run(insertSQL, values, function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });
        
        successCount++;
        
        // Progress indicator
        if (successCount % 100 === 0) {
          console.log(`Processed ${successCount}/${excelProjects.length} projects...`);
        }
        
      } catch (err) {
        console.error(`Error processing project ${i + 1} (${project.ovp_number}):`, err.message);
        errorCount++;
      }
    }
    
    console.log('\\n=== COPY SUMMARY ===');
    console.log(`Total projects processed: ${excelProjects.length}`);
    console.log(`Successfully copied: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    // Verify the copy
    console.log('\\n=== VERIFICATION ===');
    const verificationQuery = `
      SELECT 
        project_director,
        COUNT(*) as project_count,
        ROUND(SUM(COALESCE(updated_contract_amount, contract_amount, 0)), 2) as total_contract_amount
      FROM projects 
      WHERE project_director IS NOT NULL AND project_director != ''
      GROUP BY project_director 
      ORDER BY project_count DESC
    `;
    
    const verification = await new Promise((resolve, reject) => {
      db.all(verificationQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\\nProjects by Director in main projects table:');
    verification.forEach(row => {
      console.log(`${row.project_director}: ${row.project_count} projects, ₱${(row.total_contract_amount || 0).toLocaleString()}`);
    });
    
    console.log('\\n✅ Excel data successfully copied to main projects table!');
    console.log('The frontend will now display all Excel project data.');
    
  } catch (error) {
    console.error('Copy process failed:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed.');
      }
    });
  }
}

// Run copy if called directly
if (require.main === module) {
  copyExcelToProjects();
}

module.exports = { copyExcelToProjects };