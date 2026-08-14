# Task Log

## 2026-08-14 — Hands-free P2: opportunity snapshot and company search

Added `get_opportunity_snapshot` (allowlisted opportunity fields plus linked company id/code/name) and `search_clients` (company name/code only — no contacts, phones, emails, or addresses). Citation chips for clients go to `/sales/clients`. Added three golden-set cases; the set is still unrun against live/emulator data. Invoices and work-schedule tools stay unnamed.

## 2026-08-14 — Hands-free P1.1: see the page on a phone

Replaced the mobile full-screen Assist dialog with a bottom sheet (~56vh, no backdrop, swipe to close) so the record stays visible above it. Desktop Assist is now a persistent dock: the page gets 420px right padding and the drawer no longer modal-blocks the record.

## 2026-08-14 — Hands-free P0: typed lines stay on Live

While a Live session is up, Send no longer stops the mic. The typed line goes into Gemini Live as a completed turn. After Live ends, Flash-Lite chat includes a capped `priorToolResults` payload from this memory-only session so follow-ups like “how many quotations?” still see the last navigate/search. Composer stays enabled during Live. History is still not persisted.

## 2026-08-14 — Hands-free P1: page follows Assist

Implemented the parked P1 slice on `rj/dev` after merging `origin/main` (Work Schedule Gantt). Assist now lives above per-route `AppLayout`, so Live is not remounted on navigation. Citation chips and `navigate_to_record` use an allowlisted navigator. `/projects/:id` is a real route. `pageContext` carries project/opportunity/quotation ids and is sent into an open Live session as an untrusted now-viewing note. Added `list_quotations_for_opportunity`. Assist stays read-only.

### Verification

- `npm run test:ai-assist` 69/69
- Jest AI client suites 62/62
- `tsc --noEmit` clean; `ai-assist:check` clean after Functions sync
- Live browser pass of spoken navigate still needs an RJR/TJC session in the preview

## 2026-08-14 — Hands-free plan reviewed and tightened (still parked)

Reviewed the parked IOCT Assist hands-free roadmap against current Assist code. Direction stays the same (page follows Assist, P1 first, read-only, P5 later). The checklist was too thin to implement: `AiAssistProvider` remounts per route so Live would die on navigate; `pageContext` is `{ route, projectId: null }` and Live never receives it; operational citations use `/projects/:id` which is not a React route; persist-thread contradicted the memory-only design; invoices/work-schedule had no tool names; P3 writes sat before the auth gate. Rewrote `docs/agent/memory/roadmaps/ioct-assist-hands-free.md`. No product code changed.

## 2026-08-14 — Hands-free plan parked for a later session

RJ asked to ready the plan and stop. Canonical parked plan is `docs/agent/memory/roadmaps/ioct-assist-hands-free.md` (also the Bayanihan roadmap **IOCT Assist hands-free**). First implement session is P1 only: wire citation navigation, keep the drawer/Live up, parse pageContext ids, allowlisted “go to this proposal/project.” No code started. Weekly usage was about to max out.

## 2026-08-14 — External LLM/CLI should sit on the operator contract

RJ wants the option to plug a stronger external LLM or CLI into Assist later. Decision: do not open the whole PMv2 API and do not make MCP the source of truth. Freeze the existing allowlisted tool layer as a model-agnostic operator contract (catalog + execute + later navigate/propose), expose it as authenticated HTTP first, then a thin MCP adapter for Claude/Grok/Bayanihan, plus a later in-app provider swap. Auth hardening remains the gate. Added P5 to the hands-free roadmap. No product code changed.

## 2026-08-14 — Hands-free means the page follows Assist

RJ clarified hands-free: the main PMv2 page must move so the user can see what Assist is working on (“go to this proposal / project”). Citation chips already carry routes but `AiAssistDrawer` is mounted without `onNavigateSource`, so taps are a no-op. Updated the **IOCT Assist hands-free** roadmap: P1 is now follow-the-agent navigation (allowlisted React Router, docked drawer, mobile bottom sheet, Now viewing chip). No product code changed.

