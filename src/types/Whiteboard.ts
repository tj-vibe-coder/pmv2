// App-wide Whiteboard — team notes, to-do items, and updates. Not
// calcsheet-specific, so this lives outside types/Quotation.ts; the popup
// (once per login session) and the always-available quick-access button both
// live in Header.tsx, and the data itself is served by whiteboardStore.ts.

export type WhiteboardKind = 'update' | 'note' | 'todo';
export type WhiteboardVisibility = 'public' | 'private';

export interface WhiteboardItem {
  id: string;
  kind: WhiteboardKind;
  // 'public' — every signed-in user can see it (and toggle `done` if it's a
  // public to-do — a shared task anyone can mark complete). 'private' — only
  // the creator ever receives it; the server filters this server-side, not
  // just in the UI. Chosen per item by whoever creates it.
  visibility: WhiteboardVisibility;
  text: string;
  // Only meaningful when kind === 'todo'.
  done?: boolean;
  // Optional deadline, YYYY-MM-DD. Only meaningful when kind === 'todo'.
  dueDate?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
