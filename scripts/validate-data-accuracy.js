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

async function validateDataAccuracy() {
  try {
    console.log('🔍 Validating data accuracy between Excel and Database...\n');
    
    // Read Excel data
    const excelData = JSON.parse(fs.readFileSync('sheet-6-All_PD_s.json', 'utf8'));
    console.log(`📊 Excel file contains: ${excelData.length} projects`);
    
    // Get database data
    const getOptions = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/projects',
      method: 'GET'
    };
    
    const response = await makeRequest(getOptions);
    if (!response.ok) {
      throw new Error(`Failed to fetch database projects: ${response.status}`);
    }
    
    const dbData = response.data;
    console.log(`💾 Database contains: ${dbData.length} projects\n`);
    
    // Validate project counts by director
    console.log('👥 DIRECTOR PROJECT COUNTS COMPARISON');
    console.log('=====================================');
    
    const excelDirectorCounts = {};
    const dbDirectorCounts = {};
    
    // Count Excel directors (normalize names)
    excelData.forEach(project => {
      let director = project['PROJECT DIRECTOR'];
      if (director) {
        director = normalizeDirectorName(director);
        excelDirectorCounts[director] = (excelDirectorCounts[director] || 0) + 1;
      }
    });
    
    // Count database directors
    dbData.forEach(project => {
      const director = project.project_director;
      if (director) {
        dbDirectorCounts[director] = (dbDirectorCounts[director] || 0) + 1;
      }
    });
    
    // Compare director counts
    const allDirectors = [...new Set([...Object.keys(excelDirectorCounts), ...Object.keys(dbDirectorCounts)])].sort();
    let directorMismatches = 0;
    
    allDirectors.forEach(director => {
      const excelCount = excelDirectorCounts[director] || 0;
      const dbCount = dbDirectorCounts[director] || 0;
      const match = excelCount === dbCount ? '✅' : '❌';
      
      if (excelCount !== dbCount) {
        directorMismatches++;
      }
      
      console.log(`${match} ${director}: Excel(${excelCount}) vs DB(${dbCount})`);
    });
    
    // Validate financial totals
    console.log('\\n💰 FINANCIAL TOTALS COMPARISON');
    console.log('==============================');
    
    const excelTotals = {
      totalContracts: 0,
      totalBilled: 0,
      totalOutstanding: 0,
      totalProjects: excelData.filter(p => p[' PROJECT NAME'] && p[' PROJECT NAME'].trim()).length
    };
    
    const dbTotals = {
      totalContracts: 0,
      totalBilled: 0,
      totalOutstanding: 0,
      totalProjects: dbData.length
    };
    
    // Calculate Excel totals
    excelData.forEach(project => {
      if (project[' PROJECT NAME'] && project[' PROJECT NAME'].trim()) {
        excelTotals.totalContracts += project[' UPDATED CONTRACT AMOUNT '] || 0;
        excelTotals.totalBilled += project['CONTRACT  BILLED\r\n(CB)'] || 0;
        excelTotals.totalOutstanding += project['UPDATED CONTRACT BALANCE\r\n(UCA-CB)Net'] || 0;
      }
    });
    
    // Calculate database totals
    dbData.forEach(project => {
      dbTotals.totalContracts += project.updated_contract_amount || 0;
      dbTotals.totalBilled += project.contract_billed || 0;
      dbTotals.totalOutstanding += project.updated_contract_balance_net || 0;
    });
    
    const formatCurrency = (amount) => `₱${(amount / 1000000).toFixed(2)}M`;
    
    console.log(`📊 Total Projects: Excel(${excelTotals.totalProjects}) vs DB(${dbTotals.totalProjects}) ${excelTotals.totalProjects === dbTotals.totalProjects ? '✅' : '❌'}`);
    console.log(`💼 Total Contracts: Excel(${formatCurrency(excelTotals.totalContracts)}) vs DB(${formatCurrency(dbTotals.totalContracts)}) ${Math.abs(excelTotals.totalContracts - dbTotals.totalContracts) < 1000 ? '✅' : '❌'}`);
    console.log(`💳 Total Billed: Excel(${formatCurrency(excelTotals.totalBilled)}) vs DB(${formatCurrency(dbTotals.totalBilled)}) ${Math.abs(excelTotals.totalBilled - dbTotals.totalBilled) < 1000 ? '✅' : '❌'}`);
    console.log(`⏳ Total Outstanding: Excel(${formatCurrency(excelTotals.totalOutstanding)}) vs DB(${formatCurrency(dbTotals.totalOutstanding)}) ${Math.abs(excelTotals.totalOutstanding - dbTotals.totalOutstanding) < 1000 ? '✅' : '❌'}`);
    
    // Validate yearly breakdown
    console.log('\\n📅 YEARLY BREAKDOWN COMPARISON');
    console.log('==============================');
    
    const excelByYear = {};
    const dbByYear = {};
    
    // Group Excel data by year
    excelData.forEach(project => {
      if (project[' PROJECT NAME'] && project[' PROJECT NAME'].trim()) {
        const year = project[' YEAR'];
        if (year) {
          if (!excelByYear[year]) {
            excelByYear[year] = { count: 0, contracts: 0, billed: 0 };
          }
          excelByYear[year].count++;
          excelByYear[year].contracts += project[' UPDATED CONTRACT AMOUNT '] || 0;
          excelByYear[year].billed += project['CONTRACT  BILLED\r\n(CB)'] || 0;
        }
      }
    });
    
    // Group database data by year
    dbData.forEach(project => {
      const year = project.year;
      if (year) {
        if (!dbByYear[year]) {
          dbByYear[year] = { count: 0, contracts: 0, billed: 0 };
        }
        dbByYear[year].count++;
        dbByYear[year].contracts += project.updated_contract_amount || 0;
        dbByYear[year].billed += project.contract_billed || 0;
      }
    });
    
    const allYears = [...new Set([...Object.keys(excelByYear), ...Object.keys(dbByYear)])].sort();
    let yearMismatches = 0;
    
    allYears.forEach(year => {
      const excel = excelByYear[year] || { count: 0, contracts: 0, billed: 0 };
      const db = dbByYear[year] || { count: 0, contracts: 0, billed: 0 };
      
      const countMatch = excel.count === db.count ? '✅' : '❌';
      const contractMatch = Math.abs(excel.contracts - db.contracts) < 1000 ? '✅' : '❌';
      
      if (excel.count !== db.count || Math.abs(excel.contracts - db.contracts) >= 1000) {
        yearMismatches++;
      }
      
      console.log(`${year}: Projects ${countMatch}(${excel.count}/${db.count}) Contracts ${contractMatch}(${formatCurrency(excel.contracts)}/${formatCurrency(db.contracts)})`);
    });
    
    // Generate trend data for charts
    console.log('\\n📈 GENERATING TREND DATA');
    console.log('=========================');
    
    const trendData = allYears.map(year => {
      const excel = excelByYear[year] || { count: 0, contracts: 0, billed: 0 };
      const db = dbByYear[year] || { count: 0, contracts: 0, billed: 0 };
      
      return {
        year: parseInt(year),
        projectCount: db.count,
        totalContractAmount: db.contracts,
        totalBilledAmount: db.billed,
        totalOutstanding: db.contracts - db.billed,
        // Calculate growth rates
        contractGrowth: 0, // Will be calculated next
        billedGrowth: 0
      };
    }).sort((a, b) => a.year - b.year);
    
    // Calculate year-over-year growth rates
    for (let i = 1; i < trendData.length; i++) {
      const current = trendData[i];
      const previous = trendData[i - 1];
      
      if (previous.totalContractAmount > 0) {
        current.contractGrowth = ((current.totalContractAmount - previous.totalContractAmount) / previous.totalContractAmount) * 100;
      }
      
      if (previous.totalBilledAmount > 0) {
        current.billedGrowth = ((current.totalBilledAmount - previous.totalBilledAmount) / previous.totalBilledAmount) * 100;
      }
    }
    
    // Save trend data
    fs.writeFileSync('../src/data/trendData.json', JSON.stringify(trendData, null, 2));
    console.log('✅ Trend data saved to trendData.json');
    
    // Summary
    console.log('\\n📋 VALIDATION SUMMARY');
    console.log('======================');
    console.log(`Director mismatches: ${directorMismatches}`);
    console.log(`Year mismatches: ${yearMismatches}`);
    console.log(`Overall data accuracy: ${directorMismatches === 0 && yearMismatches === 0 ? '✅ PERFECT' : '⚠️  NEEDS REVIEW'}`);
    
    if (directorMismatches === 0 && yearMismatches === 0) {
      console.log('🎉 All data matches perfectly between Excel and Database!');
    } else {
      console.log('⚠️  Some discrepancies found. Please review the data.');
    }
    
  } catch (error) {
    console.error('❌ Error validating data accuracy:', error);
  }
}

function normalizeDirectorName(name) {
  const mapping = {
    'ANCHY VERO': 'Anchy Vero',
    'ANCHY VERO ': 'Anchy Vero',
    'Paul Pascual': 'Paul Pascual',
    'PAUL PASCUAL': 'Paul Pascual',
    'PAUL PASCUAL ': 'Paul Pascual',
    'Mario Montenegro': 'Mario Montenegro',
    'Fred Ramos': 'Fred Ramos',
    'George Urzal': 'George Urzal',
    'GEORGE URZAL': 'George Urzal',
    'GEORGE URZAL ': 'George Urzal',
    'Edbert Baligaya': 'Edbert Baligaya',
    'Gerald San Diego': 'Gerald San Diego'
  };
  
  return mapping[name] || name;
}

validateDataAccuracy();