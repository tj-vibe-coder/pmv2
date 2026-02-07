const Database = require('better-sqlite3');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Paths
const dbPath = path.join(__dirname, '..', 'database', 'projects.db');
const excelPath = '/Users/tjc/Downloads/NETPAC_AI_Consolidated_efa.xlsx';

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('=== SETTING UP DATABASE ===\n');

// Create tables
console.log('Creating tables...');

// Projects table
db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_no INTEGER,
        year INTEGER,
        am TEXT,
        ovp_number TEXT,
        po_number TEXT,
        po_date INTEGER,
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
        start_date INTEGER,
        duration_days INTEGER,
        completion_date INTEGER,
        payment_schedule TEXT,
        payment_terms TEXT,
        bonds_requirement TEXT,
        project_director TEXT,
        client_approver TEXT,
        progress_billing_schedule TEXT,
        mobilization_date INTEGER,
        updated_completion_date INTEGER,
        project_status TEXT,
        actual_site_progress_percent REAL,
        actual_progress REAL,
        evaluated_progress_percent REAL,
        evaluated_progress REAL,
        for_rfb_percent REAL,
        for_rfb_amount REAL,
        rfb_date INTEGER,
        type_of_rfb TEXT,
        work_in_progress_ap REAL,
        work_in_progress_ep REAL,
        updated_contract_balance_percent REAL,
        total_contract_balance REAL,
        updated_contract_balance_net_percent REAL,
        updated_contract_balance_net REAL,
        remarks TEXT,
        contract_billed_gross_percent REAL,
        contract_billed REAL,
        contract_billed_net_percent REAL,
        amount_contract_billed_net REAL,
        for_retention_billing_percent REAL,
        amount_for_retention_billing REAL,
        retention_status TEXT,
        unevaluated_progress REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Project Directors table (departments)
db.exec(`
    CREATE TABLE IF NOT EXISTS project_directors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Billing Status table
db.exec(`
    CREATE TABLE IF NOT EXISTS billing_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER,
        total_updated_contract_amount REAL,
        total_billed REAL,
        balance REAL,
        status TEXT,
        for_rfb_amount REAL,
        rfb_date INTEGER,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log('Tables created successfully!');

// Helper function to convert Excel date serial to JavaScript Date
function excelDateToJSDate(serial) {
    if (!serial || serial === '') return null;
    if (typeof serial === 'string') return null;
    
    // Excel's date system starts from 1900-01-01 (serial 1)
    // JavaScript Date constructor expects milliseconds since 1970-01-01
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
    const jsDate = new Date(excelEpoch.getTime() + (serial * 24 * 60 * 60 * 1000));
    return Math.floor(jsDate.getTime() / 1000); // Return Unix timestamp
}

// Helper function to clean and convert numeric values
function cleanNumeric(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const cleaned = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return isNaN(cleaned) ? null : cleaned;
    }
    return null;
}

// Helper function to clean text values
function cleanText(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
}

// Import data function
function importData() {
    console.log('\nImporting data from Excel...');
    
    try {
        const workbook = XLSX.readFile(excelPath);
        
        // Import Project Directors first
        const projectDirectors = new Set(['Fred Ramos', 'Paul Pascual', 'Anchy Vero', 'Mario Montenegro', 'George Urzal', 'Edbert Baligaya', 'Gerald San Diego']);
        
        const insertDirector = db.prepare(`
            INSERT OR IGNORE INTO project_directors (name) VALUES (?)
        `);
        
        projectDirectors.forEach(director => {
            insertDirector.run(director);
        });
        
        console.log(`Inserted ${projectDirectors.size} project directors.`);
        
        // Import Billing Status
        if (workbook.SheetNames.includes('BillingStatus')) {
            const billingSheet = workbook.Sheets['BillingStatus'];
            const billingData = XLSX.utils.sheet_to_json(billingSheet, { header: 1 });
            
            if (billingData.length > 1) {
                const insertBilling = db.prepare(`
                    INSERT INTO billing_status (
                        year, total_updated_contract_amount, total_billed, balance,
                        status, for_rfb_amount, rfb_date, remarks
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                for (let i = 1; i < billingData.length; i++) {
                    const row = billingData[i];
                    if (row && row.length > 0 && row[0]) {
                        insertBilling.run(
                            cleanNumeric(row[0]),
                            cleanNumeric(row[1]),
                            cleanNumeric(row[2]),
                            cleanNumeric(row[3]),
                            cleanText(row[4]),
                            cleanNumeric(row[5]),
                            excelDateToJSDate(row[6]),
                            cleanText(row[7])
                        );
                    }
                }
                console.log(`Imported ${billingData.length - 1} billing status records.`);
            }
        }
        
        // Import main project data from "All PD's" sheet
        if (workbook.SheetNames.includes("All PD's")) {
            const projectSheet = workbook.Sheets["All PD's"];
            const projectData = XLSX.utils.sheet_to_json(projectSheet, { header: 1 });
            
            if (projectData.length > 1) {
                const insertProject = db.prepare(`
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
                        retention_status, unevaluated_progress
                    ) VALUES (${Array(53).fill('?').join(', ')})
                `);
                
                let importedCount = 0;
                
                // Skip header row (index 0)
                for (let i = 1; i < projectData.length; i++) {
                    const row = projectData[i];
                    if (row && row.length > 10 && row[0]) { // Basic validation
                        try {
                            insertProject.run(
                                cleanNumeric(row[0]),  // item_no
                                cleanNumeric(row[1]),  // year
                                cleanText(row[2]),     // am
                                cleanText(row[3]),     // ovp_number
                                cleanText(row[4]),     // po_number
                                excelDateToJSDate(row[5]), // po_date
                                cleanText(row[6]),     // client_status
                                cleanText(row[7]),     // account_name
                                cleanText(row[8]),     // project_name
                                cleanText(row[9]),     // project_category
                                cleanText(row[10]),    // project_location
                                cleanText(row[11]),    // scope_of_work
                                cleanText(row[12]),    // qtn_no
                                cleanText(row[13]),    // ovp_category
                                cleanNumeric(row[14]), // contract_amount
                                cleanNumeric(row[15]), // updated_contract_amount
                                cleanNumeric(row[16]), // down_payment_percent
                                cleanNumeric(row[17]), // retention_percent
                                excelDateToJSDate(row[18]), // start_date
                                cleanNumeric(row[19]), // duration_days
                                excelDateToJSDate(row[20]), // completion_date
                                cleanText(row[21]),    // payment_schedule
                                cleanText(row[22]),    // payment_terms
                                cleanText(row[23]),    // bonds_requirement
                                cleanText(row[24]),    // project_director
                                cleanText(row[25]),    // client_approver
                                cleanText(row[26]),    // progress_billing_schedule
                                excelDateToJSDate(row[27]), // mobilization_date
                                excelDateToJSDate(row[28]), // updated_completion_date
                                cleanText(row[29]),    // project_status
                                cleanNumeric(row[30]), // actual_site_progress_percent
                                cleanNumeric(row[31]), // actual_progress
                                cleanNumeric(row[32]), // evaluated_progress_percent
                                cleanNumeric(row[33]), // evaluated_progress
                                cleanNumeric(row[34]), // for_rfb_percent
                                cleanNumeric(row[35]), // for_rfb_amount
                                excelDateToJSDate(row[36]), // rfb_date
                                cleanText(row[37]),    // type_of_rfb
                                cleanNumeric(row[38]), // work_in_progress_ap
                                cleanNumeric(row[39]), // work_in_progress_ep
                                cleanNumeric(row[40]), // updated_contract_balance_percent
                                cleanNumeric(row[41]), // total_contract_balance
                                cleanNumeric(row[42]), // updated_contract_balance_net_percent
                                cleanNumeric(row[43]), // updated_contract_balance_net
                                cleanText(row[44]),    // remarks
                                cleanNumeric(row[45]), // contract_billed_gross_percent
                                cleanNumeric(row[46]), // contract_billed
                                cleanNumeric(row[47]), // contract_billed_net_percent
                                cleanNumeric(row[48]), // amount_contract_billed_net
                                cleanNumeric(row[49]), // for_retention_billing_percent
                                cleanNumeric(row[50]), // amount_for_retention_billing
                                cleanText(row[51]),    // retention_status
                                cleanNumeric(row[52] || row[51])  // unevaluated_progress
                            );
                            importedCount++;
                        } catch (error) {
                            console.log(`Error importing row ${i}:`, error.message);
                        }
                    }
                }
                
                console.log(`Imported ${importedCount} projects from ${projectData.length - 1} total rows.`);
            }
        }
        
        console.log('\nDatabase setup completed successfully!');
        console.log(`Database location: ${dbPath}`);
        
        // Show summary statistics
        const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
        const directorCount = db.prepare('SELECT COUNT(*) as count FROM project_directors').get();
        const billingCount = db.prepare('SELECT COUNT(*) as count FROM billing_status').get();
        
        console.log('\n=== DATABASE SUMMARY ===');
        console.log(`Projects: ${projectCount.count}`);
        console.log(`Project Directors: ${directorCount.count}`);
        console.log(`Billing Records: ${billingCount.count}`);
        
        // Show project directors with project counts
        const directorsWithCounts = db.prepare(`
            SELECT pd.name, COUNT(p.id) as project_count
            FROM project_directors pd
            LEFT JOIN projects p ON pd.name = p.project_director
            GROUP BY pd.name
            ORDER BY project_count DESC
        `).all();
        
        console.log('\n=== PROJECTS BY DIRECTOR ===');
        directorsWithCounts.forEach(director => {
            console.log(`${director.name}: ${director.project_count} projects`);
        });
        
    } catch (error) {
        console.error('Error importing data:', error);
        throw error;
    }
}

// Run the import
importData();

// Close database
db.close();

console.log('\nDatabase setup script completed!');