## 2026-08-14 — IOCT Assist hands-free scout + roadmap

Scouted current Assist vs a Kabayan-style hands-free operator. Confirmed text Flash-Lite and Gemini Live are different model sessions; the drawer can share transcripts after the voice-bubble fix, but Live tool memory does not transfer and typing still calls `stopVoice()`. Rezcoat follow-up “how many quotations” fails because there is no `list_quotations_for_opportunity` tool (`get_quotation_summary` needs a quotation id). Recorded roadmap **IOCT Assist hands-free** (P0 shared session → P1 deeper read tools → P2 navigate-with-confirm → P3 propose-then-confirm drafts → P4 always-on). No product code changed.

## 2026-08-14 — Typed follow-up after voice no longer 502s

Switching from Live to typed chat after a misspelled name failed with “The assistant could not answer that.” Flash-Lite was using JSON `responseSchema` plus function calling, which breaks on follow-ups; the first user message also dropped prior voice turns. Removed JSON-mode, pack conversation history into the first turn, accept prose answers, and match project search on compact spellings (`rezcoat` → `Rez-Coat`). Typed send now ends the live session.

## 2026-08-14 — Live badge on tucked Gemini launcher

The floating Assist FAB now shows a LIVE pill and a mic-level ring while a voice session is running, so the session is visible when the drawer is closed.

## 2026-08-14 — Dedup voice bubbles + single AudioContext

Gemini Live was repeating the finished user/assistant transcript, which created a second pair of bubbles. Replays of the last same-role line now update in place. Capture and playback share one hardware-rate AudioContext (no 24 kHz graph) so Continuity is less likely to drop.

## 2026-08-14 — Live voice is click-to-toggle (Continuity)

Press-and-hold `pointerleave` was stopping the MediaStream and dropping macOS Continuity / iPhone-as-mic. Mic is now click to start, click to stop. Unexpected `track.ended` goes to the error phase.

## 2026-08-14 — AI Assist live-mode mic meter

### Completed

- Live session shows a Live chip, phase label, and a bar meter driven by real microphone RMS.
- Typed composer is disabled while live, with a “speak or click the mic to finish” label.

## 2026-08-14 — AI Assist voice transcript in chat

### Completed

- Enabled Gemini Live `inputAudioTranscription` / `outputAudioTranscription` on the ephemeral token and `live.connect` config.
- Voice input/output text now upserts into the same memory-only chat messages as typed turns, including the standard AI disclaimer and tool source chips.

### Verification

- Token mint with the new transcription fields still succeeds.
- `tsc --noEmit` clean; Jest liveClient/provider/drawer passing.

## 2026-08-14 — AI Assist voice unblock

### Completed

- Default Live model is now `gemini-3.1-flash-live-preview` (`config.js` + local `.env`).
- Removed `lockAdditionalFields` from `liveToken.js` — Gemini 400s it whenever function-calling tools are in the constraints.
- Client sends `liveSessionId` on `/api/ai-assist/tools/:name`; token response type requires it.
- Pointer-up during `connecting` no longer cancels start (mic permission prompt).
- AudioContext is created before `getUserMedia` so it stays in the user-gesture window.

### Verification

- `npm run test:ai-assist` 57/57; `tsc --noEmit` clean; Jest aiAssistService/liveClient/drawer/provider 24/24; `ai-assist:check` clean.
- Local `POST /api/ai-assist/live-token` as allowlisted user: **200** with token + liveSessionId.
- Real microphone conversation not confirmed in the CUI preview browser.

## 2026-08-14 — AI Assist runtime verification

### Completed

