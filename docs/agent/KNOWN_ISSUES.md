# Known Issues

## AI Assist project citations now use `/projects/:id`

Hands-free P1 added a real `/projects/:id` route that loads `ProjectMonitoringApp`. Opportunity and quotation citation routes were already real. Collections/progress still use the `sessionStorage.selectedProjectId` bridge onto `/dashboard` as a fallback.

## AI Assist text chat and Live voice are different Gemini sessions

The drawer can show both channels as bubbles (Live transcription upserts into the same in-memory `messages[]`). Typed `POST /api/ai-assist/chat` still creates a **new** Flash-Lite chat every request and packs history as a “Prior conversation” string. Live tool results do not transfer. `send()` calls `stopVoice()`. The model may answer “this is a new conversation session” even when Rezcoat turns are on screen. There is also no `list_quotations_for_opportunity` tool, so “how many quotations are inside this opportunity” cannot be grounded.

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

- The current CRA main bundle is approximately 2.05 MB before further code-splitting work.
- Browserslist data is stale and emits an update warning.
- Node 24 emits an `fs.F_OK` deprecation warning; deployment targets Node 22.
