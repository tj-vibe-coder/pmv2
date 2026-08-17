# Known Issues

## AI Assist project citations now use `/projects/:id`

Hands-free P1 added a real `/projects/:id` route that loads `ProjectMonitoringApp`. Opportunity and quotation citation routes were already real. Collections/progress still use the `sessionStorage.selectedProjectId` bridge onto `/dashboard` as a fallback.

## Assist operator HTTP uses the same forgeable token as chat

`GET /api/ai-assist/operator/catalog` and `POST /api/ai-assist/operator/execute` reuse `authorizeAiUser`. The stdio MCP adapter (`npm run ai-assist:mcp`) only forwards those two routes with `IOCT_ASSIST_TOKEN`. They do not open the rest of the PMv2 API, but they inherit the custom base64-token risk. Leave the flag local-only until auth is hardened.

## AI Assist proposals are process-local

Drafts from `propose_opportunity_update` live in the Express process (`createProposalStore`, 10-minute TTL). A Cloud Functions instance recycle or a second instance will 404 a confirm. Fine for local RJR/TJC; not a multi-instance store.

## Assist cannot set opportunity status to won or lost

Those transitions run OneDrive promotion and main-project sync in `quotationStore.updateProject`. Assist confirm writes one Firestore field only, so won/lost stay blocked at propose time.

## AI Assist text chat and Live voice are still two Gemini sessions after Live ends

While Live is on, typed lines go into the Live session (`sendClientContent`, turn complete) and do not call `stopVoice()`. After the mic is stopped, typed `POST /api/ai-assist/chat` is still a new Flash-Lite chat. It now packs conversation text plus a capped `priorToolResults` list from this in-memory session. History is still not persisted across reload or logout.

## Continuity / iPhone-as-mic drops if the Live session stops the MediaStream

macOS Continuity Microphone tears down when `MediaStreamTrack.stop()` runs, and also when a second `AudioContext` is opened at 24 kHz (Gemini Live PCM rate) while the iPhone is the system input. RJR CUI keeps a single native-rate graph and does not drop. PMv2 now uses one shared hardware-rate context and resamples playback. Continuity can still blip two or three times on first connect.

## AI Assist voice: live-token mint is fixed locally; real-mic session not yet confirmed

`lockAdditionalFields` on `authTokens.create()` 400s whenever the payload also includes function-calling tools (`field_mask is invalid for BidiGenerateContentSetup`), on both 2.5 and 3.1. The field is now omitted; set `liveConnectConstraints` still lock those values. Default Live model is `gemini-3.1-flash-live-preview`. Local `POST /api/ai-assist/live-token` now returns `200` with a token + `liveSessionId`. A real microphone conversation (browser permission + Gemini Live audio) has not been confirmed in this session. Worklet `addModule` is still fire-and-forget.

## Local sandbox seed selects an incompatible backup

`npm run sandbox:seed` selects the lexicographically newest backup directory. As of 2026-07-27 that is `backups/2026-07-15T05-33-12`, a recursive export that the flat-JSON seed script skips, resulting in zero loaded documents.

For a representative local Calcsheet smoke test, use:

```bash
npm run emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/sandbox-seed.js backups/2026-07-15T05-32-40
npm run start:sandbox
```

The seed script correctly refuses to run when `FIRESTORE_EMULATOR_HOST` is absent, protecting production data.

## Build warnings

- The current CRA main bundle is approximately 2.07 MB before further code-splitting work.
- Browserslist data is stale and emits an update warning.
- Node 24 emits an `fs.F_OK` deprecation warning; deployment targets Node 22.

## Finance trace read cost

The Finance Money Trail read endpoint currently derives the relationship graph by reading the six participating finance collections, then applies per-user visibility filtering before traversal and candidate scoring. This avoids a second persistent relationship graph and is correct for the current dataset, but collection growth may make each drawer open expensive. If usage or record counts increase materially, replace the broad reads with indexed reference lookups plus bounded candidate queries while preserving the same visibility checks and response contract.

## ScanBatch review has nested interactive buttons

The ScanBatch review accordion currently renders its delete `IconButton` inside MUI's button-based `AccordionSummary`. React reports an invalid nested-button warning in component tests. Existing save/delete behavior and the PDF scan tests pass, but the delete action should eventually be moved outside the summary button or restructured with valid keyboard-accessible markup.
