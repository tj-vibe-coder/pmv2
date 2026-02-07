const fs = require('fs');

function extractDirectorsFromExcel() {
  try {
    // Read the All PD's sheet data
    const allProjectsData = JSON.parse(fs.readFileSync('sheet-6-All_PD_s.json', 'utf8'));
    
    console.log(`Processing ${allProjectsData.length} projects from Excel...`);
    
    // Extract unique directors
    const directors = [...new Set(
      allProjectsData
        .map(project => project['PROJECT DIRECTOR'])
        .filter(director => director && director.trim() !== '')
        .map(director => director.trim())
    )].sort();
    
    console.log(`\nFound ${directors.length} unique directors:`);
    directors.forEach((director, index) => {
      const count = allProjectsData.filter(p => p['PROJECT DIRECTOR'] === director).length;
      console.log(`${index + 1}. "${director}" (${count} projects)`);
    });
    
    // Compare with current directors in our app
    const currentDirectorsData = JSON.parse(fs.readFileSync('../src/data/directorsData.json', 'utf8'));
    const currentDirectorNames = currentDirectorsData.map(d => d.name);
    
    console.log(`\nCurrent directors in app (${currentDirectorNames.length}):`);
    currentDirectorNames.forEach((director, index) => {
      console.log(`${index + 1}. "${director}"`);
    });
    
    // Find differences
    const newDirectors = directors.filter(d => !currentDirectorNames.includes(d));
    const missingDirectors = currentDirectorNames.filter(d => !directors.includes(d));
    
    console.log(`\nDirectors in Excel but not in app (${newDirectors.length}):`);
    newDirectors.forEach(director => console.log(`- "${director}"`));
    
    console.log(`\nDirectors in app but not in Excel (${missingDirectors.length}):`);
    missingDirectors.forEach(director => console.log(`- "${director}"`));
    
    // Create updated directors data
    const updatedDirectors = directors.map((name, index) => ({
      id: index + 1,
      name: name,
      department: 'Engineering',
      avatar: '/api/placeholder/40/40',
      color: getDirectorColor(index)
    }));
    
    // Save updated directors data
    fs.writeFileSync('updated-directors.json', JSON.stringify(updatedDirectors, null, 2));
    console.log('\nUpdated directors data saved to updated-directors.json');
    
    // Create director summary data based on Excel
    const directorSummaries = directors.map(directorName => {
      const projects = allProjectsData.filter(p => p['PROJECT DIRECTOR'] === directorName);
      const totalContract = projects.reduce((sum, p) => sum + (p[' UPDATED CONTRACT AMOUNT '] || 0), 0);
      const totalBilled = projects.reduce((sum, p) => sum + (p['CONTRACT  BILLED\r\n(CB)'] || 0), 0);
      const openProjects = projects.filter(p => p['PROJECT STATUS'] === 'OPEN').length;
      
      return {
        directorName: directorName,
        projectCount: projects.length,
        totalContractAmount: totalContract,
        totalBilledAmount: totalBilled,
        openProjectCount: openProjects,
        averageProjectSize: projects.length > 0 ? totalContract / projects.length : 0
      };
    });
    
    fs.writeFileSync('updated-director-summaries.json', JSON.stringify(directorSummaries, null, 2));
    console.log('Updated director summaries saved to updated-director-summaries.json');
    
    // Show summary stats
    console.log('\n=== SUMMARY STATISTICS ===');
    directorSummaries
      .sort((a, b) => b.projectCount - a.projectCount)
      .forEach(summary => {
        console.log(`${summary.directorName}: ${summary.projectCount} projects, ₱${(summary.totalContractAmount / 1000000).toFixed(1)}M contract value`);
      });
    
  } catch (error) {
    console.error('Error extracting directors:', error);
  }
}

function getDirectorColor(index) {
  const colors = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];
  return colors[index % colors.length];
}

extractDirectorsFromExcel();