# Project State

Updated: 2026-08-15

## Current status

- AI Assist: implemented on `rj/dev` through hands-free P4 (P3/P4 still uncommitted WIP after this merge). Not on `main`, not deployed. `AI_ASSIST_ENABLED` is `true` only in the local gitignored `.env`.
- `origin/main` finance money-trail + follow-ups (PRs #68/#69) are merged into local `rj/dev`.
- Expense Monitoring desktop Scan One/Multiple accept receipt PDFs. Investment, expenses, liquidations, CAs, and reimbursements expose money-trail deep links.
- **Text chat works** (RJR manual). Health: `chatModel: gemini-3.5-flash-lite`, `liveModel: gemini-3.1-flash-live-preview`.
- **Voice token mint works locally.** Voice has replied in an RJR session. History is still memory-only.
- Calcsheet quotation-history pricing is complete and committed through `3344577`.
- Add Product keeps managed **Pricelists** separate from read-only **Quotation History**.
- Historical product search, provenance display, expected-purchase-date handling, and contingency suggestions are implemented across the Express API and React UI.
- Server integrity checks reject unrelated or blank confirmed candidates and invalid/pre-quotation purchase dates.
- Customer PDF/XLSX exports do not include internal historical pricing snapshots.

## Verification

- Finance trace server and packaging suite: 68/68 passing.
- Frontend suite: 134/134 passing.
- TypeScript and production build passing for the money-trail branch.
- No production write tests or live Firestore mutations were used during verification.
- Server product-history tests: 36/36 passing.
- Frontend tests: 73/73 passing.
- TypeScript and production build passing.
- Local Firestore-emulator search, suggestion, validation, and browser smoke passed.
- Independent final review verdict: READY.

## Current blockers

- AI Assist voice still needs a complete RJR mic pass (navigate + propose/apply + stay-on). Do not enable the flag in production.
- Remaining voice gaps: capture worklet `addModule` is still fire-and-forget; no voice error transcript in the drawer.
- Production enablement is still gated by the forgeable base64-token auth risk.

## Next considerations

- Finish the RJR browser pass for P3/P4, then commit P3/P4. Golden set (30 cases) still unrun.
- P5 external LLM/MCP stays later (G2 auth hardening first).
- Finance money-trail is on `main` and now in local `rj/dev`; Assist is still not on `main`.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