- Confirmed local-only enablement (`AI_ASSIST_ENABLED=true` in gitignored `.env`) and that the text path works (RJR manual).
- Runtime-hit `POST /api/ai-assist/live-token` on the live local API: allowlisted user `502 provider_error`, unauthenticated `401`, non-allowlisted `admin` `403`.
- Isolated the 502: Gemini `authTokens.create()` returns `400 field_mask is invalid for BidiGenerateContentSetup` for default `gemini-2.5-flash-native-audio-preview-12-2025` + `lockAdditionalFields`. 3.1 Live accepts that lock list; 2.5 mints only if the field is omitted. Both successful tokens opened a Live WebSocket from Node.
- Documented follow-on voice gaps (PTT/permission race, missing `liveSessionId` on tool POST, silent worklet failures).

### Verification

- No product code changed. No production flag. Paid Gemini calls limited to token mint + two short Node connects.

## 2026-08-13 — Read-only AI Assist chat and voice design

### Completed

- Approved a read-only RJR/TJC first release with no create, edit, approve, submit, upload, or delete authority.
- Chose Gemini 3.5 Flash-Lite for structured text and a configurable Gemini Live native-audio model for push-to-talk voice over one allowlisted server tool layer.
- Designed server-derived citations, constrained ephemeral Live tokens, strict input/output schemas, excluded-data projections, bounded tool use, metadata-only audit, and a feature flag defaulting off.
- Created the design spec, detailed task-by-task implementation plan, Bayanihan source reference map, and a self-contained prompt for a fresh builder CLI session.
- Recorded the existing custom base64-token authentication as a production enablement gate.

### Verification

- Reviewed the artifacts for placeholders, model/config consistency, write-authority leakage, secret exposure, root/Functions deployment mirroring, and overlap with existing dirty worktree changes.
- No application code, dependencies, secrets, or production settings were changed.

## 2026-07-24 to 2026-07-27 — Calcsheet quotation-history pricing

### Completed

- Designed and implemented a separate Quotation History source in the Calcsheet Add Product dialog while preserving Pricelists as the managed catalog.
- Derived searchable product observations from current quotations with project, quotation, date, status, cost, and quoted-price provenance.
- Added authenticated history search and contingency-suggestion endpoints.
- Added quarterly trend calculation with annualized fallback, evidence filtering, confidence reporting, and explicit Apply behavior.
- Added quotation-level and component-level expected purchase dates.
- Stored immutable historical source snapshots on selected component rows without exposing them in customer exports.
- Hardened candidate confirmation against unrelated and blank identities.
- Added strict client/server calendar validation and stale-suggestion invalidation.

### Commits

- `91dcea6` — derive product history from quotations
- `333b6a8` — harden product history observations
- `e339916` — calculate historical price contingency
- `6a91e4d` — expose product history API
- `da6d2c0` — add frontend product-history contracts
- `978b466`, `845ea6d` — add and validate purchase timing
- `bdec117`, `0e2cb4c` — build and integrate the two-tab product picker
- `d501e28`, `3344577` — final integrity hardening

### Verification

- Server: 36/36 product-history tests passed.
- Frontend: 73/73 tests passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Live sandbox API and browser smoke passed.
- Independent final code review: READY.

## 2026-07-30 — Payroll meal allowance basis (Kim Solis package)

### Problem
Meal allowance was always per-day. TJ set Kim to 15k/mo + 1k meal intending 16k take-home with OT on basic only; system multiplied 1k × days worked.

### Done
- Added `mealAllowanceBasis: 'DAILY' | 'MONTHLY'` (default DAILY).
- Engine, Employee form, Employee list, PayslipCard, unit tests.

### Kim data (ops, after code live)
- mealAllowanceBasis=MONTHLY, mealAllowance=1000, monthlyRate=15000, SEMI_MONTHLY → 8k/cutoff.
- Recompute draft July 15 payroll run if already created.

### Checked
- `npm test -- --watchAll=false --testPathPattern=payrollEngine.test` — 19/19 pass
- `npx tsc --noEmit` — clean
