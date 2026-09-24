# AI Assist Reference Map

This map tells an implementation agent what to reuse, what to adapt, and what not to copy from Bayanihan into IOCT PMv2.

## IOCT PMv2 foundations

| Concern | Current source | How to use it |
|---|---|---|
| App shell | `src/App.tsx`, `AppLayout` | Mount one global assistant launcher/drawer here so every authenticated route can use it. |
| Authenticated identity | `src/contexts/AuthContext.tsx` | Use current user for UI gating only; the server must independently call `getCurrentUser(req)`. |
| Server auth | `server.js`, `getCurrentUser(req)` | Reuse for `401`; add a separate AI allowlist check for `403`. |
| API base and token header | `src/config/api.ts`, `src/services/receiptParseService.ts` | Follow the same-origin/LAN-safe API base and bearer-header convention. |
| Existing Gemini boundary | `server.js`, `parseReceiptWithGemini`; `functions/server.js` twin | Keep provider credentials server-side. Migrate new AI work to `@google/genai`; do not expose keys in React. |
| Project data | `server.js` project routes; `src/types/Project.ts` | Reuse definitions/calculations, then return a strict allowlisted projection. |
| Sales/quotation data | `server/calcsheet*`, Calcsheet routes, `src/types/Quotation.ts` | Reuse canonical totals and status semantics; exclude internal provenance unless explicitly allowed. |
| Expense data | finance services/routes and `docs/DATA_MODEL.md` | Return aggregates only in v1; exclude receipt images and attachment content. |
| Deployment | `functions/index.js`, `functions/server.js` | Firebase imports the Functions-local Express app. Canonical AI modules need a checked mirror. |
| Test patterns | `src/services/productHistoryService.test.ts`, `server/calcsheet*.test.js` | Follow Jest for React/client and `node:test` for pure server modules. Use fake Gemini clients. |
| Known security risk | `docs/agent/memory/issues/custom-auth-base64-tokens.md` | Feature defaults off and is limited to RJR/TJC pending auth hardening. |

## Bayanihan concepts worth adapting

Paths below are in `/Users/reuelrivera/Vibecode Projects/RJR CLI User Interface (CUI)`.

| Concept | Reference | Adaptation for IOCT |
|---|---|---|
| Live WebSocket lifecycle | `src/main/live-session-manager.ts` | Recreate in browser-compatible modules. Preserve setup/status/error handling, bounded lifecycle, and interruption semantics. Do not copy Electron dependencies. |
| Microphone singleton and race guard | `src/renderer/src/store/live.ts` (`sessionRef`, `operationId`, `startPromise`) | Use one assistant audio owner. A stale async start must self-cancel after every `await`. |
| PCM input conversion | `src/renderer/src/store/live.ts` (`floatTo16BitPCMBase64`, `downsampleTo16k`) | Extract tested, browser-safe audio utilities; prefer `AudioWorklet` over deprecated `ScriptProcessorNode`. |
| PCM output scheduling | `src/renderer/src/store/live.ts` (`parsePcmRate`, scheduled sources) | Schedule 24 kHz chunks continuously and track active sources so barge-in stops them immediately. |
| Quiet-device heuristics | `src/shared/liveMic.ts` | Useful only if later device testing shows low-level Continuity/Bluetooth input. Not part of v1. |
| Settings separation | `src/renderer/src/store/settings.ts` (`kabayanLiveModel`, idle timeout, VAD) | Keep model IDs and session limits in server environment, not user-editable localStorage. |
| Voice UI states | `src/renderer/src/components/ChatPanel.tsx`, `VoiceSettings.tsx` | Reuse the conceptual states and clear mic/billing labels; implement with PMv2 MUI styling. |
| Native model rules | `src/main/live-session-manager.ts` (`LIVE_SHARED_RULES`) | Use concise speech rules, explicit tool boundary, and interruption behavior. Replace shell-routing identity with IOCT read-only analyst identity. |
| Wake/listen | `src/renderer/src/store/wakeWord.ts`, `src/shared/liveWakePhrase.ts` | Do not include in v1. Push-to-talk avoids ambient capture, billing, and accidental activation. |
| Secret storage | `src/main/secret-store.ts` | Concept only. PMv2 is a web app: use Firebase/Google Cloud server secrets, not Electron `safeStorage`. |

## Patterns not to copy

- Electron IPC channels, preload bridges, main-process secret storage, or OS-specific microphone logic.
- Bayanihan's “speech pipe forwards to an active CLI” tool model. IOCT tools query domain records directly.
- Wake phrases, open-mic mode, phone relay, Singular Mode, finish recaps, or CLI slash commands.
- LocalStorage Gemini keys. A web page cannot protect a long-lived provider key.
- Raw free-form Firestore access. The model sees only named, schema-validated tools.
- Native Audio structured-output assumptions. The selected 2.5 Live model supports function calling but not structured outputs.

## Current external facts to re-verify during implementation

- `gemini-3.5-flash-lite` is GA as of 2026-08-13.
- The initial Live model is a configurable default, not a permanent contract.
- Client-to-server Live connections should use constrained ephemeral tokens.
- Live audio input is raw mono 16-bit little-endian PCM, natively 16 kHz; output is 24 kHz.
- Live sessions require interruption, GoAway, resumption, and context-cost handling.

Use only official Google Gemini documentation for API syntax and model availability.

