/**
 * Payroll service layer — wraps Express API endpoints.
 * Mirrors the pattern used in dataService.ts.
 */

import { API_BASE } from '../config/api';
import { Employee, PayrollRun, DTREntry, Payslip } from '../types/Payroll';

const BASE = `${API_BASE}/api/payroll`;

function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('netpacific_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ─── Employees ───────────────────────────────────────────────────────────────

export async function getEmployees(): Promise<Employee[]> {
  const res = await fetch(`${BASE}/employees`, { headers: getAuthHeader() });
  return handleResponse<Employee[]>(res);
}

export async function createEmployee(data: Omit<Employee, 'id' | 'createdAt'>): Promise<Employee> {
  const res = await fetch(`${BASE}/employees`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(data),
  });
  return handleResponse<Employee>(res);
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<void> {
  const res = await fetch(`${BASE}/employees/${id}`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: JSON.stringify(data),
  });
  await handleResponse<void>(res);
}

export async function deactivateEmployee(id: string): Promise<void> {
  const res = await fetch(`${BASE}/employees/${id}`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: JSON.stringify({ isActive: false }),
  });
  await handleResponse<void>(res);
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const res = await fetch(`${BASE}/runs`, { headers: getAuthHeader() });
  return handleResponse<PayrollRun[]>(res);
}

export async function createPayrollRun(data: Omit<PayrollRun, 'id' | 'createdAt'>): Promise<PayrollRun> {
  const res = await fetch(`${BASE}/runs`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(data),
  });
  return handleResponse<PayrollRun>(res);
}

export async function approvePayrollRun(runId: string): Promise<void> {
  const res = await fetch(`${BASE}/runs/${runId}/approve`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  await handleResponse<void>(res);
}

export async function markRunPaid(runId: string): Promise<void> {
  const res = await fetch(`${BASE}/runs/${runId}/pay`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  await handleResponse<void>(res);
}

// ─── DTR Entries ──────────────────────────────────────────────────────────────

export async function saveDTREntries(runId: string, entries: DTREntry[]): Promise<void> {
  const res = await fetch(`${BASE}/runs/${runId}/dtr`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ entries }),
  });
  await handleResponse<void>(res);
}

export async function getDTREntries(runId: string): Promise<DTREntry[]> {
  const res = await fetch(`${BASE}/runs/${runId}/dtr`, { headers: getAuthHeader() });
  return handleResponse<DTREntry[]>(res);
}

// ─── Payslips ─────────────────────────────────────────────────────────────────

export async function savePayslips(runId: string, payslips: Payslip[]): Promise<void> {
  const res = await fetch(`${BASE}/runs/${runId}/payslips`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ payslips }),
  });
  await handleResponse<void>(res);
}

export async function getPayslipsForRun(runId: string): Promise<Payslip[]> {
  const res = await fetch(`${BASE}/runs/${runId}/payslips`, { headers: getAuthHeader() });
  return handleResponse<Payslip[]>(res);
}

// ─── Contribution Settings ────────────────────────────────────────────────

export interface ContributionRates {
  philhealthRate: number;       // e.g. 0.05 (5%)
  philhealthMin: number;        // e.g. 500
  philhealthMax: number;        // e.g. 5000
  pagibigCap: number;           // e.g. 100 (max ₱100/month)
  sssEmployeeRate: number;      // e.g. 0.045
  sssEmployerRate: number;      // e.g. 0.085
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_RATES: ContributionRates = {
  philhealthRate: 0.05,
  philhealthMin: 500,
  philhealthMax: 5000,
  pagibigCap: 100,
  sssEmployeeRate: 0.045,
  sssEmployerRate: 0.085,
};

export async function getContributionRates(): Promise<ContributionRates> {
  try {
    const res = await fetch(`${BASE}/settings`, { headers: getAuthHeader() });
    const data = await handleResponse<Partial<ContributionRates>>(res);
    return { ...DEFAULT_RATES, ...data };
  } catch {
    return DEFAULT_RATES;
  }
}

export async function saveContributionRates(rates: ContributionRates): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: JSON.stringify(rates),
  });
  await handleResponse<void>(res);
}

// ─── Holidays ─────────────────────────────────────────────────────────────

export interface StoredHoliday {
  id?: string;
  date: string;       // "YYYY-MM-DD"
  name: string;
  type: 'REGULAR' | 'SPECIAL';
  year: number;
}

export async function getHolidays(year: number): Promise<StoredHoliday[]> {
  const res = await fetch(`${BASE}/holidays?year=${year}`, { headers: getAuthHeader() });
  return handleResponse<StoredHoliday[]>(res);
}

export async function addHoliday(holiday: Omit<StoredHoliday, 'id'>): Promise<StoredHoliday> {
  const res = await fetch(`${BASE}/holidays`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(holiday),
  });
  return handleResponse<StoredHoliday>(res);
}

export async function updateHoliday(id: string, data: Partial<StoredHoliday>): Promise<void> {
  const res = await fetch(`${BASE}/holidays/${id}`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: JSON.stringify(data),
  });
  await handleResponse<void>(res);
}

export async function deleteHoliday(id: string): Promise<void> {
  const res = await fetch(`${BASE}/holidays/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  await handleResponse<void>(res);
}

export async function bulkSaveHolidays(holidays: Omit<StoredHoliday, 'id'>[], year: number): Promise<void> {
  const res = await fetch(`${BASE}/holidays/bulk`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ holidays, year }),
  });
  await handleResponse<void>(res);
}
