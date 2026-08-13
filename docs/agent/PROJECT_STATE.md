# Project State

Updated: 2026-08-13

## Current status

- Read-only AI Assist chat and push-to-talk voice: **implemented on `rj/dev`, NOT committed/deployed, `AI_ASSIST_ENABLED` never set to `true`.** See `docs/agent/memory/log/2026-08-13-ai-assist-chat-voice-implementation.md` for the full task-by-task detail.
- The implementation contract uses Gemini 3.5 Flash-Lite for structured text chat and a separately configurable Gemini Live native-audio model over one allowlisted read-only PMv2 tool layer.
- Durable artifacts: `docs/superpowers/specs/2026-08-13-ai-assist-chat-voice-design.md`, `docs/superpowers/plans/2026-08-13-ai-assist-chat-voice.md`, `docs/AI_ASSIST_REFERENCE_MAP.md`, `docs/AI_ASSIST_BUILDER_PROMPT.md`, and `docs/ai-assist-golden-questions.json` (25-case rubric, authored, not yet run).
- Server: `server/aiAssist/{config,access,schemas,tools,prompt,chat,router,audit,liveToken,geminiClient}.js`, mounted in `server.js` before the SPA catch-all and mirrored into `functions/server/aiAssist/` via `scripts/sync-ai-assist.mjs` (`npm run ai-assist:check` — clean). 57/57 `node --test` passing.
- Client: `src/services/aiAssistService.ts`, `src/components/ai/*`, `src/ai/{liveClient,liveSession}.ts`, `src/ai/audio/*`, mounted globally in `AppLayout` (`src/App.tsx`), gated client-side to RJR/TJC. 112/112 Jest passing, `tsc --noEmit` clean, CI build clean.
- **Not yet done**: no Firestore Emulator integration test, no manual browser/device verification, golden-set not run against a live model, `geminiClient.js`/`liveToken.js`/`liveSession.ts` (real network/browser wiring) not runtime-verified — all are required gates before enabling the feature flag in production, per the plan's own stop conditions.
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

- AI Assist production enablement is gated by explicit acceptance of the existing forgeable base64-token authentication risk, plus the manual-verification items below — code is implemented and automated-tested, but that is not the same as production-ready.
- `gemini-2.5-flash-native-audio-preview-12-2025` (the configured Live voice default) was confirmed to still exist as of 2026-08-13, but a newer `gemini-3.1-flash-live-preview` also exists — worth a deliberate choice before enabling voice, not just inertia.
- The `@google/genai` browser Live wiring (`src/ai/liveSession.ts`) and the ephemeral-token provisioning (`server/aiAssist/liveToken.js`) were built against the installed SDK's own type definitions (verified directly, not guessed from web docs — the web docs describe a different "Interactions API") but have not been exercised against the real API/a real microphone.

## Next considerations

- Before enabling `AI_ASSIST_ENABLED=true` anywhere: run the Firestore Emulator with synthetic fixtures, execute `docs/ai-assist-golden-questions.json` against it, and do the manual browser pass (desktop, mobile, mic permission allow/deny, interruption, reconnect, logout cleanup, source navigation, unauthorized-account 403, unauthenticated 401).
- Not yet committed to git — review the diff (`server/aiAssist/`, `functions/server/aiAssist/`, `src/services/aiAssistService.ts`, `src/components/ai/`, `src/ai/`, `public/ai/`, `server.js`, `functions/server.js`, `package.json`, docs) before committing/merging.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
