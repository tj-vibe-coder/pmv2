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

async function normalizeDirectors() {
  try {
    console.log('Normalizing director names to match Excel data...');
    
    // Mapping from current app names to Excel names
    const directorMapping = {
      'Anchy Vero': 'ANCHY VERO',
      'Paul Pascual': 'Paul Pascual', // Keep mixed case (most projects)
      'George Urzal': 'George Urzal', // Keep mixed case (most projects)
      'Edbert Baligaya': 'Edbert Baligaya',
      'Fred Ramos': 'Fred Ramos',
      'Mario Montenegro': 'Mario Montenegro',
      'Gerald San Diego': 'Gerald San Diego'
    };
    
    // Get all projects from database
    const getOptions = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/projects',
      method: 'GET'
    };
    
    const response = await makeRequest(getOptions);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }
    
    const projects = response.data;
    console.log(`Found ${projects.length} projects in database`);
    
    // Count projects that need updating
    let updateCount = 0;
    const updateBatches = [];
    
    projects.forEach(project => {
      if (project.project_director && directorMapping[project.project_director]) {
        const newDirector = directorMapping[project.project_director];
        if (project.project_director !== newDirector) {
          updateBatches.push({
            id: project.id,
            project_director: newDirector
          });
          updateCount++;
        }
      }
    });
    
    console.log(`${updateCount} projects need director name updates`);
    
    if (updateCount === 0) {
      console.log('No updates needed!');
      return;
    }
    
    // Update projects in batches
    const batchSize = 50;
    let updated = 0;
    
    for (let i = 0; i < updateBatches.length; i += batchSize) {
      const batch = updateBatches.slice(i, i + batchSize);
      
      console.log(`Updating batch ${Math.floor(i/batchSize) + 1}: ${i + 1} to ${Math.min(i + batchSize, updateBatches.length)}`);
      
      // Update each project in the batch
      for (const update of batch) {
        const putOptions = {
          hostname: 'localhost',
          port: 3001,
          path: `/api/projects/${update.id}`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          }
        };
        
        const updateResponse = await makeRequest(putOptions, {
          project_director: update.project_director
        });
        
        if (updateResponse.ok) {
          updated++;
        } else {
          console.error(`Failed to update project ${update.id}`);
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`\\n✅ Successfully updated ${updated} projects`);
    
    // Update the frontend data files
    console.log('\\nUpdating frontend data files...');
    
    // Update directors data
    const normalizedDirectors = Object.values(directorMapping).map((name, index) => ({
      id: index + 1,
      name: name,
      department: 'Engineering',
      avatar: '/api/placeholder/40/40',
      color: getDirectorColor(index)
    }));
    
    fs.writeFileSync('../src/data/directorsData.json', JSON.stringify(normalizedDirectors, null, 2));
    console.log('Updated directorsData.json');
    
    // Update filter options
    const filterOptions = JSON.parse(fs.readFileSync('../src/data/filterOptionsData.json', 'utf8'));
    filterOptions.directors = Object.values(directorMapping).sort();
    fs.writeFileSync('../src/data/filterOptionsData.json', JSON.stringify(filterOptions, null, 2));
    console.log('Updated filterOptionsData.json');
    
    // Generate new director summaries from updated database
    await generateDirectorSummaries();
    
    console.log('\\n🎉 Director name normalization complete!');
    
  } catch (error) {
    console.error('Error normalizing directors:', error);
  }
}

async function generateDirectorSummaries() {
  const getOptions = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/projects',
    method: 'GET'
  };
  
  const response = await makeRequest(getOptions);
  const projects = response.data;
  
  const directorSummaries = {};
  
  projects.forEach(project => {
    const director = project.project_director;
    if (director) {
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
      summary.totalContractAmount += project.updated_contract_amount || 0;
      summary.totalBilledAmount += project.contract_billed || 0;
      if (project.project_status === 'OPEN') {
        summary.openProjectCount++;
      }
    }
  });
  
  // Calculate averages
  Object.values(directorSummaries).forEach(summary => {
    summary.averageProjectSize = summary.projectCount > 0 ? summary.totalContractAmount / summary.projectCount : 0;
  });
  
  const summariesArray = Object.values(directorSummaries);
  fs.writeFileSync('../src/data/directorSummariesData.json', JSON.stringify(summariesArray, null, 2));
  console.log('Updated directorSummariesData.json with current database data');
}

function getDirectorColor(index) {
  const colors = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];
  return colors[index % colors.length];
}

normalizeDirectors();