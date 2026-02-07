const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Path to database
const dbPath = path.join(__dirname, '..', 'database', 'projects.db');
const db = new Database(dbPath);

console.log('Exporting data from SQLite to JSON files...');

// Export all projects
const projects = db.prepare('SELECT * FROM projects ORDER BY year DESC, id DESC').all();
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'projectsData.json'),
  JSON.stringify(projects, null, 2)
);
console.log(`Exported ${projects.length} projects`);

// Export project directors
const directors = db.prepare('SELECT * FROM project_directors ORDER BY name').all();
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'directorsData.json'),
  JSON.stringify(directors, null, 2)
);
console.log(`Exported ${directors.length} project directors`);

// Export billing status
const billingStatus = db.prepare('SELECT * FROM billing_status ORDER BY year DESC').all();
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'billingStatusData.json'),
  JSON.stringify(billingStatus, null, 2)
);
console.log(`Exported ${billingStatus.length} billing status records`);

// Export summary statistics
const yearSummaries = db.prepare(`
  SELECT 
    year,
    COUNT(*) as projectCount,
    COALESCE(SUM(updated_contract_amount), 0) as totalContractAmount,
    COALESCE(SUM(contract_billed), 0) as totalBilledAmount,
    COALESCE(SUM(updated_contract_balance_net), 0) as totalOutstandingBalance
  FROM projects
  WHERE year IS NOT NULL
  GROUP BY year
  ORDER BY year DESC
`).all();
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'yearSummariesData.json'),
  JSON.stringify(yearSummaries, null, 2)
);
console.log(`Exported ${yearSummaries.length} year summaries`);

// Export director summaries
const directorSummaries = db.prepare(`
  SELECT 
    project_director as directorName,
    COUNT(*) as projectCount,
    COALESCE(SUM(updated_contract_amount), 0) as totalContractAmount,
    COALESCE(SUM(contract_billed), 0) as totalBilledAmount,
    COALESCE(SUM(updated_contract_balance_net), 0) as totalOutstandingBalance
  FROM projects
  WHERE project_director IS NOT NULL AND project_director != ''
  GROUP BY project_director
  ORDER BY totalContractAmount DESC
`).all();
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'directorSummariesData.json'),
  JSON.stringify(directorSummaries, null, 2)
);
console.log(`Exported ${directorSummaries.length} director summaries`);

// Export unique values for filters
const uniqueClients = db.prepare(`
  SELECT DISTINCT account_name as value
  FROM projects 
  WHERE account_name IS NOT NULL AND account_name != '' 
  ORDER BY account_name
`).all().map(row => row.value);

const uniqueStatuses = db.prepare(`
  SELECT DISTINCT project_status as value
  FROM projects 
  WHERE project_status IS NOT NULL AND project_status != '' 
  ORDER BY project_status
`).all().map(row => row.value);

const uniqueCategories = db.prepare(`
  SELECT DISTINCT project_category as value
  FROM projects 
  WHERE project_category IS NOT NULL AND project_category != '' 
  ORDER BY project_category
`).all().map(row => row.value);

const uniqueYears = db.prepare(`
  SELECT DISTINCT year as value
  FROM projects 
  WHERE year IS NOT NULL 
  ORDER BY year DESC
`).all().map(row => row.value);

const filterOptions = {
  clients: uniqueClients,
  statuses: uniqueStatuses,
  categories: uniqueCategories,
  years: uniqueYears,
  directors: directors.map(d => d.name)
};

fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'data', 'filterOptionsData.json'),
  JSON.stringify(filterOptions, null, 2)
);
console.log('Exported filter options');

db.close();
console.log('Data export completed successfully!');