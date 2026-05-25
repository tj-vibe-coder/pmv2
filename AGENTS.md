# AGENTS.md

## Purpose

This file is the main instruction and memory guide for all LLM agents working on this webapp project.

The goal is to make agents work consistently, remember the project context, avoid repeating mistakes, and keep project knowledge organized.

---

# 1. Project Memory System

This project uses multiple memory layers.

## Source of Truth

Use these files as the official project memory:

- `AGENTS.md` — agent rules, workflow, and project instructions
- `docs/product/PRD.md` — product requirements
- `docs/architecture/` — architecture decisions and technical explanations
- `docs/agent/PROJECT_STATE.md` — current project status
- `docs/agent/TASK_LOG.md` — session-by-session work log
- `docs/agent/KNOWN_ISSUES.md` — bugs, gotchas, and recurring problems

## Obsidian

Obsidian may be used as the human planning and thinking layer.

Use Obsidian notes for:

- brainstorming
- meeting notes
- feature ideas
- client or user feedback
- UI inspiration
- business logic notes
- rough planning

Obsidian notes are not automatically the source of truth.

If an idea from Obsidian becomes final, promote it into the repo docs:

- final product requirement → `docs/product/PRD.md`
- technical decision → `docs/architecture/ADR-xxxx.md`
- current status → `docs/agent/PROJECT_STATE.md`
- recurring issue → `docs/agent/KNOWN_ISSUES.md`

## Graphify

Graphify is used as the codebase map and relationship explorer.

Use Graphify to understand:

- file relationships
- feature locations
- dependencies
- architecture flow
- risky central files
- cross-module impact

Graphify is for navigation and analysis only. It is not the final source of truth.

---

# 2. Agent Startup Workflow

Before making code changes, always do this:

1. Read `AGENTS.md`.
2. Read `docs/agent/PROJECT_STATE.md`.
3. Read the relevant product or architecture docs.
4. Check `docs/agent/KNOWN_ISSUES.md`.
5. Use Graphify if the task affects multiple files or unclear code relationships.
6. Inspect the actual code before making assumptions.

Do not rely only on chat history.

---

# 3. Agent Coding Rules

Follow these rules when editing the webapp:

- Prefer small, focused changes.
- Do not rewrite large areas unless necessary.
- Follow the existing project structure.
- Follow the existing naming conventions.
- Reuse existing components before creating new ones.
- Do not add new dependencies unless clearly justified.
- Do not change the database schema without creating or updating migrations.
- Do not remove existing functionality unless explicitly requested.
- Do not hardcode secrets, API keys, passwords, or credentials.
- Keep UI changes consistent with the existing design system.
- Keep business logic readable and documented where needed.

---

# 4. Verification Rules

After making changes, run the appropriate checks if available:

- install check
- lint
- type check
- build
- test
- database migration check
- browser/manual UI check

Suggested commands:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

If a command is unavailable, mention that it was not found.

If a check fails, explain the failure and do not claim the task is complete.

---

# 5. Documentation Update Rules

After every meaningful task, update the appropriate memory files.

## Update `docs/agent/TASK_LOG.md` when:

- code was changed
- a bug was fixed
- a feature was added
- a decision was made
- a workaround was discovered

## Update `docs/agent/PROJECT_STATE.md` when:

- current progress changes
- priorities change
- a feature moves from pending to done
- new blockers appear

## Update `docs/agent/KNOWN_ISSUES.md` when:

- a recurring bug is found
- a fragile workaround is used
- a confusing implementation detail is discovered

## Create or update an ADR when:

- a major technical decision is made
- a database structure is changed
- an authentication strategy is chosen
- a deployment strategy is chosen
- a library/framework choice affects the project long term

---

# 6. Conflict Resolution

If documents conflict, follow this priority order:

1. User’s latest explicit instruction
2. Current codebase behavior
3. `AGENTS.md`
4. `docs/agent/PROJECT_STATE.md`
5. `docs/product/PRD.md`
6. `docs/architecture/ADR-xxxx.md`
7. Obsidian notes
8. Graphify output

If unsure, explain the conflict before making changes.

---

# 7. Obsidian Usage Rules

If an Obsidian vault exists in or beside the project:

- Use it for context only.
- Do not treat rough notes as final requirements.
- Do not copy all Obsidian content into code.
- Only promote confirmed decisions into repo docs.
- Ask or infer carefully whether a note is an idea, decision, or outdated plan.

Recommended note labels:

- `idea`
- `decision`
- `draft`
- `todo`
- `reference`
- `archived`

---

# 8. Graphify Usage Rules

Use Graphify before touching large or unfamiliar parts of the app.

Helpful Graphify questions:

- Where is this feature implemented?
- Which files depend on this module?
- What is the path from this UI component to the database?
- What files are most central to this feature?
- What could break if this file changes?

After using Graphify, verify findings against the actual code.

---

# 9. Completion Checklist

Before saying a task is complete, confirm:

- Code was changed only where needed.
- Existing patterns were followed.
- Relevant checks were run or explained.
- Docs/memory were updated if needed.
- Known issues were documented.
- No secrets or credentials were exposed.
- The final response includes what changed, what was tested, and what remains.

---

# 10. Final Response Format

When reporting back, use this format:

## Done

Briefly explain what was completed.

## Changed

List the main files changed.

## Checked

List commands/tests run.

## Notes

Mention blockers, assumptions, or follow-up items.
