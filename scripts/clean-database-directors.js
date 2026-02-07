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

async function cleanDatabaseDirectors() {
  try {
    console.log('Cleaning director names in database...');
    
    // Director name mappings to clean up variations
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
    
    // Find projects that need director name updates
    const projectsToUpdate = [];
    projects.forEach(project => {
      const currentDirector = project.project_director;
      const normalizedDirector = directorMapping[currentDirector];
      
      if (normalizedDirector && currentDirector !== normalizedDirector) {
        projectsToUpdate.push({
          id: project.id,
          currentDirector: currentDirector,
          newDirector: normalizedDirector
        });
      }
    });
    
    console.log(`${projectsToUpdate.length} projects need director name updates`);
    
    if (projectsToUpdate.length === 0) {
      console.log('No updates needed!');
      return;
    }
    
    // Show what will be updated
    const updateStats = {};
    projectsToUpdate.forEach(update => {
      const key = `${update.currentDirector} -> ${update.newDirector}`;
      updateStats[key] = (updateStats[key] || 0) + 1;
    });
    
    console.log('\\nUpdates to be made:');
    Object.entries(updateStats).forEach(([change, count]) => {
      console.log(`  ${change}: ${count} projects`);
    });
    
    // Update projects in batches
    const batchSize = 20;
    let updated = 0;
    
    for (let i = 0; i < projectsToUpdate.length; i += batchSize) {
      const batch = projectsToUpdate.slice(i, i + batchSize);
      
      console.log(`\\nUpdating batch ${Math.floor(i/batchSize) + 1}: projects ${i + 1} to ${Math.min(i + batchSize, projectsToUpdate.length)}`);
      
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
          project_director: update.newDirector
        });
        
        if (updateResponse.ok) {
          updated++;
          process.stdout.write('.');
        } else {
          console.error(`\\nFailed to update project ${update.id}`);
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\\n\\n✅ Successfully updated ${updated} projects`);
    
    // Verify updates
    console.log('\\nVerifying updates...');
    const verifyResponse = await makeRequest(getOptions);
    const updatedProjects = verifyResponse.data;
    
    const directorCounts = {};
    updatedProjects.forEach(project => {
      const director = project.project_director;
      if (director) {
        directorCounts[director] = (directorCounts[director] || 0) + 1;
      }
    });
    
    console.log('\\nFinal director counts:');
    Object.entries(directorCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([director, count]) => {
        console.log(`  ${director}: ${count} projects`);
      });
    
    console.log('\\n🎉 Database director names cleaned successfully!');
    
  } catch (error) {
    console.error('Error cleaning director names:', error);
  }
}

cleanDatabaseDirectors();