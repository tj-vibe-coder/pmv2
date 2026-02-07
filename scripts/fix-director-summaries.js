const fs = require('fs');

function fixDirectorSummaries() {
  try {
    console.log('Fixing director summaries to include totalOutstandingBalance...');
    
    // Read current director summaries
    const summariesData = JSON.parse(fs.readFileSync('../src/data/directorSummariesData.json', 'utf8'));
    
    // Add missing totalOutstandingBalance field
    const fixedSummaries = summariesData.map(summary => ({
      directorName: summary.directorName,
      projectCount: summary.projectCount,
      totalContractAmount: summary.totalContractAmount,
      totalBilledAmount: summary.totalBilledAmount,
      totalOutstandingBalance: summary.totalContractAmount - summary.totalBilledAmount // Calculate outstanding balance
    }));
    
    // Save fixed summaries
    fs.writeFileSync('../src/data/directorSummariesData.json', JSON.stringify(fixedSummaries, null, 2));
    
    console.log('✓ Fixed director summaries with totalOutstandingBalance');
    
    // Show updated summaries
    console.log('\nUpdated director summaries:');
    fixedSummaries.forEach(summary => {
      console.log(`${summary.directorName}: ${summary.projectCount} projects, ₱${(summary.totalOutstandingBalance / 1000000).toFixed(1)}M outstanding`);
    });
    
  } catch (error) {
    console.error('Error fixing director summaries:', error);
  }
}

fixDirectorSummaries();