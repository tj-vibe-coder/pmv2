const BUDGETS_KEY = 'projectBudgets';

export function getBudgets(): Record<number, number> {
  try {
    const raw = localStorage.getItem(BUDGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {};
}

export function getBudget(projectId: number): number {
  const data = getBudgets();
  return data[projectId] ?? 0;
}

export function setBudget(projectId: number, value: number): void {
  const data = getBudgets();
  if (value === 0) {
    const next = { ...data };
    delete next[projectId];
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(next));
  } else {
    localStorage.setItem(BUDGETS_KEY, JSON.stringify({ ...data, [projectId]: value }));
  }
}

export function saveBudgets(data: Record<number, number>): void {
  try {
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(data));
  } catch (_) {}
}
