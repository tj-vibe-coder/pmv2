# ADR-0001: Project Foundation

## Status

Accepted

## Context

IOCT needed a centralized web platform for monitoring construction/engineering projects, managing expenses, handling procurement, and processing payroll — all with Philippine-specific compliance (TRAIN Law, SSS/PhilHealth/Pag-IBIG contributions, PH holidays).

The platform needed to be accessible to a small team (4-5 people) with role-based access, deployed affordably, and maintainable by a solo developer with AI tooling assistance.

## Decision

The project uses the following foundation:

- **Frontend:** React 19 + TypeScript 4.9 — widespread ecosystem, type safety for AI-assisted development
- **UI:** Material-UI v7 (MUI) with `sx` prop styling — rapid component development, consistent design system
- **Charts:** Recharts — React-native charting, sufficient for dashboard KPIs
- **Routing:** React Router v7 — SPA routing with nested route support
- **Backend:** Express 5 + Firebase Admin SDK 13 — simple API layer, direct Firestore access
- **Database:** Firebase Firestore — serverless NoSQL, free tier sufficient for IOCT's scale
- **Auth:** Custom username/password with base64 tokens — chosen for speed/simplicity over Firebase Auth's learning curve
- **Hosting:** Firebase Hosting (frontend + Cloud Functions for API) — free tier CDN, no server management
- **Styling:** MUI `sx` prop (no CSS-in-JS files, no Tailwind) — consistent with component library
- **Package manager:** npm (default CRA tooling)
- **Testing:** Jest + React Testing Library (via CRA), minimal test coverage
- **Linting/type checking:** TypeScript via `react-scripts build`, ESLint via CRA defaults

## Consequences

### Positive

- Fast development velocity — single developer + AI can iterate quickly
- Affordable hosting — Firebase free tier covers current usage
- PH-specific compliance baked in — tax tables, SSS tables, holiday lists are part of the source
- Full CRUD for all modules from a single Express server
- OneDrive integration for project file storage

### Negative / Tradeoffs

- **Custom auth is insecure** — base64 tokens are trivially decodable, passwords are base64-equivalent
- **No real auth refresh** — tokens never expire, localStorage persistence is vulnerable to XSS
- **Monolithic server.js** — 1000+ lines, no middleware abstraction, harder to test
- **Firestore costs at scale** — current query pattern fetches all documents and filters in-memory
- **No migration strategy** — schema changes are manual Firestore edits
- **Minimal error handling** — many API routes lack proper validation

## Alternatives Considered

### Option 1: Next.js + Vercel

Description: Full-stack React framework with server-side rendering and API routes.

Reason not chosen: CRA was already in place; migration cost too high for current team size. Next.js adds complexity (server vs client components) that slows AI-assisted development.

### Option 2: Firebase Auth + Firestore SDK (direct client access)

Description: Use Firebase Authentication for user management and call Firestore directly from the frontend.

Reason not chosen: Payroll module actually does use this pattern (`firebasePayroll.ts`), but the main app predates this decision. The custom auth server was already built and working before Firebase Auth was considered.

### Option 3: PostgreSQL + Prisma

Description: Relational database with an ORM for type-safe queries.

Reason not chosen: IOCT doesn't need relational complexity at current scale. Firestore's document model maps naturally to the project/expense/payroll domain. No server management needed.

## Notes

- The legacy SQLite database (`database/projects.db`) was the original data store before Firestore migration
- The Express server was originally deployed as a single Render Web Service serving both the React build and API; the split to Firebase Hosting + Cloud Functions is ongoing
- Payroll module was added after the Project Monitoring foundation and uses its own Firestore collections + access control layer
