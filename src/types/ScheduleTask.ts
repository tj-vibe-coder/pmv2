export interface ScheduleTask {
  id: string;
  projectId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  progressPct: number;
  category?: string;
  isMilestone: boolean;
  order: number;
  notes?: string;
  /** Duration value (source of truth). endDate is derived from
   *  startDate + durationDays under the active working-day calendar. */
  durationDays?: number;
  /** Finish-to-start predecessor task ids. A task with predecessors is
   *  auto-scheduled to start the day after its latest predecessor ends. */
  predecessors?: string[];
  /** Type + lag (working days) for links that aren't a plain finish-to-start,
   *  keyed by predecessor id. Absent = FS with no lag. See scheduleLinks. */
  linkTypes?: Record<string, { type: LinkType; lag: number }>;
  /** Parent (summary) task id for WBS hierarchy. Null/absent = top level.
   *  A task that is some other task's parent is a summary — its dates and
   *  progress roll up from its children and aren't edited directly. */
  parentId?: string | null;
  /** Manpower loading: headcount (pax) working on this task each working day.
   *  Man-days = manpower × working days; drives the S-Curve weighting and the
   *  manpower histogram. Unset/0 = no labor (e.g. procurement lead time). */
  manpower?: number;
  /** Progress weight (any unit — %, cost, man-hours). Once any task has one,
   *  project/phase % complete weigh each task by weight ÷ total instead of by
   *  duration; see utils/calcsheet/scheduleWeights. Leaf tasks only. */
  weight?: number;
  /** MS Project task mode. 'auto' (default): dates follow predecessors.
   *  'manual': the entered start/finish stand — predecessors never move it. */
  mode?: 'auto' | 'manual';
  /** Row highlight colour (MS Project "Text Highlight"); null/absent = none. */
  highlight?: TaskHighlight | null;
  createdAt?: string;
  updatedAt?: string;
}

/** MS Project dependency types: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish. */
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export const SCHEDULE_TASK_CATEGORIES = [
  'Engineering',
  'Procurement',
  'Fabrication',
  'Installation',
  'Programming',
  'Commissioning',
  'Other',
] as const;

export type ScheduleTaskCategory = typeof SCHEDULE_TASK_CATEGORIES[number];

export const SCHEDULE_CATEGORY_COLORS: Record<string, string> = {
  Engineering: '#2c5aa0',
  Procurement: '#4f7bc8',
  Fabrication: '#3c6ba5',
  Installation: '#00b894',
  Programming: '#74b9ff',
  Commissioning: '#fdcb6e',
  Other: '#8e8e93',
};

// Row highlight colours for the Gantt table (and the PDF export).
export const TASK_HIGHLIGHTS = {
  yellow: '#FFF59D',
  green: '#C8E6C9',
  blue: '#BBDEFB',
  orange: '#FFE0B2',
  red: '#FFCDD2',
  purple: '#E1BEE7',
} as const;

export type TaskHighlight = keyof typeof TASK_HIGHLIGHTS;
