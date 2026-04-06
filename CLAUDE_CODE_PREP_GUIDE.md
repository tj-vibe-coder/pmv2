# 🤖 Claude Code Preparation Guide
## pmv2 — IOCT Project Monitoring + Payroll Module

---

## 📌 BEFORE YOU START — READ THIS

Claude Code works best when it has full context upfront. The more you front-load, the less back-and-forth you'll need. This guide tells you exactly what to prepare, what to say, and how to sequence the work.

---

## 🏗️ ARCHITECTURE DECISION (Do This First)

### The Problem With Your Current Setup

Right now, `pmv2` is deployed as a **monolith on Render** — frontend React build + Express backend running together on one Render Web Service. This causes two pain points:

1. **Cold starts** — Render's free/starter tier spins down services after 15 minutes of inactivity. Every first visit after idle takes **30–60 seconds** to wake up. This is the likely cause of the slowness your colleague noticed.
2. **Every frontend change triggers a full redeploy** of the backend too — unnecessary and slow.

### The Fix: Split Deployment

```
BEFORE (current)                    AFTER (recommended)
─────────────────────               ─────────────────────────────────────
Render Web Service                  Firebase Hosting (CDN)
  └── Express server.js    →          └── React build (static)  ← instant global load
  └── React /build folder            
                                    Render Web Service
                                      └── Express server.js only
                                          (API calls only, no static files)
```

**Why this is faster:**
- React build (static HTML/JS/CSS) served from Firebase Hosting's **global CDN** — loads in milliseconds anywhere in PH
- Express on Render only wakes up when an actual API call is made — and since Firestore handles most data ops directly from the frontend now, this may rarely be needed at all
- Firebase Hosting has **no cold starts** — it's a CDN, always on

### For `pmv2` Specifically

Since you're now using **Firestore directly from the React frontend**, you may not even need the Express server for most operations. Evaluate what `server.js` actually does:

- If it's just a proxy to Firestore → **remove it entirely**, call Firestore directly from React
- If it has business logic (file uploads, email, PDF generation) → **keep it on Render**, but separate from the frontend

---

## 🛠️ CLAUDE CODE SESSION PREPARATION

### Step 1 — Clone and Audit the Repo First

Before opening Claude Code, run this yourself to understand the current state:

```bash
git clone https://github.com/tj-vibe-coder/pmv2
cd pmv2
cat package.json          # what scripts and deps exist
cat server.js             # what does the Express backend actually do?
cat .env.example          # what env vars are needed
ls src/components         # existing component structure
cat src/App.tsx           # entry point, routing, auth setup
```

Answer these before starting Claude Code:
- [ ] Does `server.js` do anything besides serve the React build?
- [ ] Is Firebase already initialized (`src/firebase.ts` or similar)?
- [ ] Is there already an auth system (Firebase Auth, or custom)?
- [ ] What is the current Render deploy — static site or web service?

---

### Step 2 — Prepare Your CLAUDE.md File

Create a `CLAUDE.md` file in the root of the repo. Claude Code reads this automatically at the start of every session — it's your persistent briefing.

```markdown
# CLAUDE.md — pmv2 IOCT Project Monitoring System

## Project Overview
React 18 + TypeScript + Material-UI v5 web app for IOCT (IO Control Technologie OPC).
Two modules: Project Monitoring (existing) + Payroll (being added).

## Tech Stack
- Frontend: React 18, TypeScript, MUI v5, Recharts
- Backend: Express (server.js) on Render — minimal, may be deprecated
- Database: Firebase Firestore (migrating from any legacy DB)
- Auth: Firebase Authentication
- Frontend Hosting: Firebase Hosting (target)
- Backend Hosting: Render Web Service (API only)

## Key People / Access
- TJC (Tyrone) — payroll access only
- RJR (Reuel) — payroll access only
- Other users — project monitoring only, no payroll

## Coding Conventions
- All components in TypeScript (.tsx), no plain .js in src/
- MUI v5 sx prop for styling (no separate CSS files)
- Named exports for components, default export only for pages
- Firestore calls go in src/utils/firebase*.ts helpers — never inline in components
- No console.log in production code — use proper error handling

## Brand
- Primary blue: #2853c0
- Dark charcoal: #2c3242
- Company: IOCT — IO Control Technologie OPC

## Current Tasks
1. Separate frontend (Firebase Hosting) from backend (Render)
2. Add Payroll module — see PAYROLL_MODULE_INSTRUCTIONS.md
3. Ensure payroll page is only visible/accessible to TJC and RJR

## Do NOT
- Do not modify existing Project Monitoring logic unless explicitly asked
- Do not add project cost allocation to payroll (future scope)
- Do not use any SQL or REST DB — Firestore only
- Do not use localStorage for auth state — use Firebase Auth
```

