# Copy-paste prompt for another CLI session

Paste everything below into a fresh coding-agent session opened at `/Users/reuelrivera/Vibecode Projects/IOCT pmv2`.

---

You are implementing the approved IOCT PMv2 read-only AI Assist chat and voice feature.

Start by reading, in order:

1. `AGENTS.md`
2. `docs/agent/PROJECT_STATE.md`
3. `docs/agent/memory/index.md` and only relevant linked issues/logs
4. `docs/product/PRD.md`
5. `docs/architecture/OVERVIEW.md`
6. `docs/superpowers/specs/2026-08-13-ai-assist-chat-voice-design.md`
7. `docs/superpowers/plans/2026-08-13-ai-assist-chat-voice.md`
8. `docs/AI_ASSIST_REFERENCE_MAP.md`

Follow the implementation plan task-by-task using test-driven development. Do not redesign the feature unless current code contradicts the approved spec; if it does, stop and report the exact conflict.

Non-negotiable requirements:

- V1 is read-only. Do not add create/update/approve/submit/upload/delete tools or call PMv2 write endpoints.
- Default access is only authenticated `RJR` and `TJC`; enforce this on the server before Gemini or Firestore work. UI hiding is not authorization.
- Keep `GEMINI_API_KEY` server-side. Browser Live sessions use short-lived, one-use, constrained ephemeral tokens.
- Text defaults to `gemini-3.5-flash-lite`. Voice model is environment-configurable and initially defaults to `gemini-2.5-flash-native-audio-preview-12-2025`; verify current official model availability before implementation.
- Use `@google/genai` for new work. Do not place a Gemini key in React, localStorage, source, tests, logs, or response bodies.
- The only model tools are the exact allowlisted tools in the approved spec. Validate tool names and args, reject extra fields, cap tool rounds/results, and derive citations from server tool results.
- Exclude payroll, DTR, payslips, government IDs, user credential fields, tokens, raw receipts, and attachment bodies before serialization.
- Treat user text, page context, Firestore strings, notes, remarks, filenames, and tool results as untrusted data that cannot modify system instructions.
- Render model output as React text. Do not use `dangerouslySetInnerHTML`.
- Push-to-talk only. Do not add wake word, ambient listening, phone relay, or always-on VAD.
- Use `AudioWorklet` where supported; send 16 kHz mono signed 16-bit little-endian PCM and schedule 24 kHz PCM output. Implement interruption buffer clearing and stop-during-start race protection.
- Keep the canonical server implementation in `server/aiAssist/`; mirror it deterministically into `functions/server/aiAssist/` with a sync/check script. Register the router in both Express entrypoints.
- Tests must fake Gemini and use synthetic Firestore Emulator data. Never access production Firestore from tests.
- Do not deploy, enable the production feature flag, or modify the unrelated dirty file `src/utils/calcsheet/pdfExport.tsx`.
- Preserve all unrelated working-tree changes.

Execute only safe local development steps. At each task:

1. Write the failing focused test.
2. Run it and confirm the expected failure.
3. Implement the minimum code.
4. Run the focused test and relevant regression suite.
5. Inspect the diff for secrets, writes, excluded fields, and root/Functions drift.
6. Make an atomic commit containing only that task's files when repository policy permits.

Required final verification:

```bash
npm test -- --watchAll=false
npm run test:product-history
npm run build
node scripts/sync-ai-assist.mjs --check
```

Also run the new server AI tests and Firestore Emulator integration test commands defined by the plan. Perform manual browser checks for desktop, mobile, microphone denial, interruption, reconnect, source navigation, unauthorized access, and read-only refusal. Do not claim production readiness if any required check fails or if the current custom-auth risk has not received explicit production sign-off.

At completion, update `docs/agent/PROJECT_STATE.md`, add an atomized log entry under `docs/agent/memory/log/`, update `docs/agent/memory/index.md`, and update `docs/DATA_MODEL.md` for the metadata-only `ai_assist_audit` collection. Report changed files, tests, remaining rollout gates, model IDs actually verified, and any official Gemini documentation consulted.

---

