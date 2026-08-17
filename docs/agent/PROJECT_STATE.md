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
- ~~Production enablement gated by the forgeable base64-token auth risk~~ — **fixed 2026-08-17, see below.** Auth hardening is no longer a blocker for AI Assist production enablement (the golden-set run and voice mic pass still are).

## 2026-08-17 — App-wide login auth fix: unsigned base64 tokens replaced with server-side sessions (not committed)

RJ approved fixing the forgeable-token issue (see the 2026-08-17 Codex review entry below, which surfaced it as a blocker for AI Assist but noted it's app-wide, not AI-Assist-specific). Fixed on `rj/dev`:

- **`server.js`** — login previously minted `Buffer.from(\`${userId}:${username}:${Date.now()}\`).toString('base64')`: unsigned, and `getCurrentUser` never validated the embedded timestamp, so a token, once forged or leaked, worked forever. A handful of `users` docs have short/sequential legacy ids (e.g. `user_21`, `user_24`) that are cheaply guessable, so this was a real (if not yet observed) exploit path, not just theoretical.
- Replaced with `mintAuthSession(userId, username)`: a `crypto.randomBytes(32)` (256-bit) token stored as the doc id in a new `auth_sessions` Firestore collection (`{userId, username, createdAt, expiresAt}`), mirroring the existing `scanner_sessions` pattern. `getCurrentUser`'s non-`scan_` branch now looks up that doc and enforces `expiresAt` (**30-day absolute TTL** — the old scheme never expired at all).
- Added `POST /api/auth/logout` (best-effort session-doc delete) and wired `AuthContext.tsx`'s `logout()` to call it fire-and-forget before clearing local storage — this is also the first time logout has ever revoked anything server-side.
- Verified live against the dev server (talks to production Firestore, per usual local workflow): login → `/api/auth/me` 200 → logout → same token now 401 → and an old-format forged base64 token is rejected with 401, confirming old tokens are dead, not just parallel-accepted. Also incidentally confirmed end-to-end through the real client — RJ's own browser session (`RJR`/`user_14`) authenticated correctly against the new code during the test window.
- `tsc --noEmit` clean, `CI=true npm run build` clean. No `server.js` test harness exists in this repo (only `server/aiAssist/*` has `node --test` suites) — verification here was the live smoke test above, not an automated suite.
- **This is a hard cutover on deploy**: every currently-stored `netpacific_token` (RJ, TJ, Renzel, Nylle, any scanner-paired phone) becomes invalid the moment this ships, forcing a fresh login. Intended, but the team should be warned before it goes out rather than hitting four "the app broke" reports.
- **Deliberately not touched, flagged as a separate decision**: `password_hash = Buffer.from(password).toString('base64')` is reversible encoding, not hashing — anyone with Firestore read access sees plaintext-equivalent passwords. Needs its own migration strategy (rehash-on-login or forced reset) and is already tracked as "rotate the 4 default passwords" in §4. Kept separate from this change so a broken cutover has one attributable cause.

## 2026-08-17 — Codex security review + fixes on `server/aiAssist/*` (not committed)

A Codex (gpt-5.6-sol) review of the AI Assist write path (auth, propose/confirm, operator HTTP surface) found one critical (the token forgery above, already tracked) plus several high/medium findings. Fixed on `rj/dev`, all in `server/aiAssist/*` (mirrored to `functions/server/aiAssist/` via `npm run ai-assist:sync`), 114/114 `test:ai-assist` passing, `tsc --noEmit` clean:

- **`proposals.js`** — the `field_not_allowed` allowlist check used `in` instead of `hasOwnProperty`, so inherited `Object.prototype` names (`constructor`, `toString`, `__proto__`) passed the check and could reach `ref.update({[field]: value})`. Fixed to `Object.prototype.hasOwnProperty.call(PROPOSABLE_FIELDS, field)` in both call sites.
- **`access.js`** — `authorizeAiUser` checked only `username`, so a restricted `scan_`-prefixed QR-scanner session token for an allowlisted user inherited full AI Assist read/write access. Now explicitly rejects `user.scannerScope` with 403.
- **`proposals.js` `confirmOpportunityProposal`** — rewrote the read-compare-write as a single `db.runTransaction` (was a plain `ref.get()` then `ref.update()`, a TOCTOU race between two concurrent confirms or an unrelated concurrent edit). Retain-vs-discard on failure is now deliberate: 404 (record gone) discards the proposal, 409 (stale) retains it so the proposal can still expire on its own TTL or be retried against a fresh value.
- **`operator.js`** — added an explicit `OPERATOR_ALLOWED_TOOLS` allowlist (currently mirrors the full registry, since the registry has zero direct-write tools today) so a future tool added to `tools.js` isn't automatically reachable via `/operator/execute` or the MCP adapter without a deliberate opt-in edit here. A test asserts the allowlist and the live registry stay in sync (fails loud, not silent, on drift).
- **`audit.js` / `router.js`** — audit coverage previously existed only for `/chat`. Extended `buildAuditRecord` with optional `action` and a tightly-allowlisted `detail` (tool name / proposal id / record id / field — never prompt/answer/proposed-value content), and instrumented `/tools/:name` (live tool calls), `/proposals/:id/confirm`, `/proposals/:id/reject`, and `/operator/execute` — including the unknown-tool-probe path, not just the allowlist-rejection path.
- **Verified as a false positive** (Codex flagged it without seeing `schemas.js`): `/operator/execute` does call `validateToolInput` — via `validateOperatorExecuteRequest` at `schemas.js:240` — so it is not skipping argument validation.
- **Deliberately deferred** (not done): in-memory `proposalStore` / `liveSessions` / rate-limit `Map`s won't survive Cloud Run horizontal scaling or a restart — a proposal created on one instance 404s if confirmed against another. Fails closed (never a security issue, just a UX correctness bug), and it's a materially bigger refactor (`get`/`take` would need to go async, rippling through `assertOwnedProposal` and every proposal test) than the fixes above. Not worth doing before the auth-token fix, since production enablement is gated on that anyway.

## Next considerations

- P5 HTTP catalog/execute, MCP adapter, and Gemini-only `createAssistChatClient` factory are committed on `rj/dev`. Deploy.yml writes Assist env with `AI_ASSIST_ENABLED=false`. Golden set still unrun.
- RJR browser pass for P3/P4 still needed. Auth hardening is done (see 2026-08-17 entry); golden-set run + mic pass remain before flipping the production flag.
- Before deploying the auth fix: warn the team of the forced logout, and decide whether/when to also tackle password hashing (tracked separately, see 2026-08-17 entry).
- In-memory proposal/session store scaling (see 2026-08-17 Codex-review entry) — revisit later; not urgent now that auth hardening is done, still not a security issue (fails closed).
- Finance money-trail is on `main` and now in local `rj/dev`; Assist is still not on `main`.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
