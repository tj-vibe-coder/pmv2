# Firebase Cloud Functions Migration Plan

## Context
The app currently runs as a single Render Web Service: `node server.js` serves both the Express API and the React static build. Render's free tier freezes idle instances, causing 30–90 second cold starts that frustrate users.

**Goal**: Move the Express backend to Firebase Cloud Functions (Blaze plan, free tier), keeping Firebase Hosting for the React frontend. This eliminates frozen cold starts (CF cold starts: ~1–3s), and the usage profile of this small internal tool easily stays within Firebase's free monthly limits ($0 bill).

Firebase Hosting is already configured (`pmv2-851ae.web.app`). The DB is already Firestore. Only the Express API layer needs to move.

---

## Target Architecture

```
Firebase Hosting  →  serves React build/
      ↓ /api/** hosting rewrite
Firebase Cloud Function "api"  →  Express app (server.js)
      ↓
Firebase Firestore  (unchanged)
```

---

## Files to Modify

### 1. `server.js` — 4 surgical changes, no route logic touched

**Change A — Line 14: Remove Render from CORS allowlist**
```js
// Remove this line:
  'https://ioct.onrender.com',
```

**Change B — Lines 27–29: Conditional Firebase Admin init**
```js
// BEFORE:
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// AFTER:
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp(); // Cloud Functions: uses implicit ADC credentials
  }
}
```
- `!admin.apps.length` prevents double-init on warm starts
- Local dev still uses `FIREBASE_SERVICE_ACCOUNT` from `.env` (unchanged)
- Cloud Functions uses Application Default Credentials automatically

**Change C — Lines 34–35: Guard startup calls with `require.main === module`**
```js
// BEFORE:
createDefaultUsers();
startServer();

// AFTER:
if (require.main === module) {
  createDefaultUsers();
  startServer();
}
```
- When `functions/index.js` does `require('../server')`, this block is skipped
- When you run `node server.js` locally, it still executes normally

**Change D — Lines 1283–1289: Guard static file serving with `K_SERVICE` env var**
```js
// BEFORE:
app.use(express.static(path.join(__dirname, 'build')));
app.get(['/', '/*splat'], (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// AFTER:
// Cloud Functions v2 sets K_SERVICE automatically; Firebase Hosting handles static files.
if (!process.env.K_SERVICE) {
  app.use(express.static(path.join(__dirname, 'build')));
  app.get(['/', '/*splat'], (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}
```

**Add at very bottom of `server.js` (after `startServer` function):**
```js
// Export app for Cloud Functions (no-op when run directly via node server.js)
module.exports = app;
```

---

### 2. `firebase.json` — Add functions + update rewrites

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" install"]
    }
  ],
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api",
        "region": "us-central1"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```
- `/api/**` rewrite MUST come before `**` → `index.html` (order-sensitive)
- `predeploy` auto-runs `npm install` inside `functions/` on every `firebase deploy`

---

### 3. `.env.production` — Clear the Render URL

```
# API URL is empty: Firebase Hosting rewrites /api/** to Cloud Functions.
REACT_APP_API_URL=
```
`src/config/api.ts` already returns `''` when this is unset during `react-scripts build`, so all fetch calls use relative paths like `/api/projects`. Hosting rewrites route those to the function.

---

### 4. `package.json` — Add deploy scripts

Add to `"scripts"`:
```json
"deploy:functions": "firebase deploy --only functions",
"deploy:all": "npm run build && firebase deploy",
"functions:install": "npm install --prefix functions"
```

---

### 5. `.gitignore` — Add functions exclusion

Append to existing `.gitignore`:
```
# Functions subdirectory
/functions/node_modules
/functions/.env
```

---

## Files to Create

### 6. `functions/package.json` (new)

```json
{
  "name": "pmv2-functions",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": "22" },
  "main": "index.js",
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^17.3.1",
    "express": "^5.1.0",
    "firebase-admin": "^13.7.0",
    "firebase-functions": "^6.0.0"
  }
}
```
- Versions match root `package.json` exactly
- Only backend deps — no React, MUI, SQLite, or testing packages

### 7. `functions/index.js` (new)

```js
'use strict';

const { onRequest } = require('firebase-functions/v2/https');

// Import the Express app.
// server.js is patched so that:
//   - admin.initializeApp() uses implicit ADC (no service account needed)
//   - app.listen() is NOT called (guarded by require.main === module)
//   - Static file serving is NOT registered (guarded by K_SERVICE env var)
const app = require('../server.js');

exports.api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  app
);
```

### 8. `functions/.gitignore` (new)

```
node_modules/
.env
```

---

## Environment Variables Summary

| Variable | Local Dev | Cloud Functions |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Required in `.env` (unchanged) | **Not needed** — implicit ADC |
| `PORT` | Defaults to 3001 | Not used (CF manages ports) |
| `REACT_APP_API_URL` | `http://localhost:3001` | Empty (Hosting rewrites handle it) |
| `K_SERVICE` | Not set | Auto-set by CF runtime |

---

## Local Development — Unchanged

`node server.js` continues to work exactly as before:
- `FIREBASE_SERVICE_ACCOUNT` in `.env` → `admin.initializeApp({ credential })` path runs
- `require.main === module` → `createDefaultUsers()` and `startServer()` run → `app.listen(:3001)`
- `K_SERVICE` not set → static file serving and SPA fallback registered

```bash
npm run start   # concurrently: node server.js + react-scripts start (unchanged)
```

---

## Deployment Steps (One-time Setup)

```bash
# 1. Install Firebase CLI (if not already)
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Install functions dependencies
npm run functions:install

# 4. Build + deploy everything
npm run deploy:all
```

### Subsequent deploys

```bash
npm run deploy:functions   # backend only (no React rebuild)
npm run deploy:web         # frontend only
npm run deploy:all         # both
```

---

## Verification Checklist

After `npm run deploy:all`:

1. `https://pmv2-851ae.web.app/` — React app loads ✓
2. `https://pmv2-851ae.web.app/api/health` — returns `{"status":"OK","database":"Firebase Firestore",...}` ✓
3. `https://pmv2-851ae.web.app/api/projects` — returns project list (with auth token) ✓
4. Any SPA route (e.g., `/projects/123`) — returns the React `index.html` ✓
5. Firebase Console → Functions → check the `api` function shows invocations ✓
6. Cold start test: let function idle, then make an API call — should respond in < 5s ✓

---

## Notes

- **Payroll timeout**: If heavy payroll batch ops time out, increase `timeoutSeconds` to `540` in `functions/index.js`
- **$0 bill**: 2M free invocations/month; internal tools typically use thousands — well within the free tier
- **`createDefaultUsers()`**: Not called on CF cold start (by design). Default users already exist in Firestore from prior runs. If needed, run `node server.js` locally once to seed them.
