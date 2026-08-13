# Project State

Updated: 2026-08-13

## Current status

- Read-only AI Assist chat and push-to-talk voice is designed and approved for implementation.
- The implementation contract uses Gemini 3.5 Flash-Lite for structured text chat and a separately configurable Gemini Live native-audio model over one allowlisted read-only PMv2 tool layer.
- Durable artifacts: `docs/superpowers/specs/2026-08-13-ai-assist-chat-voice-design.md`, `docs/superpowers/plans/2026-08-13-ai-assist-chat-voice.md`, `docs/AI_ASSIST_REFERENCE_MAP.md`, and `docs/AI_ASSIST_BUILDER_PROMPT.md`.
- No AI Assist production code has been implemented or enabled yet.
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

- AI Assist production enablement is gated by its implementation and verification plan plus explicit acceptance of the existing forgeable base64-token authentication risk.
- The configured Gemini Live model and ephemeral-token constraint syntax must be verified against official documentation during implementation because Live model availability changes independently of text models.

## Next considerations

- Execute the AI Assist plan in a fresh CLI session using `docs/AI_ASSIST_BUILDER_PROMPT.md`; keep `AI_ASSIST_ENABLED=false` until the golden-set, authorization, secret-exposure, emulator, and audio-lifecycle checks pass.
- Deploy or merge according to the repository branch workflow when requested.
- Consider improving the insufficient-history panel to show excluded evidence reasons; this is explanatory polish, not a correctness blocker.
