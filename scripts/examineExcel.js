const XLSX = require('xlsx');
const path = require('path');

// Path to the Excel file
const excelPath = '/Users/tjc/Downloads/NETPAC_AI_Consolidated_efa.xlsx';

try {
    // Read the Excel file
    const workbook = XLSX.readFile(excelPath);
    
    console.log('=== EXCEL FILE ANALYSIS ===\n');
    
    // List all sheet names
    console.log('Sheet Names:');
    workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`${index + 1}. ${sheetName}`);
    });
    
    console.log('\n=== SHEET DETAILS ===\n');
    
    // Analyze each sheet
    workbook.SheetNames.forEach((sheetName) => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length > 0) {
            console.log(`Rows: ${jsonData.length}`);
            console.log('Headers:', jsonData[0]);
            
            // Show first few data rows
            if (jsonData.length > 1) {
                console.log('\nFirst 3 data rows:');
                for (let i = 1; i <= Math.min(4, jsonData.length - 1); i++) {
                    console.log(`Row ${i}:`, jsonData[i]);
                }
            }
            
            // Check for department-like columns
            const headers = jsonData[0];
            if (headers) {
                const deptColumns = headers.filter(header => 
                    header && typeof header === 'string' && 
                    (header.toLowerCase().includes('dept') || 
                     header.toLowerCase().includes('department') ||
                     header.toLowerCase().includes('division') ||
                     header.toLowerCase().includes('unit'))
                );
                if (deptColumns.length > 0) {
                    console.log('Department-related columns found:', deptColumns);
                }
            }
        } else {
            console.log('Empty sheet');
        }
        
        console.log('---');
    });
    
} catch (error) {
    console.error('Error reading Excel file:', error.message);
}