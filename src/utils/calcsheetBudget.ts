import type { Project as CalcsheetProject, Quotation } from '../types/Quotation';
import { computeTotals, ioctCostBasis, ioctMargin } from './calcsheet/calc';
import { awardFigures } from './calcsheet/awardFigures';
import { getBudgets } from './projectBudgetStorage';

export type OpsProjectLink = {
  id: string | number;
  project_no?: string;
  qtn_no?: string;
  calcsheet_project_id?: string;
  calcsheet_quotation_id?: string;
  calcsheet_code?: string;
  project_budget?: number;
};

export type CalcsheetBudget = {
  amount: number;
  value: number;
  margin: number;
  hasMargin: boolean;
  quotationId: string;
  calcsheetProjectId: string;
  calcsheetCode?: string;
};

function pickLatestIoct(quotations: Quotation[]): Quotation | undefined {
  const iocts = quotations.filter((q) => q.kind === 'IOCT');
  if (iocts.length === 0) return undefined;
  return [...iocts].sort((a, b) => (b.revision || '00').localeCompare(a.revision || '00'))[0];
}

export function matchCalcsheetProject(
  ops: OpsProjectLink,
  csProjects: Pick<CalcsheetProject, 'id' | 'code' | 'mainProjectId' | 'mainProjectNo'>[],
  quotations: Pick<Quotation, 'id' | 'projectId'>[] = [],
): Pick<CalcsheetProject, 'id' | 'code' | 'mainProjectId' | 'mainProjectNo'> | undefined {
  if (ops.calcsheet_quotation_id) {
    const q = quotations.find((row) => row.id === ops.calcsheet_quotation_id);
    if (q) {
      const byQuote = csProjects.find((p) => p.id === q.projectId);
      if (byQuote) return byQuote;
    }
  }
  if (ops.calcsheet_project_id) {
    const byId = csProjects.find((p) => p.id === ops.calcsheet_project_id);
    if (byId) return byId;
  }
  const opsId = String(ops.id);
  const byMainId = csProjects.find((p) => p.mainProjectId === opsId);
  if (byMainId) return byMainId;

  const candidates = [ops.project_no, ops.calcsheet_code, ops.qtn_no]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  for (const code of candidates) {
    const hit = csProjects.find((p) => p.code === code || p.mainProjectNo === code);
    if (hit) return hit;
  }
  return undefined;
}

type CsProjectLink = Pick<CalcsheetProject, 'id' | 'code' | 'mainProjectId' | 'mainProjectNo'> & Pick<Partial<CalcsheetProject>, 'awarded'>;

export function resolveCalcsheetBudget(
  ops: OpsProjectLink,
  csProjects: CsProjectLink[],
  quotations: Quotation[],
): CalcsheetBudget | null {
  const cs = matchCalcsheetProject(ops, csProjects, quotations) as CsProjectLink | undefined;
  if (!cs) return null;
  // Awarded proposal: its locked budget is the budget.
  const awarded = cs.awarded;
  const awardedQ = awarded ? quotations.find((q) => q.id === awarded.quotationId) : undefined;
  if (awarded && awardedQ) {
    const t = computeTotals(awardedQ);
    const value = t.subtotal - t.discount;
    return {
      amount: awarded.budget,
      value,
      margin: value - awarded.budget,
      hasMargin: ioctMargin(t) != null,
      quotationId: awardedQ.id,
      calcsheetProjectId: cs.id,
      calcsheetCode: cs.code,
    };
  }
  const latest = pickLatestIoct(quotations.filter((q) => q.projectId === cs.id));
  if (!latest) return null;
  const totals = computeTotals(latest);
  const amount = ioctCostBasis(totals);
  if (amount == null) return null;
  const margin = ioctMargin(totals);
  const value = totals.subtotal - totals.discount;
  return {
    amount,
    value,
    margin: margin?.value ?? 0,
    hasMargin: margin != null,
    quotationId: latest.id,
    calcsheetProjectId: cs.id,
    calcsheetCode: cs.code,
  };
}

/** Persisted project_budget wins, then a localStorage override, then live calcsheet cost. */
export function resolveBudgetsForProjects(
  projects: OpsProjectLink[],
  csProjects: Pick<CalcsheetProject, 'id' | 'code' | 'mainProjectId' | 'mainProjectNo'>[],
  quotations: Quotation[],
): Record<string, number> {
  const stored = getBudgets() as Record<string, number>;
  const out: Record<string, number> = {};
  for (const p of projects) {
    const key = String(p.id);
    const persisted = Number(p.project_budget ?? 0);
    if (persisted > 0) {
      out[key] = persisted;
      continue;
    }
    const override = Number(stored[key] ?? 0);
    if (override > 0) {
      out[key] = override;
      continue;
    }
    const fromCs = resolveCalcsheetBudget(p, csProjects, quotations);
    if (fromCs) out[key] = fromCs.amount;
  }
  return out;
}

export type CalcsheetPrice = {
  /** Contract amount the execution project should carry. */
  price: number;
  /** 'awarded' = locked at award; 'latest' = latest IOCT (else ACTI) quotation, not locked yet. */
  source: 'awarded' | 'latest';
  quotationId: string;
  quotationLabel: string;
  calcsheetProjectId: string;
  calcsheetCode?: string;
};

/** The proposal price an execution project should match — same rule as the server's sync-main. */
export function resolveCalcsheetPrice(
  ops: OpsProjectLink,
  csProjects: CsProjectLink[],
  quotations: Quotation[],
): CalcsheetPrice | null {
  const cs = matchCalcsheetProject(ops, csProjects, quotations) as CsProjectLink | undefined;
  if (!cs) return null;
  const mine = quotations.filter((q) => q.projectId === cs.id);
  const awarded = cs.awarded;
  if (awarded) {
    return {
      price: awarded.price,
      source: 'awarded',
      quotationId: awarded.quotationId,
      quotationLabel: `${awarded.kind} rev ${awarded.revision}`,
      calcsheetProjectId: cs.id,
      calcsheetCode: cs.code,
    };
  }
  const newest = (a: Quotation, b: Quotation) =>
    (parseInt(b.revision || '0', 10) || 0) - (parseInt(a.revision || '0', 10) || 0)
    || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  const q = mine.filter((x) => x.kind === 'IOCT').sort(newest)[0] || mine.filter((x) => x.kind === 'ACTI').sort(newest)[0];
  if (!q) return null;
  return {
    price: awardFigures(q).price,
    source: 'latest',
    quotationId: q.id,
    quotationLabel: `${q.kind} rev ${q.revision}`,
    calcsheetProjectId: cs.id,
    calcsheetCode: cs.code,
  };
}
