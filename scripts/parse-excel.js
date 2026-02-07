const XLSX = require('xlsx');
const fs = require('fs');

async function parseExcelFile() {
  try {
    // Read the Excel file
    const workbook = XLSX.readFile('../public/NETPAC_AI_Consolidated_efa.xlsx');
    
    // Get the first sheet name
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('Excel file parsed successfully');
    console.log(`Total rows: ${data.length}`);
    console.log('\nFirst few rows:');
    console.log(data.slice(0, 3));
    
    // Extract unique directors
    const directorField = findDirectorField(data[0]);
    console.log(`\nDirector field found: ${directorField}`);
    
    if (directorField) {
      const directors = [...new Set(
        data
          .map(row => row[directorField])
          .filter(director => director && director.trim() !== '')
          .map(director => director.trim())
      )].sort();
      
      console.log(`\nUnique directors (${directors.length}):`);
      directors.forEach((director, index) => {
        const count = data.filter(row => row[directorField] === director).length;
        console.log(`${index + 1}. ${director} (${count} projects)`);
      });
      
      // Save directors to file
      fs.writeFileSync('directors-from-excel.json', JSON.stringify(directors, null, 2));
      console.log('\nDirectors saved to directors-from-excel.json');
      
      // Save full data for inspection
      fs.writeFileSync('excel-data-sample.json', JSON.stringify(data.slice(0, 10), null, 2));
      console.log('Sample data saved to excel-data-sample.json');
    }
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
  }
}

function findDirectorField(sampleRow) {
  const possibleFields = [
    'project_director',
    'Project Director',
    'director',
    'Director',
    'PM',
    'Project Manager',
    'project_manager',
    'AM',
    'Account Manager',
    'account_manager'
  ];
  
  const fields = Object.keys(sampleRow);
  console.log('Available fields:', fields);
  
  // Look for exact matches first
  for (const field of possibleFields) {
    if (fields.includes(field)) {
      return field;
    }
  }
  
  // Look for partial matches
  for (const field of fields) {
    const fieldLower = field.toLowerCase();
    if (fieldLower.includes('director') || fieldLower.includes('manager') || fieldLower.includes('pm')) {
      return field;
    }
  }
  
  return null;
}

parseExcelFile();