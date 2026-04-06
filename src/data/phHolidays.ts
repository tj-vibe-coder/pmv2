export type HolidayType = 'REGULAR' | 'SPECIAL';

export interface PHHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
  type: HolidayType;
}

export const PH_HOLIDAYS_2026: PHHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day", type: 'REGULAR' },
  { date: '2026-01-28', name: 'Chinese New Year', type: 'SPECIAL' },
  { date: '2026-02-25', name: 'EDSA People Power Revolution', type: 'SPECIAL' },
  { date: '2026-04-02', name: 'Maundy Thursday', type: 'REGULAR' },
  { date: '2026-04-03', name: 'Good Friday', type: 'REGULAR' },
  { date: '2026-04-04', name: 'Black Saturday', type: 'SPECIAL' },
  { date: '2026-04-09', name: 'Araw ng Kagitingan', type: 'REGULAR' },
  { date: '2026-05-01', name: 'Labor Day', type: 'REGULAR' },
  { date: '2026-06-12', name: 'Independence Day', type: 'REGULAR' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'SPECIAL' },
  { date: '2026-08-31', name: 'National Heroes Day', type: 'REGULAR' },
  { date: '2026-11-01', name: 'All Saints Day', type: 'SPECIAL' },
  { date: '2026-11-02', name: 'All Souls Day', type: 'SPECIAL' },
  { date: '2026-11-30', name: 'Bonifacio Day', type: 'REGULAR' },
  { date: '2026-12-08', name: 'Immaculate Conception', type: 'SPECIAL' },
  { date: '2026-12-24', name: 'Christmas Eve', type: 'SPECIAL' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'REGULAR' },
  { date: '2026-12-30', name: 'Rizal Day', type: 'REGULAR' },
  { date: '2026-12-31', name: "New Year's Eve", type: 'SPECIAL' },
];

export function isHoliday(dateStr: string): PHHoliday | undefined {
  return PH_HOLIDAYS_2026.find((h) => h.date === dateStr);
}

export function isRegularHoliday(dateStr: string): boolean {
  const h = isHoliday(dateStr);
  return h?.type === 'REGULAR';
}

export function isSpecialHoliday(dateStr: string): boolean {
  const h = isHoliday(dateStr);
  return h?.type === 'SPECIAL';
}
