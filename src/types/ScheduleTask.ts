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
