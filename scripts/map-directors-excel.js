const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Function to map Excel data by project directors
function mapDataByDirectors(excelFilePath) {
  try {
    console.log('Reading Excel file:', excelFilePath);
    
    // Read the Excel file
    const workbook = XLSX.readFile(excelFilePath);
    
    console.log('Available sheets:', workbook.SheetNames);
    
    // Object to store data grouped by directors
    const directorData = {};
    
    // Process each sheet
    workbook.SheetNames.forEach(sheetName => {
      console.log(`\nProcessing sheet: ${sheetName}`);
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, // Use array of arrays format
        defval: '' // Default value for empty cells
      });
      
      if (jsonData.length === 0) {
        console.log(`Sheet ${sheetName} is empty`);
        return;
      }
      
      // Get headers from first row
      const headers = jsonData[0];
      console.log('Headers:', headers);
      
      // Find the director column (look for variations)
      const directorColumnIndex = headers.findIndex(header => {
        if (typeof header === 'string') {
          const headerLower = header.toLowerCase();
          return headerLower === 'project director' ||
                 headerLower === 'pd' ||
                 headerLower === 'pm' ||
                 headerLower === 'project manager' ||
                 headerLower.includes('director') && !headerLower.includes('amount') && !headerLower.includes('contract');
        }
        return false;
      });
      
      if (directorColumnIndex === -1) {
        console.log(`No director column found in sheet ${sheetName}`);
        console.log('Available columns:', headers);
        return;
      }
      
      console.log(`Director column found at index ${directorColumnIndex}: ${headers[directorColumnIndex]}`);
      
      // Process data rows
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const director = row[directorColumnIndex];
        
        if (!director || director === '') {
          continue;
        }
        
        // Clean director name
        const cleanDirector = typeof director === 'string' ? director.trim() : String(director).trim();
        
        if (!directorData[cleanDirector]) {
          directorData[cleanDirector] = {
            name: cleanDirector,
            sheets: {},
            totalProjects: 0,
            projects: []
          };
        }
        
        if (!directorData[cleanDirector].sheets[sheetName]) {
          directorData[cleanDirector].sheets[sheetName] = [];
        }
        
        // Create project object with all data
        const project = {};
        headers.forEach((header, index) => {
          if (header && row[index] !== undefined) {
            project[header] = row[index];
          }
        });
        
        directorData[cleanDirector].sheets[sheetName].push(project);
        directorData[cleanDirector].projects.push({
          sheet: sheetName,
          data: project
        });
        directorData[cleanDirector].totalProjects++;
      }
    });
    
    // Generate summary
    console.log('\n=== DIRECTOR MAPPING SUMMARY ===');
    Object.keys(directorData).forEach(director => {
      const data = directorData[director];
      console.log(`\n${director}:`);
      console.log(`  Total Projects: ${data.totalProjects}`);
      console.log(`  Sheets: ${Object.keys(data.sheets).join(', ')}`);
      Object.keys(data.sheets).forEach(sheet => {
        console.log(`    ${sheet}: ${data.sheets[sheet].length} projects`);
      });
    });
    
    // Save detailed mapping to JSON files
    const outputDir = path.join(__dirname, '..', 'director-mappings');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save complete mapping
    const completeMappingPath = path.join(outputDir, 'complete-director-mapping.json');
    fs.writeFileSync(completeMappingPath, JSON.stringify(directorData, null, 2));
    console.log(`\nComplete mapping saved to: ${completeMappingPath}`);
    
    // Save summary
    const summary = {};
    Object.keys(directorData).forEach(director => {
      summary[director] = {
        name: director,
        totalProjects: directorData[director].totalProjects,
        sheets: Object.keys(directorData[director].sheets).map(sheet => ({
          sheetName: sheet,
          projectCount: directorData[director].sheets[sheet].length
        }))
      };
    });
    
    const summaryPath = path.join(outputDir, 'director-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Summary saved to: ${summaryPath}`);
    
    // Save individual director files
    Object.keys(directorData).forEach(director => {
      const safeDirectorName = director.replace(/[^a-zA-Z0-9]/g, '_');
      const directorPath = path.join(outputDir, `${safeDirectorName}.json`);
      fs.writeFileSync(directorPath, JSON.stringify(directorData[director], null, 2));
      console.log(`${director} data saved to: ${directorPath}`);
    });
    
    return directorData;
    
  } catch (error) {
    console.error('Error processing Excel file:', error);
    throw error;
  }
}

// Main execution
if (require.main === module) {
  const excelFilePath = process.argv[2] || '/Users/tjc/Downloads/NETPAC_AI_Consolidated_efa.xlsx';
  
  if (!fs.existsSync(excelFilePath)) {
    console.error('Excel file not found:', excelFilePath);
    process.exit(1);
  }
  
  console.log('Starting director mapping process...');
  mapDataByDirectors(excelFilePath);
  console.log('\nDirector mapping completed successfully!');
}

module.exports = { mapDataByDirectors };