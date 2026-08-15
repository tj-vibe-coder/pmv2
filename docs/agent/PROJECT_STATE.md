# Project State

Updated: 2026-08-15

## Current status

- AI Assist: implemented on `rj/dev` through P5 (HTTP operator, MCP adapter, Gemini-only provider factory). Not on `main`, not deployed. `AI_ASSIST_ENABLED` is `true` only in the local gitignored `.env`.
- **Hands-free P3**: `propose_opportunity_update` drafts status (`draft`/`for_review`/`sent`/`inactive` only), `opportunityGrade`, or `notes`. The model never writes. Apply is `POST /api/ai-assist/proposals/:id/confirm` (button or spoken “apply that change”). `won`/`lost` stay blocked. Proposals are in-memory, 10-minute TTL, user-bound.
- **Hands-free P4**: after the mic is clicked, Live stays listening, one bounded reconnect keeps the MediaStream, 10-minute cap, Always-on chip, spoken “stop listening”.
- **Hands-free P0–P2** remain: page follows Assist, typed Send stays on Live, phone sheet + desktop dock, read tools including `get_opportunity_snapshot` and `search_clients`. History still memory-only.
- **Text chat works** (RJR manual). Health: `chatModel: gemini-3.5-flash-lite`, `liveModel: gemini-3.1-flash-live-preview`.
- **Voice token mint works locally.** Voice has replied in an RJR session. History is still memory-only.
- `origin/main` finance money-trail + follow-ups (PRs #68/#69) are merged into local `rj/dev` (`2a73e60`).
- Expense Monitoring desktop Scan One/Multiple accept receipt PDFs. Investment, expenses, liquidations, CAs, and reimbursements expose money-trail deep links.
- Calcsheet quotation-history pricing is complete and committed through `3344577`.
- Add Product keeps managed **Pricelists** separate from read-only **Quotation History**.
- Historical product search, provenance display, expected-purchase-date handling, and contingency suggestions are implemented across the Express API and React UI.
- Server integrity checks reject unrelated or blank confirmed candidates and invalid/pre-quotation purchase dates.
- Customer PDF/XLSX exports do not include internal historical pricing snapshots.

## Verification

- Finance trace server and packaging suite: 68/68 passing (on `main` before merge).
- Server product-history tests: 36/36 passing.
- TypeScript and production build passing on the money-trail branch before merge.
- Assist P3/P4 unit suites passed before the merge; re-run after this merge.
- No production write tests or live Firestore mutations were used during verification.

## Current blockers

- AI Assist voice still needs a complete RJR mic pass (navigate + propose/apply + stay-on). Do not enable the flag in production.
- Remaining voice gaps: capture worklet `addModule` is still fire-and-forget; no voice error transcript in the drawer.
- Production enablement is still gated by the forgeable base64-token auth risk.

## Next considerations

- P5 HTTP catalog/execute, MCP adapter, and Gemini-only `createAssistChatClient` factory are committed on `rj/dev`. Deploy.yml writes Assist env with `AI_ASSIST_ENABLED=false`. Golden set still unrun.
- RJR browser pass for P3/P4 still needed. Auth hardening remains the production gate.
- Finance money-trail is on `main` and now in local `rj/dev`; Assist is still not on `main`.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
