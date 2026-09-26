// Gantt workspace customization: which table columns show (order + width),
// what the chart draws, and named Views that bundle those with filters and
// zoom (MS Project's Tables + Views). Built-in views ship with the app;
// custom views are saved in this browser.

export type GanttColumnKey = 'name' | 'dur' | 'start' | 'finish' | 'bfin' | 'fvar' | 'pred' | 'mp' | 'pct' | 'wt' | 'cat' | 'float' | 'notes';

export const GANTT_COLUMNS: { key: GanttColumnKey; label: string; w: number; align?: 'left' | 'right' | 'center'; hint?: string }[] = [
  { key: 'name', label: 'Task Name', w: 250 },
  { key: 'dur', label: 'Duration', w: 74 },
  { key: 'start', label: 'Start', w: 96 },
  { key: 'finish', label: 'Finish', w: 96 },
  { key: 'bfin', label: 'Baseline Finish', w: 104, hint: 'Shown when a baseline is set and visible' },
  { key: 'fvar', label: 'Finish Var.', w: 76, align: 'right', hint: 'Shown when a baseline is set and visible' },
  { key: 'pred', label: 'Predecessors', w: 96 },
  { key: 'mp', label: 'Manpower', w: 74, align: 'right' },
  { key: 'pct', label: '% Complete', w: 80, align: 'right' },
  { key: 'wt', label: 'Weight', w: 66, align: 'right' },
  { key: 'cat', label: 'Category', w: 110 },
  { key: 'float', label: 'Total Float', w: 78, align: 'right', hint: 'Working days a task can slip before the project finish moves' },
  { key: 'notes', label: 'Notes', w: 180 },
];
const DEF = new Map(GANTT_COLUMNS.map((c) => [c.key, c]));
export const columnDef = (key: GanttColumnKey) => DEF.get(key) as (typeof GANTT_COLUMNS)[number];

export interface GanttColumn { key: GanttColumnKey; w: number }
const cols = (...keys: GanttColumnKey[]): GanttColumn[] => keys.map((key) => ({ key, w: columnDef(key).w }));

export interface GanttDisplay {
  dependencies: boolean;
  progress: boolean;
  baseline: boolean;
  critical: boolean;
  today: boolean;
  weekends: boolean;
  /** Category next to each bar (and the date next to milestones). */
  taskLabels: boolean;
  /** [headcount] next to each bar. */
  manpowerLabels: boolean;
}
export const DISPLAY_OPTIONS: { key: keyof GanttDisplay; label: string }[] = [
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'progress', label: 'Progress' },
  { key: 'baseline', label: 'Baseline' },
  { key: 'critical', label: 'Critical path' },
  { key: 'today', label: 'Today line' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'taskLabels', label: 'Task labels' },
  { key: 'manpowerLabels', label: 'Manpower labels' },
];

export interface GanttViewFilters { categories: string[]; milestonesOnly: boolean; highlight: string }

export interface GanttView {
  id: string;
  name: string;
  description?: string;
  builtIn?: boolean;
  columns: GanttColumn[];
  display: GanttDisplay;
  filters: GanttViewFilters;
  zoom: string;
}

const ALL_ON: GanttDisplay = { dependencies: true, progress: true, baseline: true, critical: false, today: true, weekends: true, taskLabels: true, manpowerLabels: true };
const NO_FILTERS: GanttViewFilters = { categories: [], milestonesOnly: false, highlight: 'none' };

export const DEFAULT_COLUMNS = cols('name', 'dur', 'start', 'finish', 'bfin', 'fvar', 'pred', 'mp', 'pct', 'wt', 'cat');
export const DEFAULT_DISPLAY = ALL_ON;

export const BUILTIN_VIEWS: GanttView[] = [
  {
    id: 'full', name: 'Full', builtIn: true, description: 'Every column — the internal working view',
    columns: DEFAULT_COLUMNS, display: ALL_ON, filters: NO_FILTERS, zoom: 'week',
  },
  {
    id: 'planning', name: 'Planning', builtIn: true, description: 'Dates, durations, links and float',
    columns: cols('name', 'dur', 'start', 'finish', 'pred', 'float'),
    display: { ...ALL_ON, critical: true, baseline: false, manpowerLabels: false }, filters: NO_FILTERS, zoom: 'week',
  },
  {
    id: 'progress', name: 'Progress', builtIn: true, description: '% complete, weights and baseline variance',
    columns: cols('name', 'start', 'finish', 'bfin', 'fvar', 'pct', 'wt'),
    display: { ...ALL_ON, dependencies: false, manpowerLabels: false }, filters: NO_FILTERS, zoom: 'week',
  },
  {
    id: 'manpower', name: 'Manpower', builtIn: true, description: 'Headcount per task',
    columns: cols('name', 'dur', 'start', 'finish', 'mp', 'cat'),
    display: { ...ALL_ON, dependencies: false, baseline: false, taskLabels: false }, filters: NO_FILTERS, zoom: 'week',
  },
  {
    id: 'client', name: 'Client', builtIn: true, description: 'Simplified schedule for sharing',
    columns: cols('name', 'start', 'finish', 'pct'),
    display: { dependencies: false, progress: true, baseline: false, critical: false, today: true, weekends: false, taskLabels: false, manpowerLabels: false },
    filters: NO_FILTERS, zoom: 'month',
  },
];

const VIEWS_KEY = 'gantt-views';
export function loadCustomViews(): GanttView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const list = raw ? (JSON.parse(raw) as GanttView[]) : [];
    return Array.isArray(list) ? list.filter((v) => v && v.id && v.name && Array.isArray(v.columns)) : [];
  } catch {
    return [];
  }
}
export function saveCustomViews(views: GanttView[]): void {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* ignore */ }
}

/** Keep only known columns (a saved view may predate a column change). */
export function sanitizeColumns(list: GanttColumn[] | undefined): GanttColumn[] {
  const seen = new Set<GanttColumnKey>();
  const out = (list || []).filter((c) => DEF.has(c.key) && !seen.has(c.key) && seen.add(c.key))
    .map((c) => ({ key: c.key, w: Math.max(40, Math.round(Number(c.w) || columnDef(c.key).w)) }));
  if (!out.some((c) => c.key === 'name')) out.unshift({ key: 'name', w: columnDef('name').w });
  return out;
}
