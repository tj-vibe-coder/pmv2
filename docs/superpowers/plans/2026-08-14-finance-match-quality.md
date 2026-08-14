# Finance Match Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove obviously unrelated Finance Money Trail candidates while retaining centavo and small-peso duplicate detection.

**Architecture:** Keep matching deterministic in the pure `rankCandidates` helper. Apply a hard date boundary when both dates exist, require at least one semantic identity signal, then retain the existing two-signal score, amount tolerance, sorting, and five-result cap.

**Tech Stack:** Node.js, CommonJS, Node test runner.

---

### Task 1: Reproduce and correct false-positive matching

**Files:**
- Modify: `server/financeTrace.js`
- Test: `server/financeTrace.test.js`

- [ ] **Step 1: Write failing regression tests**

Add tests proving that Microsoft versus Easytrip/reflective-vest records are excluded even when amount, date, and project are close; a Microsoft record more than 14 days away is excluded even with matching words and amount; and a near-centavo Microsoft spelling variation remains included.

```js
test('rankCandidates requires semantic identity beyond amount date and project', () => {
  const origin = {
    type: 'investment', id: 'microsoft', data: {
      date: '2026-02-14', amount: 240.23,
      description: 'MICROSOFT MSBILL.INFO SGP', projectId: 'p1',
    },
  };
  const result = rankCandidates(origin, [
    { type: 'expense', collection: 'project_expenses', id: 'easytrip', data: {
      date: '2026-02-12', amount: 212, description: 'Easytrip RFID load - For Cebu', projectId: 'p1',
    } },
    { type: 'expense', collection: 'project_expenses', id: 'vest', data: {
      date: '2026-02-06', amount: 198, description: 'Reflective vest, 2pcs', projectId: 'p1',
    } },
  ]);
  assert.deepEqual(result, []);
});

test('rankCandidates rejects matching descriptions outside the 14 day window', () => {
  const origin = { type: 'investment', id: 'i1', data: {
    date: '2026-02-10', amount: 5807, description: 'Cebu Pacific MNL to Ceb',
  } };
  const result = rankCandidates(origin, [{
    type: 'expense', collection: 'project_expenses', id: 'march-flight', data: {
      date: '2026-03-19', amount: 5810, description: 'PAL MNL to Ceb',
    },
  }]);
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test server/financeTrace.test.js`

Expected: the new false-positive tests fail because amount/date/project can currently satisfy the signal threshold and dates outside 14 days do not reject a candidate.

- [ ] **Step 3: Implement the minimal semantic and date gates**

In `rankCandidates`, reject a candidate when `dayDistance > 14`. Track whether description overlap or an exact supplier, invoice, receipt, or source-reference match exists. Require that semantic flag in addition to the existing `signals >= 2` rule. Do not treat project or investor as semantic identity.

```js
const dayDistance = daysBetween(originValues.date, values.date);
if (dayDistance !== null && dayDistance > 14) return [];

let hasSemanticIdentity = false;
if (words.length >= 2) hasSemanticIdentity = true;

const semanticLabels = new Set(['supplier', 'invoice', 'receipt', 'source reference']);
// Set hasSemanticIdentity when one of these exact signals matches.

if (signals < 2 || !hasSemanticIdentity) return [];
```

- [ ] **Step 4: Run focused and full server verification**

Run:

```bash
node --test server/financeTrace.test.js
node --test server/*.test.js
```

Expected: all tests pass, including the existing centavo-match and stable-cap tests.

- [ ] **Step 5: Update project memory and commit**

Record the refined matching contract and verification in `docs/agent/TASK_LOG.md` and `docs/agent/PROJECT_STATE.md`.

```bash
git add server/financeTrace.js server/financeTrace.test.js docs/agent/TASK_LOG.md docs/agent/PROJECT_STATE.md docs/superpowers/specs/2026-08-14-finance-money-trail-design.md docs/superpowers/plans/2026-08-14-finance-match-quality.md
git commit -m "fix: reduce finance trace false positives"
```

### Task 2: Refresh and verify the running app

**Files:**
- No source changes expected.

- [ ] **Step 1: Restart the feature development server**

Stop and restart `npm start` from `/Users/reuelrivera/Vibecode Projects/IOCT pmv2-money-trail` so the backend loads the changed matcher.

- [ ] **Step 2: Verify the live Microsoft trail**

Open the Microsoft Money Trail and confirm Easytrip RFID, Lalamove, reflective vest, and any matching-description record more than 14 days away are absent. Confirm plausible Microsoft records inside 14 days remain visible with evidence.

