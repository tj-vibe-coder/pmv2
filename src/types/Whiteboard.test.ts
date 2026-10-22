import {
  defaultRecurrenceDay, sortWhiteboardPending, whiteboardDueState, whiteboardFirstDueDate, whiteboardLinkHref,
  whiteboardMonthDayLabel, whiteboardRecurrenceLabel, whiteboardToday,
} from './Whiteboard';

const TODAY = '2026-10-22';

it('classifies due dates as overdue, today, soon (within 3 days) or later', () => {
  expect(whiteboardDueState(undefined, TODAY)).toBeNull();
  expect(whiteboardDueState('2026-10-21', TODAY)).toBe('overdue');
  expect(whiteboardDueState('2026-10-22', TODAY)).toBe('today');
  expect(whiteboardDueState('2026-10-25', TODAY)).toBe('soon');
  expect(whiteboardDueState('2026-10-26', TODAY)).toBe('later');
  // month boundary
  expect(whiteboardDueState('2026-11-01', '2026-10-30')).toBe('soon');
});

it('whiteboardToday formats the local calendar day', () => {
  expect(whiteboardToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});

it('sorts overdue first, then due today / soon by date, then the rest oldest-first', () => {
  const item = (id: string, dueDate: string | undefined, createdAt: string) => ({ id, dueDate, createdAt });
  const sorted = sortWhiteboardPending([
    item('plain-new', undefined, '2026-10-10'),
    item('later', '2026-12-01', '2026-10-01'),
    item('soon', '2026-10-24', '2026-10-02'),
    item('today', '2026-10-22', '2026-10-03'),
    item('overdue-b', '2026-10-20', '2026-10-04'),
    item('plain-old', undefined, '2026-09-01'),
    item('overdue-a', '2026-10-01', '2026-10-05'),
  ], TODAY).map((i) => i.id);
  expect(sorted).toEqual(['overdue-a', 'overdue-b', 'today', 'soon', 'plain-old', 'later', 'plain-new']);
});

it('does not reorder the original array', () => {
  const input = [{ dueDate: undefined, createdAt: '2026-10-02' }, { dueDate: '2026-10-01', createdAt: '2026-10-01' }];
  sortWhiteboardPending(input, TODAY);
  expect(input[0].createdAt).toBe('2026-10-02');
});

it('builds the page address for every link type', () => {
  expect(whiteboardLinkHref({ type: 'project', id: 'p 1', label: '' })).toBe('/projects/p%201');
  expect(whiteboardLinkHref({ type: 'calcsheet', id: 'c1', label: '' })).toBe('/sales/calcsheet/projects/c1');
  expect(whiteboardLinkHref({ type: 'invoice', id: 'i1', label: '' })).toBe('/finance/collections?tab=receivables&invoice=i1');
  const liq = whiteboardLinkHref({ type: 'liquidation', id: 'l1', label: '' }, '/dashboard');
  expect(liq).toContain('/finance/expense-monitoring/liquidation-form?');
  expect(liq).toContain('focus=');
  expect(liq).toContain('from=%2Fdashboard');
});

it('labels repeats with their chosen day', () => {
  expect(whiteboardRecurrenceLabel('daily')).toBe('Daily');
  expect(whiteboardRecurrenceLabel('weekly', 1)).toBe('Weekly · Mon');
  expect(whiteboardRecurrenceLabel('weekly', 0)).toBe('Weekly · Sun');
  expect(whiteboardRecurrenceLabel('monthly', 15)).toBe('Monthly · 15th');
  expect(whiteboardRecurrenceLabel('monthly', 0)).toBe('Monthly · last day');
  expect(whiteboardRecurrenceLabel('monthly', 1)).toBe('Monthly · 1st');
  expect(whiteboardRecurrenceLabel('monthly', 22)).toBe('Monthly · 22nd');
  expect(whiteboardRecurrenceLabel('monthly', 23)).toBe('Monthly · 23rd');
  expect(whiteboardRecurrenceLabel('monthly', 11)).toBe('Monthly · 11th');
  expect(whiteboardRecurrenceLabel('yearly')).toBe('Yearly');
  expect(whiteboardMonthDayLabel(0)).toBe('Last day of the month');
});

it('picking a frequency pre-selects the due date\'s weekday / day of the month', () => {
  expect(defaultRecurrenceDay('weekly', '2026-10-26')).toBe(1);   // a Monday
  expect(defaultRecurrenceDay('monthly', '2026-10-15')).toBe(15);
  expect(defaultRecurrenceDay('daily', '2026-10-15')).toBeNull();
  expect(defaultRecurrenceDay('yearly', '2026-10-15')).toBeNull();
  expect(defaultRecurrenceDay('', '2026-10-15')).toBeNull();
});

it('first due date of a repeat with no due date matches the server rules', () => {
  // 2026-10-22 is a Thursday
  expect(whiteboardFirstDueDate('weekly', 1, '2026-10-22')).toBe('2026-10-26');
  expect(whiteboardFirstDueDate('weekly', 4, '2026-10-22')).toBe('2026-10-22');
  expect(whiteboardFirstDueDate('monthly', 25, '2026-10-22')).toBe('2026-10-25');
  expect(whiteboardFirstDueDate('monthly', 15, '2026-10-22')).toBe('2026-11-15');
  expect(whiteboardFirstDueDate('monthly', 0, '2026-10-22')).toBe('2026-10-31');
  expect(whiteboardFirstDueDate('daily', null, '2026-10-22')).toBe('2026-10-22');
});
