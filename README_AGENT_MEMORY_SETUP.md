# README — Agent Memory Setup

This project uses a multi-layered memory system so every developer and AI agent can onboard with full context.

---

## Memory Files (priority order)

| Priority | File | Purpose |
|---|---|---|
| 1 | `CLAUDE.md` (root) | Canonical project memory — loaded first by Claude Code. Company context, repo layout, deployment, module history, conventions. |
| 2 | `AGENTS.md` (root) | Agent rules, coding conventions, verification workflow, documentation update rules. |
| 3 | `docs/architecture/OVERVIEW.md` | High-level system architecture — modules, data flow, auth flow, deployment notes, known risks. |
| 4 | `docs/architecture/ADR-0001-project-foundation.md` | Foundation tech decisions — why React, Express, Firestore, MUI, custom auth were chosen. |
| 5 | `docs/product/PRD.md` | Product requirements — target users, use cases, core features, user roles, scope boundaries. |
| 6 | `docs/agent/PROJECT_STATE.md` | Current project state — what's done, in progress, next priorities, blockers. |
| 7 | `docs/agent/TASK_LOG.md` | Session-by-session work log — what changed, which files, checks run, notes. |
| 8 | `docs/agent/KNOWN_ISSUES.md` | Documented bugs, fragile workarounds, confusing patterns — with cause, workaround, and proper fix. |
| 9 | `docs/ARCHITECTURE.md` | Full system map — 9 module descriptions, routing table, API endpoint summary, Firestore schema, data flows. |
| 10 | `docs/API.md` | Express API reference — every endpoint with request/response shapes, validation rules, auth matrix. |
| 11 | `docs/DATA_MODEL.md` | Entity relationships, field-level schema for all collections, LocalStorage keys, computed formulas. |
| 12 | `docs/PAYROLL_MODULE_INSTRUCTIONS.md` | Payroll module spec — types, PH Labor Code formulas, UI components, implementation order. |
| 13 | `docs/CLAUDE_CODE_PREP_GUIDE.md` | Claude Code session orchestration — architecture decisions, session starters, deployment sequence. |
| 14 | `docs/graphify/GRAPHIFY_USAGE.md` | How and when to use Graphify for codebase exploration. |
| 15 | `docs/obsidian/OBSIDIAN_WORKFLOW.md` | Obsidian vault workflow — idea capture → promotion to repo docs.

---

## How agents load context

**Claude Code** reads `CLAUDE.md` automatically on session start in this repo, plus the user-global `~/.claude/CLAUDE.md`. No manual action needed.

**Other AI agents** should read in this order:
1. `CLAUDE.md` (always first)
2. `AGENTS.md` (coding rules)
3. `docs/ARCHITECTURE.md` (understand the system)
4. Then domain-specific docs as needed (`docs/API.md`, `docs/DATA_MODEL.md`, etc.)

---

## Keeping memory up to date

After every non-trivial session, update these files:

| If you... | Update... |
|---|---|
| Add a feature, fix a bug, or make a decision | `CLAUDE.md` → Recent additions, `docs/agent/TASK_LOG.md` |
| Change project status or priorities | `docs/agent/PROJECT_STATE.md` |
| Discover a recurring problem | `docs/agent/KNOWN_ISSUES.md` |
| Make a major architectural decision | `docs/architecture/ADR-XXXX.md` (new), `docs/architecture/OVERVIEW.md` |
| Change routes, APIs, or data flow | `docs/ARCHITECTURE.md`, `docs/API.md` |
| Add/modify API endpoints | `docs/API.md` |
| Change the database schema | `docs/DATA_MODEL.md` |
| Update product requirements or scope | `docs/product/PRD.md` |
| Change deployment/push flow | `CLAUDE.md` → Section 2 |

---

## What NOT to put in memory

- **Secrets, passwords, service account JSON** — use env var references or placeholders
- **Auto-generated artifacts** — `graphify-out/` is gitignored
- **Personal contact info** — genericize customer/employee names unless they're already public

---

## File structure

```
pmv2/
├── CLAUDE.md                              ← Canonical memory (auto-loaded)
├── AGENTS.md                              ← Agent rules + coding conventions
├── README_AGENT_MEMORY_SETUP.md           ← This file
├── .gitignore                             ← Includes /graphify-out/
└── docs/                                  ← All reference documentation
    ├── architecture/
    │   ├── OVERVIEW.md                    ← High-level architecture
    │   └── ADR-0001-project-foundation.md ← Foundation tech decisions
    ├── product/
    │   └── PRD.md                         ← Product requirements
    ├── agent/
    │   ├── PROJECT_STATE.md               ← Current project status
    │   ├── TASK_LOG.md                    ← Session work log
    │   └── KNOWN_ISSUES.md                ← Bugs, gotchas, workarounds
    ├── graphify/
    │   └── GRAPHIFY_USAGE.md              ← Graphify exploration guidelines
    ├── obsidian/
    │   └── OBSIDIAN_WORKFLOW.md           ← Obsidian-to-repo promotion rules
    ├── ARCHITECTURE.md                    ← Full system map (764 lines)
    ├── API.md                             ← API reference (870 lines)
    ├── DATA_MODEL.md                      ← DB schema + types (562 lines)
    ├── PAYROLL_MODULE_INSTRUCTIONS.md     ← Payroll module spec
    └── CLAUDE_CODE_PREP_GUIDE.md          ← Session prep guide
```
