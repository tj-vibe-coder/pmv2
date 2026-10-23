import { financeFocusUrl } from '../utils/financeTraceFocus';

// App-wide Whiteboard — a sticky-note board (one column per team
// member) plus a private "Just for me" area. Not calcsheet-specific; the
// popup (once per login session) and the always-available quick-access
// button both live in Header.tsx, and the data itself is served by
// whiteboardStore.ts.

export type WhiteboardKind = 'update' | 'note' | 'todo';
// 'general' = the team-wide "General updates" list — the whole shared board:
// always a to-do, visible to everyone, no per-person assignment (anyone may
// tick it; only the poster edits or deletes). 'public' items come from the old
// per-person columns and are shown as General too.
export type WhiteboardVisibility = 'public' | 'private' | 'general';

// Team-wide lists on the board. Every shared item sits in one of these;
// items saved before categories existed (or from the old person columns)
// count as 'general'.
export type WhiteboardCategory = 'general' | 'project' | 'sales' | 'finance';
export const WHITEBOARD_CATEGORIES: { key: WhiteboardCategory; label: string; color: string; lightColor: string }[] = [
  { key: 'general', label: 'General', color: '#c77d12', lightColor: '#fffaf0' },
  { key: 'project', label: 'Project', color: '#2c5aa0', lightColor: '#f2f6fc' },
  { key: 'sales', label: 'Sales', color: '#2e7d32', lightColor: '#f3faf3' },
  { key: 'finance', label: 'Finance', color: '#7b4fa6', lightColor: '#f7f2fb' },
];
export const whiteboardCategoryOf = (item: { category?: WhiteboardCategory }): WhiteboardCategory =>
  item.category && WHITEBOARD_CATEGORIES.some((c) => c.key === item.category) ? item.category : 'general';

// Fixed roster (TJ, RJ, Renzel, Nylle, Kim) — the board's columns, not an open-ended list. Real
// names are kept here only as a comment/reference for whoever edits this.
export type WhiteboardPerson = 'tj' | 'rj' | 'renzel' | 'nylle' | 'kim';

export interface WhiteboardPersonInfo {
  key: WhiteboardPerson;
  label: string;
  // The short tag the team uses for this person on the board (TJC, RJR…).
  tag: string;
  color: string;      // column header background
  lightColor: string; // sticky-note background
  // Lowercase words that identify this person's login account (any word of
  // full name / username / email local-part). Keep in sync with
  // WHITEBOARD_PERSON_ALIASES in server.js, which enforces the same rule.
  aliases: string[];
}

// tj = Tyrone James Caballero, rj = Reuel Joshua Rivera, renzel = Renzel
// Punongbayan, nylle = Nylle Harold Managa, kim = Kim Solis.
export const WHITEBOARD_PEOPLE: WhiteboardPersonInfo[] = [
  { key: 'tj', label: 'TJ', tag: 'TJC', color: '#f0b357', lightColor: '#fdf1de', aliases: ['tj', 'tjc', 'tyrone', 'caballero'] },
  { key: 'rj', label: 'RJ', tag: 'RJR', color: '#7fb1e0', lightColor: '#e7f1fb', aliases: ['rj', 'rjr', 'reuel', 'rivera'] },
  { key: 'renzel', label: 'Renzel', tag: 'RPP', color: '#a8cf7c', lightColor: '#eef7e4', aliases: ['renzel', 'punongbayan'] },
  { key: 'nylle', label: 'Nylle', tag: 'NDM', color: '#b18fd1', lightColor: '#f2eaf9', aliases: ['nylle', 'managa'] },
  { key: 'kim', label: 'Kim', tag: 'KKS', color: '#e8909f', lightColor: '#fcecef', aliases: ['kim', 'solis'] },
];

// Which column (if any) a logged-in user is — so the person a public to-do is
// assigned to can tick it. null for anyone who isn't one of the board's people.
export function whiteboardPersonOf(user: { full_name?: string | null; username?: string; email?: string } | null | undefined): WhiteboardPerson | null {
  if (!user) return null;
  const words = [user.full_name, user.username, (user.email || '').split('@')[0]]
    .filter(Boolean)
    .flatMap((s) => String(s).toLowerCase().split(/[^a-z]+/))
    .filter(Boolean);
  const match = WHITEBOARD_PEOPLE.find((p) => words.some((w) => p.aliases.includes(w)));
  return match ? match.key : null;
}

// How a person is shown on the board, to keep cards compact: the team's tag for them (TJC, RJR, RPP, NDM, KKS) when the
// name is one of the roster's people, otherwise the initials ("Some Other Person" → "SOP"). A one-word name is kept as is.
export function whiteboardTag(name: string | null | undefined): string {
  const person = whiteboardPersonOf({ full_name: name });
  if (person) return WHITEBOARD_PEOPLE.find((p) => p.key === person)!.tag;
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.length === 1 ? words[0] : words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
}

// Optional connection from a note to one Project List project or one
// calcsheet proposal (not a specific quotation — revisions change, the
// proposal doesn't). `label` is a snapshot taken when the link was made, so
// rendering a note never needs to fetch the project; a later rename won't
// update it until the note is re-linked.
export type WhiteboardLinkType = 'project' | 'calcsheet' | 'invoice' | 'liquidation';
export interface WhiteboardLink {
  type: WhiteboardLinkType;
  id: string;
  label: string;
}

export const WHITEBOARD_LINK_GROUPS: Record<WhiteboardLinkType, string> = {
  project: 'Projects',
  calcsheet: 'Calcsheet proposals',
  invoice: 'Invoices',
  liquidation: 'Liquidations',
};

export function whiteboardLinkHref(link: WhiteboardLink, from?: string): string {
  const id = encodeURIComponent(link.id);
  switch (link.type) {
    case 'project': return `/projects/${id}`;
    case 'calcsheet': return `/sales/calcsheet/projects/${id}`;
    case 'invoice': return `/finance/collections?tab=receivables&invoice=${id}`;
    case 'liquidation': return financeFocusUrl({ type: 'liquidation', id: link.id, rowId: '__form__' }, from);
  }
}

// ── Repeating to-dos ──────────────────────────────────────────────────────────
// Ticking a repeating to-do creates the next one (server-side), so the list never runs dry.
export type WhiteboardRecurrence = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const WHITEBOARD_RECURRENCES: { key: WhiteboardRecurrence; label: string }[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'monthly', label: 'Every month' },
  { key: 'yearly', label: 'Every year' },
];

export const WHITEBOARD_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
export const whiteboardMonthDayLabel = (day: number) => (day === 0 ? 'Last day of the month' : ordinal(day));

/** Short chip text: "Daily", "Weekly · Mon", "Monthly · 15th", "Monthly · last day", "Yearly". */
export function whiteboardRecurrenceLabel(rule: WhiteboardRecurrence, day?: number | null): string {
  const base = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[rule];
  if (rule === 'weekly' && day != null) return `${base} · ${WHITEBOARD_WEEKDAYS[day]?.slice(0, 3) ?? ''}`;
  if (rule === 'monthly' && day != null) return `${base} · ${day === 0 ? 'last day' : ordinal(day)}`;
  return base;
}

/** The day a repeat starts on when the user picks a frequency: the due date's weekday / day of month (or today's). */
export function defaultRecurrenceDay(rule: WhiteboardRecurrence | '', dueDate?: string): number | null {
  if (rule !== 'weekly' && rule !== 'monthly') return null;
  const d = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date();
  return rule === 'weekly' ? d.getDay() : d.getDate();
}

/** First due date of a new repeating item with no due date (mirrors the server): the next time its chosen day comes round. */
export function whiteboardFirstDueDate(rule: WhiteboardRecurrence, day: number | null | undefined, today: string = whiteboardToday()): string {
  const t = new Date(`${today}T00:00:00`);
  if (rule === 'weekly' && day != null) {
    while (t.getDay() !== day) t.setDate(t.getDate() + 1);
    return whiteboardToday(t);
  }
  if (rule === 'monthly' && day != null) {
    const pick = (y: number, m: number) => new Date(y, m, day === 0 ? new Date(y, m + 1, 0).getDate() : Math.min(day, new Date(y, m + 1, 0).getDate()));
    const thisMonth = pick(t.getFullYear(), t.getMonth());
    return whiteboardToday(whiteboardToday(thisMonth) >= today ? thisMonth : pick(t.getFullYear(), t.getMonth() + 1));
  }
  return today;
}

// ── Due dates ─────────────────────────────────────────────────────────────────
export type WhiteboardDueState = 'overdue' | 'today' | 'soon' | 'later';

/** Today as YYYY-MM-DD in the viewer's local calendar (the team is all in the Philippines). */
export const whiteboardToday = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Where a to-do's due date sits relative to today: overdue, today, within 3 days, or later. null = no due date. */
export function whiteboardDueState(dueDate: string | undefined, today: string = whiteboardToday()): WhiteboardDueState | null {
  if (!dueDate) return null;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const soon = new Date(`${today}T00:00:00`);
  soon.setDate(soon.getDate() + 3);
  return dueDate <= whiteboardToday(soon) ? 'soon' : 'later';
}

/** Overdue and soonest-due first, then the rest oldest-first like a checklist. Does not mutate. */
export function sortWhiteboardPending<T extends { dueDate?: string; createdAt: string }>(items: T[], today: string = whiteboardToday()): T[] {
  const rank = (i: T) => {
    const s = whiteboardDueState(i.dueDate, today);
    return s === 'overdue' ? 0 : s === 'today' ? 1 : s === 'soon' ? 2 : 3;
  };
  return [...items].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra < 3) return String(a.dueDate).localeCompare(String(b.dueDate)) || a.createdAt.localeCompare(b.createdAt);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// A checklist line under a task. Anyone may add or tick one; it can be removed by whoever added it or by the task's poster.
export interface WhiteboardSubtask {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  // Who added it — set by the server (absent on a subtask the poster made before this was recorded).
  createdBy?: string;
  createdByName?: string;
  // Who ticked it and when — set by the server.
  doneBy?: string;
  doneByName?: string;
  doneAt?: string;
}

// A dated status note on a task, so a slow task doesn't look neglected. Anyone may add one, optionally with
// a `progress` (0–100); the task's own `progress` is the latest note's value.
export interface WhiteboardUpdate {
  id: string;
  text: string;
  progress?: number;
  by: string;
  byName: string;
  at: string;
}

export interface WhiteboardItem {
  id: string;
  kind: WhiteboardKind;
  // 'public' — shows as a sticky note on the board, in `assignedTo`'s column,
  // visible to every signed-in user (and, if it's a to-do, anyone can toggle
  // `done` — a shared task). 'private' — only the creator ever receives it
  // (filtered server-side, not just hidden in the UI); shows in "Just for me"
  // instead of on the board, so it has no column.
  visibility: WhiteboardVisibility;
  // Which of the 4 columns a PUBLIC item is posted to — chosen by whoever
  // posts it (not necessarily themselves; you can leave a note in someone
  // else's column). Required for public items, irrelevant/omitted for
  // private ones.
  assignedTo?: WhiteboardPerson;
  text: string;
  // Which team-wide list a shared item is in (absent = 'general').
  category?: WhiteboardCategory;
  // Only meaningful when kind === 'todo'.
  done?: boolean;
  // Who ticked it and when — set by the server (never by the client) when `done` flips to true.
  doneBy?: string;
  doneByName?: string;
  doneAt?: string;
  // Optional deadline, YYYY-MM-DD. Only meaningful when kind === 'todo'.
  dueDate?: string;
  // Repeating to-do: ticking it creates the next one (see server/whiteboardRules.js).
  recurrence?: WhiteboardRecurrence;
  /** The specific day a repeat falls on: weekly → 0–6 (0 = Sunday); monthly → 1–31, or 0 = the last day. */
  recurrenceDay?: number;
  /** Server bookkeeping for repeats: the item this one was created from / the one created when this was ticked. */
  recurrenceOf?: string;
  spawnedNextId?: string;
  link?: WhiteboardLink;
  // Checklist, dated status notes (oldest first) and 0–100 progress. All three are written only through the
  // server's subtask / note endpoints, never the generic edit.
  subtasks?: WhiteboardSubtask[];
  updates?: WhiteboardUpdate[];
  progress?: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
