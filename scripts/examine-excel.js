const XLSX = require('xlsx');
const fs = require('fs');

async function examineExcelFile() {
  try {
    // Read the Excel file
    const workbook = XLSX.readFile('./public/NETPAC_AI_Consolidated_efa.xlsx');
    
    console.log('Excel file structure:');
    console.log('Sheet names:', workbook.SheetNames);
    
    // Examine each sheet
    workbook.SheetNames.forEach((sheetName, index) => {
      console.log(`\n=== Sheet ${index + 1}: ${sheetName} ===`);
      
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`Rows: ${data.length}`);
      
      if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('\nFirst row:');
        console.log(data[0]);
        
        if (data.length > 1) {
          console.log('\nSecond row:');
          console.log(data[1]);
        }
      }
      
      // Save sheet data for inspection
      fs.writeFileSync(`sheet-${index + 1}-${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}.json`, 
                      JSON.stringify(data, null, 2));
    });
    
  } catch (error) {
    console.error('Error examining Excel file:', error);
  }
}

examineExcelFile();