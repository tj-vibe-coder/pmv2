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
  /** Parent (summary) task id for WBS hierarchy. Null/absent = top level.
   *  A task that is some other task's parent is a summary — its dates and
   *  progress roll up from its children and aren't edited directly. */
  parentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

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
