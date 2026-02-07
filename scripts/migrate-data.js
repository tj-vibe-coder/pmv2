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

async function migrateData() {
  try {
    // Read existing projects data
    const projectsData = JSON.parse(fs.readFileSync('../src/data/projectsData.json', 'utf8'));
    
    console.log(`Found ${projectsData.length} projects to migrate`);
    
    // Delete the test project first
    const deleteOptions = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/projects',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const deleteResponse = await makeRequest(deleteOptions, { ids: [1] });
    
    if (deleteResponse.ok) {
      console.log('Deleted test project');
    }
    
    // Migrate projects in batches of 50
    const batchSize = 50;
    let migrated = 0;
    
    for (let i = 0; i < projectsData.length; i += batchSize) {
      const batch = projectsData.slice(i, i + batchSize);
      
      console.log(`Migrating batch ${Math.floor(i/batchSize) + 1}: projects ${i + 1} to ${Math.min(i + batchSize, projectsData.length)}`);
      
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/projects/bulk',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const response = await makeRequest(options, { projects: batch });
      
      if (response.ok) {
        migrated += response.data.addedCount;
        console.log(`✓ Successfully migrated ${response.data.addedCount} projects (Total: ${migrated})`);
        
        if (response.data.errors && response.data.errors.length > 0) {
          console.warn('Warnings:', response.data.errors);
        }
      } else {
        console.error('Failed to migrate batch:', response.data);
        break;
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n✅ Migration completed! Migrated ${migrated} out of ${projectsData.length} projects`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateData();