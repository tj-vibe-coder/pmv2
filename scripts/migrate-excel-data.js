const fs = require('fs');
const http = require('http');

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: result, status: res.statusCode });
        } catch (e) {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: body, status: res.statusCode });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function migrateExcelData() {
  try {
    // Read the Excel data from All PD's sheet
    const excelData = JSON.parse(fs.readFileSync('sheet-6-All_PD_s.json', 'utf8'));
    
    console.log(`Found ${excelData.length} projects in Excel file`);
    
    // Map Excel data to our project structure
    const mappedProjects = excelData.map((excelProject, index) => {
      // Convert Excel date fields (Excel serial numbers) to Unix timestamps
      const convertExcelDate = (excelDate) => {
        if (!excelDate || excelDate === '') return null;
        // Excel date serial number to Unix timestamp
        const excelEpoch = new Date(1900, 0, 1).getTime();
        const msPerDay = 24 * 60 * 60 * 1000;
        const jsDate = new Date(excelEpoch + (excelDate - 2) * msPerDay); // -2 for Excel leap year bug
        return Math.floor(jsDate.getTime() / 1000);
      };
      
      return {
        id: index + 1,
        item_no: excelProject[' Item No.'] || 0,
        year: excelProject[' YEAR'] || new Date().getFullYear(),
        am: excelProject[' AM'] || '',
        ovp_number: excelProject[' OVP NUMBER'] || '',
        po_number: excelProject['PO NO.'] || '',
        po_date: convertExcelDate(excelProject['PO DATE']),
        client_status: excelProject[' CLIENT STATUS'] || '',
        account_name: excelProject[' ACCOUNT NAME'] || '',
        project_name: excelProject[' PROJECT NAME'] || '',
        project_category: excelProject[' PROJECT CATEGORY'] || '',
        project_location: excelProject[' PROJECT LOCATION'] || '',
        scope_of_work: excelProject[' SCOPE OF WORK'] || '',
        qtn_no: excelProject[' QTN NO.'] || '',
        ovp_category: excelProject[' OVP CATEGORY'] || '',
        contract_amount: excelProject[' CONTRACT AMOUNT '] || 0,
        updated_contract_amount: excelProject[' UPDATED CONTRACT AMOUNT '] || 0,
        down_payment_percent: excelProject['DOWN PAYMENT %'] || 0,
        retention_percent: excelProject['RETENTION %'] || 0,
        start_date: convertExcelDate(excelProject['START DATE']),
        duration_days: excelProject['DURATION\r\n(CALENDAR DAYS)'] || 0,
        completion_date: convertExcelDate(excelProject['COMPLETION DATE']),
        payment_schedule: excelProject[' PAYMENT SCHEDULE\r\n(DP-PB-RET)'] || '',
        payment_terms: excelProject[' PAYMENT TERMS\r\n(DAYS)'] || '',
        bonds_requirement: excelProject[' BONDS REQUIREMENT'] || '',
        project_director: excelProject['PROJECT DIRECTOR'] || '',
        client_approver: excelProject['CLIENT APPROVER'] || '',
        progress_billing_schedule: excelProject['PROGRESS BILLING SCHEDULE'] || '',
        mobilization_date: convertExcelDate(excelProject['MOBILIZATION DATE']),
        updated_completion_date: convertExcelDate(excelProject['UPDATED COMPLETION DATE']),
        project_status: excelProject['PROJECT STATUS'] || 'OPEN',
        actual_site_progress_percent: excelProject['% - ACTUAL SITE PROGRESS'] || 0,
        actual_progress: excelProject['ACTUAL PROGRESS'] || 0,
        evaluated_progress_percent: excelProject['% - EVALUATED PROGRESS'] || 0,
        evaluated_progress: excelProject['EVALUATED PROGRESS\r\n(EP)'] || 0,
        for_rfb_percent: excelProject[' % - FOR RFB (EVALUATED  - CONTRACT BILLED GROSS)'] || 0,
        for_rfb_amount: excelProject['FOR RFB (EP-CB)'] || 0,
        rfb_date: convertExcelDate(excelProject['RFB DATE']),
        type_of_rfb: excelProject['TYPE OF RFB (DP, PB, FB, RET)'] || '',
        work_in_progress_ap: excelProject['WORK IN PROGRESS\r\n(UC-AP)'] || 0,
        work_in_progress_ep: excelProject['WORK IN PROGRESS\r\n(UC-EP)'] || 0,
        updated_contract_balance_percent: excelProject['% - UPDATED CONTRACT BALANCE\r\n(UC - Updated Contract Billed) Gross'] || 0,
        total_contract_balance: excelProject['TOTAL CONTRACT BALANCE (UCA-CB)'] || 0,
        updated_contract_balance_net_percent: excelProject['% - UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net'] || 0,
        updated_contract_balance_net: excelProject['UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net'] || 0,
        remarks: excelProject['REMARKS'] || '',
        contract_billed_gross_percent: excelProject['% - CONTRACT BILLED GROSS (RFB)'] || 0,
        contract_billed: excelProject['CONTRACT  BILLED\r\n(CB)'] || 0,
        contract_billed_net_percent: excelProject['% - CONTRACT BILLED NET (INVOICED)'] || 0,
        amount_contract_billed_net: excelProject['CONTRACT BILLED NET (INVOICED)'] || 0,
        for_retention_billing_percent: excelProject['% - FOR RETENTION BILLING'] || 0,
        amount_for_retention_billing: excelProject['FOR RETENTION BILLING'] || 0,
        retention_status: excelProject['RETENTION STATUS'] || '',
        unevaluated_progress: excelProject['UN-EVALUATED PROGRESS'] || 0
      };
    });
    
    // Remove projects with empty names
    const validProjects = mappedProjects.filter(p => p.project_name && p.project_name.trim() !== '');
    
    console.log(`${validProjects.length} valid projects after filtering`);
    
    // Migrate projects in batches of 50
    const batchSize = 50;
    let migrated = 0;
    
    for (let i = 0; i < validProjects.length; i += batchSize) {
      const batch = validProjects.slice(i, i + batchSize);
      
      console.log(`Migrating batch ${Math.floor(i/batchSize) + 1}: projects ${i + 1} to ${Math.min(i + batchSize, validProjects.length)}`);
      
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/projects/bulk',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await makeRequest(options, { projects: batch });
      
      if (response.ok) {
        migrated += response.data.addedCount;
        console.log(`✓ Successfully migrated ${response.data.addedCount} projects (Total: ${migrated})`);
        
        if (response.data.errors && response.data.errors.length > 0) {
          console.warn('Warnings:', response.data.errors.slice(0, 3)); // Show first 3 errors
        }
      } else {
        console.error('Failed to migrate batch:', response.data);
        break;
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\\n✅ Excel data migration completed! Migrated ${migrated} out of ${validProjects.length} projects`);
    
    // Show director statistics
    console.log('\\n=== DIRECTOR STATISTICS ===');
    const directorStats = {};
    validProjects.forEach(project => {
      const director = project.project_director;
      if (director) {
        directorStats[director] = (directorStats[director] || 0) + 1;
      }
    });
    
    Object.entries(directorStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([director, count]) => {
        console.log(`${director}: ${count} projects`);
      });
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateExcelData();