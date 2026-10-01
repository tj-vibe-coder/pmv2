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
  { key: 'tj', label: 'TJ', color: '#f0b357', lightColor: '#fdf1de', aliases: ['tj', 'tjc', 'tyrone', 'caballero'] },
  { key: 'rj', label: 'RJ', color: '#7fb1e0', lightColor: '#e7f1fb', aliases: ['rj', 'rjr', 'reuel', 'rivera'] },
  { key: 'renzel', label: 'Renzel', color: '#a8cf7c', lightColor: '#eef7e4', aliases: ['renzel', 'punongbayan'] },
  { key: 'nylle', label: 'Nylle', color: '#b18fd1', lightColor: '#f2eaf9', aliases: ['nylle', 'managa'] },
  { key: 'kim', label: 'Kim', color: '#e8909f', lightColor: '#fcecef', aliases: ['kim', 'solis'] },
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

// Optional connection from a note to one Project List project or one
// calcsheet proposal (not a specific quotation — revisions change, the
// proposal doesn't). `label` is a snapshot taken when the link was made, so
// rendering a note never needs to fetch the project; a later rename won't
// update it until the note is re-linked.
export type WhiteboardLinkType = 'project' | 'calcsheet';
export interface WhiteboardLink {
  type: WhiteboardLinkType;
  id: string;
  label: string;
}

export function whiteboardLinkHref(link: WhiteboardLink): string {
  return link.type === 'project'
    ? `/projects/${encodeURIComponent(link.id)}`
    : `/sales/calcsheet/projects/${encodeURIComponent(link.id)}`;
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
  // Optional deadline, YYYY-MM-DD. Only meaningful when kind === 'todo'.
  dueDate?: string;
  link?: WhiteboardLink;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
