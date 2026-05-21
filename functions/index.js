'use strict';

const { onRequest } = require('firebase-functions/v2/https');

// Import the Express app.
// server.js is patched so that:
//   - admin.initializeApp() uses implicit ADC (no service account needed)
//   - app.listen() is NOT called (guarded by require.main === module)
//   - Static file serving is NOT registered (guarded by K_SERVICE env var)
const app = require('./server.js');

exports.api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
    invoker: 'public',
  },
  app
);
