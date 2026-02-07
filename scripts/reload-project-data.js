const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function reloadProjectData() {
  try {
    console.log('Starting project data reload...');
    
    // Connect to database
    const dbPath = path.join(__dirname, '..', 'projects.db');
    const db = new sqlite3.Database(dbPath);
    
    // Read Excel file
    const excelPath = path.join(__dirname, '..', 'public', 'NETPAC_AI_Consolidated_efa.xlsx');
    const workbook = XLSX.readFile(excelPath);
    const sheetName = "All PD's"; // Use the sheet with all project data
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} projects in Excel file`);
    
    // Clear existing projects first
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM projects', (err) => {
        if (err) reject(err);
        else {
          console.log('Cleared existing projects');
          resolve();
        }
      });
    });
    
    // Insert projects
    let insertedCount = 0;
    
    for (const row of data) {
      const project = {
        item_no: row[' Item No.'] || Math.floor(Math.random() * 1000) + 1,
        year: row[' YEAR'] || new Date().getFullYear(),
        am: row[' AM'] || '',
        ovp_number: row[' OVP NUMBER'] || '',
        po_number: row['PO NO.'] || '',
        po_date: row['PO DATE'] ? Math.floor(new Date('1900-01-01').getTime() / 1000 + (row['PO DATE'] * 24 * 60 * 60)) : null,
        client_status: row[' CLIENT STATUS'] || '',
        account_name: row[' ACCOUNT NAME'] || '',
        project_name: row[' PROJECT NAME'] || '',
        project_director: row['PROJECT DIRECTOR'] || '',
        project_category: row[' PROJECT CATEGORY'] || '',
        project_location: row[' PROJECT LOCATION'] || '',
        scope_of_work: row[' SCOPE OF WORK'] || '',
        qtn_no: row['QTN NO.'] || '',
        ovp_category: row[' OVP CATEGORY'] || '',
        contract_amount: parseFloat(row[' CONTRACT AMOUNT ']) || 0,
        updated_contract_amount: parseFloat(row[' UPDATED CONTRACT AMOUNT ']) || parseFloat(row[' CONTRACT AMOUNT ']) || 0,
        down_payment_percent: parseFloat(row['DOWN PAYMENT %']) || 0.1,
        retention_percent: parseFloat(row['RETENTION %']) || 0.1,
        start_date: row['START DATE'] ? Math.floor(new Date('1900-01-01').getTime() / 1000 + (row['START DATE'] * 24 * 60 * 60)) : Math.floor(Date.now() / 1000),
        duration_days: parseInt(row['DURATION\r\n(CALENDAR DAYS)']) || 90,
        completion_date: row['COMPLETION DATE'] ? Math.floor(new Date('1900-01-01').getTime() / 1000 + (row['COMPLETION DATE'] * 24 * 60 * 60)) : Math.floor((Date.now() + (90 * 24 * 60 * 60 * 1000)) / 1000),
        project_status: row['PROJECT STATUS'] || 'OPEN',
        payment_schedule: row[' PAYMENT SCHEDULE\r\n(DP-PB-RET)'] || '10%, 80%, 10%',
        payment_terms: row[' PAYMENT TERMS\r\n(DAYS)'] || '30',
        bonds_requirement: row[' BONDS REQUIREMENT'] || 'NO',
        client_approver: row['CLIENT APPROVER'] || '',
        progress_billing_schedule: row['PROGRESS BILLING SCHEDULE'] || 'Monthly',
        actual_site_progress_percent: parseFloat(row['% - ACTUAL SITE PROGRESS']) || 0,
        actual_progress: parseFloat(row['ACTUAL PROGRESS']) || 0,
        evaluated_progress_percent: parseFloat(row['% - EVALUATED PROGRESS']) || 0,
        evaluated_progress: parseFloat(row['EVALUATED PROGRESS\r\n(EP)']) || 0,
        for_rfb_percent: parseFloat(row[' % - FOR RFB (EVALUATED  - CONTRACT BILLED GROSS)']) || 0,
        for_rfb_amount: parseFloat(row['FOR RFB (EP-CB)']) || 0,
        rfb_date: row['RFB DATE'] ? Math.floor(new Date('1900-01-01').getTime() / 1000 + (row['RFB DATE'] * 24 * 60 * 60)) : null,
        type_of_rfb: row['TYPE OF RFB (DP, PB, FB, RET)'] || '',
        work_in_progress_ap: parseFloat(row['WORK IN PROGRESS\r\n(UC-AP)']) || 0,
        work_in_progress_ep: parseFloat(row['WORK IN PROGRESS\r\n(UC-EP)']) || 0,
        updated_contract_balance_percent: parseFloat(row['% - UPDATED CONTRACT BALANCE\r\n(UC - Updated Contract Billed) Gross']) || 0,
        total_contract_balance: parseFloat(row['TOTAL CONTRACT BALANCE (UCA-CB)']) || 0,
        updated_contract_balance_net_percent: parseFloat(row['% - UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net']) || 0,
        updated_contract_balance_net: parseFloat(row['UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net']) || 0,
        remarks: row['REMARKS'] || '',
        contract_billed_gross_percent: parseFloat(row['% - CONTRACT BILLED GROSS (RFB)']) || 0,
        contract_billed: parseFloat(row['CONTRACT  BILLED\r\n(CB)']) || 0,
        contract_billed_net_percent: parseFloat(row['CONTRACT BILLED NET %']) || 0,
        amount_contract_billed_net: parseFloat(row['CONTRACT BILLED NET']) || 0,
        for_retention_billing_percent: parseFloat(row['FOR RETENTION BILLING %']) || 0,
        amount_for_retention_billing: parseFloat(row['AMOUNT FOR RETENTION BILLING']) || 0,
        retention_status: row['RETENTION STATUS'] || '',
        unevaluated_progress: parseFloat(row['UN-EVALUATED PROGRESS']) || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await new Promise((resolve, reject) => {
        const sql = `INSERT INTO projects (
          item_no, year, am, ovp_number, po_number, po_date, client_status,
          account_name, project_name, project_director, project_category,
          project_location, scope_of_work, qtn_no, ovp_category,
          contract_amount, updated_contract_amount, down_payment_percent,
          retention_percent, start_date, duration_days, completion_date,
          project_status, payment_schedule, payment_terms, bonds_requirement,
          client_approver, progress_billing_schedule, actual_site_progress_percent,
          actual_progress, evaluated_progress_percent, evaluated_progress,
          for_rfb_percent, for_rfb_amount, rfb_date, type_of_rfb,
          work_in_progress_ap, work_in_progress_ep, updated_contract_balance_percent,
          total_contract_balance, updated_contract_balance_net_percent,
          updated_contract_balance_net, remarks, contract_billed_gross_percent,
          contract_billed, contract_billed_net_percent, amount_contract_billed_net,
          for_retention_billing_percent, amount_for_retention_billing,
          retention_status, unevaluated_progress, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const values = [
          project.item_no, project.year, project.am, project.ovp_number,
          project.po_number, project.po_date, project.client_status,
          project.account_name, project.project_name, project.project_director,
          project.project_category, project.project_location, project.scope_of_work,
          project.qtn_no, project.ovp_category, project.contract_amount,
          project.updated_contract_amount, project.down_payment_percent,
          project.retention_percent, project.start_date, project.duration_days,
          project.completion_date, project.project_status, project.payment_schedule,
          project.payment_terms, project.bonds_requirement, project.client_approver,
          project.progress_billing_schedule, project.actual_site_progress_percent,
          project.actual_progress, project.evaluated_progress_percent,
          project.evaluated_progress, project.for_rfb_percent, project.for_rfb_amount,
          project.rfb_date, project.type_of_rfb, project.work_in_progress_ap,
          project.work_in_progress_ep, project.updated_contract_balance_percent,
          project.total_contract_balance, project.updated_contract_balance_net_percent,
          project.updated_contract_balance_net, project.remarks,
          project.contract_billed_gross_percent, project.contract_billed,
          project.contract_billed_net_percent, project.amount_contract_billed_net,
          project.for_retention_billing_percent, project.amount_for_retention_billing,
          project.retention_status, project.unevaluated_progress,
          project.created_at, project.updated_at
        ];
        
        db.run(sql, values, function(err) {
          if (err) {
            console.error(`Error inserting project ${project.project_name}:`, err);
            reject(err);
          } else {
            insertedCount++;
            if (insertedCount % 100 === 0) {
              console.log(`Inserted ${insertedCount} projects...`);
            }
            resolve();
          }
        });
      });
    }
    
    console.log(`Successfully inserted ${insertedCount} projects into database`);
    
    // Verify count
    await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM projects', (err, row) => {
        if (err) reject(err);
        else {
          console.log(`Database now contains ${row.count} projects`);
          resolve();
        }
      });
    });
    
    // Close database
    db.close();
    console.log('Project data reload completed successfully!');
    
  } catch (error) {
    console.error('Error reloading project data:', error);
    process.exit(1);
  }
}

reloadProjectData();