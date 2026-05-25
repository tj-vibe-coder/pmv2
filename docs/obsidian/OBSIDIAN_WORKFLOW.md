# Obsidian Workflow for This Project

## Purpose

Obsidian is used as the human thinking and planning layer.

It is useful for brainstorming, connected notes, meeting notes, rough planning, UI ideas, and business logic exploration.

Obsidian is not automatically the source of truth for the webapp.

---

## Recommended Vault Structure

```text
00 Inbox
01 Projects
02 Decisions
03 Meetings
04 UI Ideas
05 Business Logic
06 Technical References
99 Archive
```

---

## Recommended Note Types

Use labels or headings to clarify the status of a note:

- `idea`
- `decision`
- `draft`
- `todo`
- `reference`
- `archived`

---

## Rule for Agents

Agents may read Obsidian notes for context, but must not treat rough notes as final requirements.

If an Obsidian note becomes final, promote it into the repo:

- final product requirement → `docs/product/PRD.md`
- technical decision → `docs/architecture/ADR-xxxx.md`
- current project status → `docs/agent/PROJECT_STATE.md`
- recurring issue → `docs/agent/KNOWN_ISSUES.md`

---

## Recommended Workflow

1. Capture rough ideas in Obsidian.
2. Refine the idea into a clear decision or requirement.
3. Promote confirmed items into repo docs.
4. Let agents use repo docs as the official memory.

---

## Example

Obsidian note:

```text
Maybe we should use Supabase Auth instead of custom auth.
Reason: faster MVP, built-in session handling, less security risk.
```

Promoted repo decision:

```text
docs/architecture/ADR-0002-auth-provider.md
```

## Project-Specific Notes

- The auto-generated Graphify obsidian notes in `graphify-out/obsidian/` are not human-written — they're machine-generated from code analysis and have low semantic quality
- Real human Obsidian notes live in a separate vault at `~/Documents/Projects/IOCT Obsidian/` (not in this repo)
- The `docs/` folder contains the promoted, canonical versions of any decisions or requirements
- See `docs/agent/PROJECT_STATE.md` for current project status
- See `docs/agent/KNOWN_ISSUES.md` for documented problems and workarounds
