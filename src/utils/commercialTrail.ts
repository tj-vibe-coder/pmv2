import { computeDueDate } from '../types/Invoice';
import type { CommercialTrail, Project } from '../types/Project';

export function isActiInvolved(
  project: Pick<Project, 'with_acti' | 'partner_name' | 'partner_id'> | null | undefined,
): boolean {
  if (!project) return false;
  if (project.with_acti) return true;
  const name = String(project.partner_name || '');
  return /advance controle|\bacti\b/i.test(name);
}

/** Infer who received the customer PO. ACTI jobs → ACTI; direct jobs → IOCT. */
export function customerPoIssuedTo(
  project: Pick<Project, 'with_acti' | 'partner_name' | 'partner_id'> | null | undefined,
): 'acti' | 'ioct' {
  return isActiInvolved(project) ? 'acti' : 'ioct';
}

export function stripCommercialTrail(trail: CommercialTrail | undefined | null): CommercialTrail | undefined {
  if (!trail) return undefined;
  const out: CommercialTrail = {};
  (Object.keys(trail) as (keyof CommercialTrail)[]).forEach((key) => {
    const value = trail[key];
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    (out as Record<string, unknown>)[key] = value;
  });
  return Object.keys(out).length ? out : undefined;
}

export function applyBackToBackExpectedDates(trail: CommercialTrail): CommercialTrail {
  const next: CommercialTrail = { ...trail };
  if (
    !next.partner_si_expected_collection_date
    && next.partner_si_date
    && next.partner_si_terms_days != null
    && Number.isFinite(Number(next.partner_si_terms_days))
  ) {
    next.partner_si_expected_collection_date = computeDueDate(
      next.partner_si_date,
      Number(next.partner_si_terms_days),
    );
  }
  const expected = next.partner_si_expected_collection_date;
  if (expected) {
    if (!next.ioct_expected_invoice_date) next.ioct_expected_invoice_date = expected;
    if (!next.ioct_expected_collection_date) next.ioct_expected_collection_date = expected;
  }
  return next;
}

export function actiToIoctPoLabel(trail: CommercialTrail | undefined | null): string {
  const number = trail?.acti_to_ioct_po_number?.trim();
  if (number) return number;
  if (trail?.acti_to_ioct_po_status === 'received') return '—';
  return 'Pending';
}

/** Compact list lines for the dashboard ACTI trail column. */
export function actiTrailSummary(trail: CommercialTrail | undefined | null): string[] {
  if (!trail) return [];
  const lines: string[] = [];
  if (trail.coc_approved_date) lines.push(`COC ${trail.coc_approved_date}`);
  else if (trail.coc_served_date) lines.push(`COC served ${trail.coc_served_date}`);
  if (trail.partner_si_no) {
    lines.push(trail.partner_si_date ? `${trail.partner_si_no} · ${trail.partner_si_date}` : trail.partner_si_no);
  }
  const expect = trail.ioct_expected_collection_date
    || trail.ioct_expected_invoice_date
    || trail.partner_si_expected_collection_date;
  if (expect) lines.push(`IOCT expect ${expect}`);
  return lines;
}

export type ActiExpectedStage = 'pending_po' | 'po_uninvoiced';
export type ActiExpectedTiming = 'upcoming' | 'due_soon' | 'past_expected' | 'date_missing';
export type ActiExpectedBucket = 'pending_ar' | 'ongoing';

export interface ActiExpectedRow {
  project: Project;
  stage: ActiExpectedStage;
  timing: ActiExpectedTiming;
  bucket: ActiExpectedBucket;
  expectedAmount: number;
  expectedCollectionDate?: string;
}

/** Completed/closed, or 100% site progress that is not still "Not Started". */
export function isActiWorkComplete(project: Pick<Project, 'project_status' | 'actual_site_progress_percent'>): boolean {
  const status = (project.project_status || '').toUpperCase();
  if (['COMPLETED', 'CLOSED'].includes(status)) return true;
  if (status === 'NOT STARTED') return false;
  return (project.actual_site_progress_percent ?? 0) >= 100;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function actiExpectedCollectionDate(trail: CommercialTrail | undefined | null): string | undefined {
  const date = trail?.ioct_expected_collection_date
    || trail?.ioct_expected_invoice_date
    || trail?.partner_si_expected_collection_date;
  return date || undefined;
}

export function hasActiToIoctPo(trail: CommercialTrail | undefined | null): boolean {
  if (trail?.acti_to_ioct_po_number?.trim()) return true;
  return trail?.acti_to_ioct_po_status === 'received';
}

export function actiExpectedTiming(expectedDate: string | undefined, today: string = isoToday()): ActiExpectedTiming {
  if (!expectedDate) return 'date_missing';
  if (expectedDate < today) return 'past_expected';
  if (expectedDate <= addDaysIso(today, 7)) return 'due_soon';
  return 'upcoming';
}

export function actiExpectedStageLabel(stage: ActiExpectedStage): string {
  return stage === 'pending_po' ? 'Pending PO' : 'PO in · Uninvoiced';
}

export function actiExpectedTimingLabel(timing: ActiExpectedTiming): string {
  switch (timing) {
    case 'past_expected': return 'Past expected';
    case 'due_soon': return 'Due this week';
    case 'upcoming': return 'Upcoming';
    default: return 'Date missing';
  }
}

/** ACTI-fronted jobs with remaining uninvoiced contract. Amount is expected remainder, not AR. */
export function buildActiExpectedQueue(
  projects: Project[],
  invoices: Array<{ project_id?: string; amount?: number }>,
  today: string = isoToday(),
): ActiExpectedRow[] {
  const billedByProject = new Map<string, number>();
  invoices.forEach((inv) => {
    const id = String(inv.project_id || '');
    if (!id) return;
    billedByProject.set(id, (billedByProject.get(id) || 0) + (Number(inv.amount) || 0));
  });
  return projects
    .filter((project) => isActiInvolved(project))
    .map((project) => {
      const trail = project.commercial_trail;
      const contract = Number(project.updated_contract_amount || project.contract_amount || 0) || 0;
      const billed = billedByProject.get(String(project.id)) || 0;
      const remaining = Math.max(0, Math.round((contract - billed) * 100) / 100);
      const expectedCollectionDate = actiExpectedCollectionDate(trail);
      return {
        project,
        stage: (hasActiToIoctPo(trail) ? 'po_uninvoiced' : 'pending_po') as ActiExpectedStage,
        timing: actiExpectedTiming(expectedCollectionDate, today),
        bucket: (isActiWorkComplete(project) ? 'pending_ar' : 'ongoing') as ActiExpectedBucket,
        expectedAmount: remaining,
        expectedCollectionDate,
      };
    })
    .filter((row) => row.expectedAmount > 0.5)
    .sort((a, b) => {
      const da = a.expectedCollectionDate || '9999-12-31';
      const db = b.expectedCollectionDate || '9999-12-31';
      return da.localeCompare(db);
    });
}

export function splitActiExpectedQueue(rows: ActiExpectedRow[]): {
  pendingAr: ActiExpectedRow[];
  ongoing: ActiExpectedRow[];
} {
  return {
    pendingAr: rows.filter((r) => r.bucket === 'pending_ar'),
    ongoing: rows.filter((r) => r.bucket === 'ongoing'),
  };
}
