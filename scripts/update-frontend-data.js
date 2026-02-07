const fs = require('fs');

function updateFrontendData() {
  try {
    console.log('Updating frontend data files to match Excel structure...');
    
    // Create normalized directors list (clean up spaces and consolidate)
    const directorMapping = {
      'ANCHY VERO': 'Anchy Vero',
      'ANCHY VERO ': 'Anchy Vero', // Extra space
      'Paul Pascual': 'Paul Pascual',
      'PAUL PASCUAL': 'Paul Pascual',
      'PAUL PASCUAL ': 'Paul Pascual', // Extra space
      'Mario Montenegro': 'Mario Montenegro',
      'Fred Ramos': 'Fred Ramos',
      'George Urzal': 'George Urzal',
      'GEORGE URZAL': 'George Urzal',
      'GEORGE URZAL ': 'George Urzal', // Extra space
      'Edbert Baligaya': 'Edbert Baligaya',
      'Gerald San Diego': 'Gerald San Diego'
    };
    
    const normalizedDirectors = [
      ...new Set(Object.values(directorMapping))
    ].sort();
    
    console.log('Normalized directors:', normalizedDirectors);
    
    // Update directors data
    const directorsData = normalizedDirectors.map((name, index) => ({
      id: index + 1,
      name: name,
      department: 'Engineering',
      avatar: '/api/placeholder/40/40',
      color: getDirectorColor(index)
    }));
    
    fs.writeFileSync('../src/data/directorsData.json', JSON.stringify(directorsData, null, 2));
    console.log('✓ Updated directorsData.json');
    
    // Update filter options
    const filterOptions = JSON.parse(fs.readFileSync('../src/data/filterOptionsData.json', 'utf8'));
    filterOptions.directors = normalizedDirectors;
    fs.writeFileSync('../src/data/filterOptionsData.json', JSON.stringify(filterOptions, null, 2));
    console.log('✓ Updated filterOptionsData.json');
    
    // Create director summaries based on Excel data
    const excelData = JSON.parse(fs.readFileSync('sheet-6-All_PD_s.json', 'utf8'));
    const directorSummaries = {};
    
    excelData.forEach(project => {
      let director = project['PROJECT DIRECTOR'];
      if (director) {
        // Normalize director name
        director = directorMapping[director] || director;
        
        if (!directorSummaries[director]) {
          directorSummaries[director] = {
            directorName: director,
            projectCount: 0,
            totalContractAmount: 0,
            totalBilledAmount: 0,
            openProjectCount: 0,
            averageProjectSize: 0
          };
        }
        
        const summary = directorSummaries[director];
        summary.projectCount++;
        summary.totalContractAmount += project[' UPDATED CONTRACT AMOUNT '] || 0;
        summary.totalBilledAmount += project['CONTRACT  BILLED\r\n(CB)'] || 0;
        if (project['PROJECT STATUS'] === 'OPEN') {
          summary.openProjectCount++;
        }
      }
    });
    
    // Calculate averages
    Object.values(directorSummaries).forEach(summary => {
      summary.averageProjectSize = summary.projectCount > 0 ? summary.totalContractAmount / summary.projectCount : 0;
    });
    
    const summariesArray = Object.values(directorSummaries)
      .filter(s => s.projectCount > 0) // Only include directors with projects
      .sort((a, b) => b.projectCount - a.projectCount);
    
    fs.writeFileSync('../src/data/directorSummariesData.json', JSON.stringify(summariesArray, null, 2));
    console.log('✓ Updated directorSummariesData.json');
    
    // Show final statistics
    console.log('\\n=== FINAL DIRECTOR STATISTICS ===');
    summariesArray.forEach(summary => {
      console.log(`${summary.directorName}: ${summary.projectCount} projects, ₱${(summary.totalContractAmount / 1000000).toFixed(1)}M contract value`);
    });
    
    // Create year summaries from Excel data
    const yearSummaries = {};
    excelData.forEach(project => {
      const year = project[' YEAR'];
      if (year) {
        if (!yearSummaries[year]) {
          yearSummaries[year] = {
            year: year,
            projectCount: 0,
            totalContractAmount: 0,
            totalBilledAmount: 0
          };
        }
        
        yearSummaries[year].projectCount++;
        yearSummaries[year].totalContractAmount += project[' UPDATED CONTRACT AMOUNT '] || 0;
        yearSummaries[year].totalBilledAmount += project['CONTRACT  BILLED\r\n(CB)'] || 0;
      }
    });
    
    const yearSummariesArray = Object.values(yearSummaries).sort((a, b) => a.year - b.year);
    fs.writeFileSync('../src/data/yearSummariesData.json', JSON.stringify(yearSummariesArray, null, 2));
    console.log('✓ Updated yearSummariesData.json');
    
    console.log('\\n🎉 All frontend data files updated successfully!');
    
  } catch (error) {
    console.error('Error updating frontend data:', error);
  }
}

function getDirectorColor(index) {
  const colors = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];
  return colors[index % colors.length];
}

updateFrontendData();