---

### Step 3 — Session Starters (Copy-Paste These)

Use these exact prompts to start each Claude Code session cleanly.

#### Session A — Audit & Split Deployment

```
Read CLAUDE.md first. Then read server.js and src/App.tsx completely.

I need to split this app into two separate deployments:
1. React frontend → Firebase Hosting
2. Express backend → Render (API only)

First, audit server.js and tell me: what routes does it have, and which ones can be 
removed because we're now using Firestore directly from the frontend? 
Do not make any changes yet — just analyze and report.
```

#### Session B — Firebase Hosting Setup

```
Read CLAUDE.md first.

Set up Firebase Hosting for the React frontend:
1. Add firebase.json with hosting config pointing to the build folder
2. Add .firebaserc with the project ID
3. Update package.json scripts: add "deploy:web": "npm run build && firebase deploy --only hosting"
4. Update any hardcoded API base URLs to use an environment variable REACT_APP_API_URL
5. Create .env.production with REACT_APP_API_URL pointing to the Render backend URL

Do not touch server.js or any component logic.
```

#### Session C — Payroll Module (Types + Utils)

```
Read CLAUDE.md and PAYROLL_MODULE_INSTRUCTIONS.md completely before writing any code.

Start with the foundation only — do not build UI yet:
1. Create src/types/Payroll.ts with all interfaces from the instructions
2. Create src/utils/governmentContrib.ts — SSS table (full), PhilHealth, Pag-IBIG functions
3. Create src/utils/taxTable.ts — TRAIN Law annual tax brackets + per-period converter
4. Create src/utils/payrollEngine.ts — all OT, holiday, night diff computation functions
5. Create src/data/phHolidays.ts — 2026 PH holiday list

Write unit-testable pure functions. No Firebase calls in these files — 
computation only. Add JSDoc comments on each function explaining the Labor Code basis.
```

#### Session D — Firebase Firestore Layer

```
Read CLAUDE.md and PAYROLL_MODULE_INSTRUCTIONS.md.

Assume src/types/Payroll.ts already exists.

Create the Firestore service layer:
1. src/utils/firebasePayroll.ts — all typed Firestore CRUD functions for:
   - employees collection
   - payrollRuns collection  
   - dtrEntries subcollection
   - payslips subcollection
   - phHolidays collection
2. Update firestore.rules to restrict payroll collections to authorized UIDs only
3. Create scripts/setPayrollRoles.js — Firebase Admin SDK script to set custom claims
   for TJC and RJR UIDs (leave UIDs as TODO placeholders)

Use the firebase/firestore v9+ modular SDK syntax (not compat).
```

#### Session E — Access Control

```
Read CLAUDE.md.

Implement payroll access control:
1. Create src/config/payrollAccess.ts with PAYROLL_AUTHORIZED_UIDS array (leave as TODO)
   and isPayrollAuthorized(uid) helper function
2. Create src/components/payroll/PayrollGuard.tsx — shows locked screen for unauthorized users
3. In the main app navigation, hide the Payroll nav item for non-authorized users
4. Wrap the payroll route in PayrollGuard

The nav item should be completely invisible (not just disabled) for non-payroll users.
Do not break any existing navigation.
```

#### Session F — Employee Management UI

```
Read CLAUDE.md and PAYROLL_MODULE_INSTRUCTIONS.md.

Build the Employee Management UI inside the payroll module:
1. src/components/payroll/EmployeeList.tsx — MUI DataGrid table of all employees
   with columns: Employee No, Name, Designation, Type (FIELD/OFFICE), Rate, Status
   with Add, Edit, Deactivate actions
2. src/components/payroll/EmployeeForm.tsx — MUI Dialog form for create/edit
   Fields: all Employee interface fields. Show dailyRate only for FIELD, monthlyRate only for OFFICE.
3. Wire to firebasePayroll.ts functions for all CRUD

Match existing MUI v5 theme (primary #2853c0). No new color schemes.
```

#### Session G — Payroll Run Wizard

```
Read CLAUDE.md and PAYROLL_MODULE_INSTRUCTIONS.md.

Build the Payroll Run creation wizard (4-step MUI Stepper):
Step 1: Period setup — date range picker, pay date
Step 2: DTR Entry — table of active employees, editable cells for:
  working days, regular hrs, OT hrs, night diff hrs, tardiness (minutes), 
  and a dropdown for each day's type (REGULAR/REST_DAY/SPECIAL_HOLIDAY/REGULAR_HOLIDAY)
Step 3: Preview — computed payslip summary per employee using payrollEngine.ts
  Show breakdown: basic pay, OT total, allowances, deductions, net pay
  Allow manual adjustment input per employee
Step 4: Approve & Lock — summary totals, Approve button

On Approve: save all payslips to Firestore, set run status to APPROVED, 
disable all edit controls for this run.
```

