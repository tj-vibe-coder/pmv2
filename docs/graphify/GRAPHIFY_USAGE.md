# Graphify Usage Guide

## Purpose

Graphify is used as a codebase map and relationship explorer.

Use it to understand the project structure before making changes that affect multiple files.

Graphify is not the final source of truth. Always verify Graphify findings against the actual code.

---

## When to Use Graphify

Use Graphify when:

- the task touches multiple files
- the codebase area is unfamiliar
- you need to trace feature implementation
- you need to understand dependencies
- you need to identify risky central files
- you need to understand module relationships

---

## Helpful Questions

- Where is this feature implemented?
- Which files depend on this module?
- What is the path from this UI component to the database?
- What files are most central to this feature?
- What could break if this file changes?
- Which files are related to authentication?
- Which files are related to billing, reporting, or dashboard logic?

---

## Agent Rule

After using Graphify:

1. Summarize what Graphify suggested.
2. Inspect the actual files.
3. Verify that the code matches the Graphify output.
4. Only then make changes.

---

## Project-Specific Notes

- Graphify output lives in `graphify-out/` at the repo root — **this directory is gitignored** (added to `.gitignore` 2026-05-21)
- The auto-generated obsidian notes in `graphify-out/obsidian/` are too shallow to be useful (762 nodes, 88% extraction confidence, many unnamed communities)
- The `graphify-out/GRAPH_REPORT.md` has some useful high-level summaries (god nodes, hyperedges) but most clusters are numbered "Community N" without semantic labels
- Prefer `docs/ARCHITECTURE.md` for system understanding — it was written by reading the actual source code

## Do Not

- Do not use Graphify as the only source of truth.
- Do not modify code based only on graph output.
- Do not ignore repo docs when Graphify output appears to conflict.
- Do not commit Graphify output to git (it's gitignored).
