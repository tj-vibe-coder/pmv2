# Project State

Updated: 2026-08-14

## Current status

- Read-only AI Assist: implemented on `rj/dev` (`398f961` + hands-free P0–P2). Not on `main`, not deployed. `AI_ASSIST_ENABLED` is `true` only in the local gitignored `.env`. See `docs/agent/memory/log/2026-08-14-ai-assist-runtime-verification.md`.
- **Hands-free P1** (`288cda4`): Assist mounts once above the router. Citation chips and `navigate_to_record` move the page. `/projects/:id` is a real route. Now viewing chip. Live gets an untrusted page-context note. `list_quotations_for_opportunity`.
- **Hands-free P0 / P1.1 / P2** (this commit): typed Send stays on Live; after Live ends, Flash-Lite gets `priorToolResults`. Phone bottom sheet + desktop dock. `get_opportunity_snapshot` and `search_clients` (company name/code only). History still memory-only.
- **Text chat works** (RJR manual). Health: `chatModel: gemini-3.5-flash-lite`, `liveModel: gemini-3.1-flash-live-preview`.
- **Voice token mint now works locally.** `POST /api/ai-assist/live-token` is `200` with a token + `liveSessionId` after (1) defaulting the Live model to `gemini-3.1-flash-live-preview` and (2) omitting `lockAdditionalFields` — Gemini 400s that field whenever tools are present. Client now sends `liveSessionId` on tool POSTs and does not cancel start on pointer-up during `connecting`.
- **Voice replied** in RJ's RJR session. Transcripts were not in the chat thread at that moment; a follow-up now streams Live input/output transcription into the same in-memory conversation (plus tool source chips). Refresh and speak again to confirm bubbles appear. Still not persisted (clears on reload/logout).
- The golden set is now 28 cases and is still unrun against live or emulator data.
- Calcsheet quotation-history pricing is complete and committed through `3344577`.
- Add Product keeps managed **Pricelists** separate from read-only **Quotation History**.
- Historical product search, provenance display, expected-purchase-date handling, and contingency suggestions are implemented across the Express API and React UI.
- Server integrity checks reject unrelated or blank confirmed candidates and invalid/pre-quotation purchase dates.
- Customer PDF/XLSX exports do not include internal historical pricing snapshots.

## Verification

- Server product-history tests: 36/36 passing.
- Frontend tests: 73/73 passing.
- TypeScript and production build passing.
- Local Firestore-emulator search, suggestion, validation, and browser smoke passed.
- Independent final review verdict: READY.

## Current blockers

- AI Assist voice needs a real-mic confirmation after the live-token 200 fix. Do not enable the flag in production until that pass (permission, listen/speak, a tool-backed question, interruption) succeeds.
- Remaining voice gaps: capture worklet `addModule` is still fire-and-forget; no voice error transcript in the drawer.
- Production enablement is still gated by the forgeable base64-token auth risk. Text works locally for RJR/TJC only.

## Next considerations

- Hands-free P3 writes, P4 always-on, and P5 external LLM/MCP stay later. Current Assist stays read-only. Golden set still unrun.
- Confirm a real RJR/TJC mic session: click mic, allow permission, say “go to the Rezcoat proposal”, confirm the page moves and Live stays up.
- Before enabling `AI_ASSIST_ENABLED=true` anywhere but local `.env`: run the golden set, and do the manual browser pass (desktop, mobile, mic permission allow/deny, interruption, reconnect, logout cleanup, source navigation). 401/403 and live-token 200 already verified.
- `origin/main` Work Schedule Gantt is now merged into local `rj/dev`. AI Assist commits are still not on `main` and not pushed.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