#### Session H — Payslip Card + Print

```
Read CLAUDE.md and PAYROLL_MODULE_INSTRUCTIONS.md (Reference Payslip Analysis section).

Build PayslipCard component that:
1. Matches the CMR Philippines payslip layout (two-column: earnings left, deductions right)
2. Header: Employee No, Name, Designation, Rate, Meal Allowance
3. Period info: Payroll Date, Working Days, Regular Hrs, OT Hrs
4. Earnings column: Basic Pay, Meal Allowance, OT (Regular), OT (Rest Day/SNWH), 
   OT (Regular Holiday), Night Diff, Adjustment, Subtotal
5. Deductions column: SSS, PhilHealth, Pag-IBIG, Withholding Tax, Tardiness, 
   Other Deduction, Subtotal
6. Net Pay row (prominent)
7. Signature / Date / Remarks blank rows
8. IOCT logo and branding (not CMR)
9. Print button: window.print() with CSS that hides everything except .payslip-print-area
10. The print layout must be clean A5 or A4 portrait — test this carefully

Use CSS @media print in a <style> tag or MUI GlobalStyles.
```

---

### Step 4 — Things to Tell Claude Code at the Start of Every Session

Always include these context lines at the start of any session not covered above:

```
- This is a TypeScript React project. All new files must be .tsx or .ts, no .js in src/
- Use MUI v5 sx prop for all styling
- Firebase Firestore v9 modular SDK only — no compat layer
- Primary brand color: #2853c0, dark: #2c3242
- Check CLAUDE.md before starting
```

---

### Step 5 — Things to Watch Out For

**Common Claude Code mistakes on this stack:**

| Risk | Prevention |
|---|---|
| Uses `firebase/compat` instead of modular SDK | Always specify "v9 modular SDK" |
| Puts Firestore logic inline in components | Enforce "all Firebase calls go in src/utils/" |
| Creates `.js` files in `src/` | Remind: TypeScript project, `.tsx`/`.ts` only |
| Breaks existing Project Monitoring components | Say "do not touch existing components" each session |
| Uses `localStorage` for auth | Say "use Firebase Auth state only" |
| Adds `console.log` everywhere | Mention in CLAUDE.md under Do NOT |
| Forgets print CSS | Explicit in Session H prompt |
| Hardcodes payroll UIDs | Say "leave as TODO placeholder" |

---

### Step 6 — Verification Checklist After Each Session

Run these after every Claude Code session:

```bash
npm run build          # must build with zero TypeScript errors
npm start              # spot-check the UI in browser
# In Firebase console: check Security Rules preview tool
# Check Firestore: verify collections are created with correct structure
```

---

## 🚀 DEPLOYMENT SEQUENCE (After All Sessions)

```bash
# 1. Deploy frontend to Firebase Hosting
npm run build
firebase deploy --only hosting

# 2. Deploy backend to Render (API only, no static files)
# In Render dashboard: ensure start command is "node server.js" not "serve -s build"
# Set CORS to allow your Firebase Hosting domain

# 3. Set Firebase custom claims for payroll users (one-time)
node scripts/setPayrollRoles.js

# 4. Update PAYROLL_AUTHORIZED_UIDS in src/config/payrollAccess.ts
# with actual Firebase UIDs of TJC and RJR

# 5. Verify Firestore Security Rules are deployed
firebase deploy --only firestore:rules
```

---

## 💡 QUICK TIPS FOR WORKING WITH CLAUDE CODE

- **One session = one concern.** Don't ask for "build the entire payroll module" in one go. Use the session prompts above, one at a time.
- **Always commit before a new session.** If Claude Code goes sideways, you have a clean rollback point.
- **After each session, review the diff** with `git diff` before committing. Don't blindly accept all changes.
- **If Claude Code gets confused mid-session**, type: `Stop. Read CLAUDE.md again and tell me your current understanding of the task before continuing.`
- **For the DTR entry table**, it helps to provide a screenshot of the CMR payslip or describe the format explicitly — Claude Code benefits from visual reference when building data-entry UIs.

---

*Prepared for IOCT — IO Control Technologie OPC*  
*pmv2 repository: https://github.com/tj-vibe-coder/pmv2*
