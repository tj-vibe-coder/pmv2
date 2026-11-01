/**
 * Work Schedule attachments for the Progress Report: the Gantt chart and/or
 * S-Curve exactly as the Work Schedule's "Export Gantt" produces them (same
 * generator, same remembered export settings), appended to the report PDF.
 */
import { PDFDocument } from 'pdf-lib';
import type { ScheduleTask } from '../../types/ScheduleTask';
import { flattenTree, leafTasks, rollUp } from '../calcsheet/scheduleTree';
import type { SCurveSnapshot } from '../calcsheet/scheduleSCurve';
import { formatLocalDate } from '../calcsheet/scheduleDates';
import { criticalPath } from '../calcsheet/scheduleAuto';
import { baselineFromVersion, type ScheduleBaseline } from '../calcsheet/scheduleBaseline';
import { renderSchedulePdf, type ScheduleExportData } from '../calcsheet/schedulePdfExport';
import { loadSettings as loadScheduleExportSettings } from '../../components/calcsheet/ScheduleExportDialog';

interface ScheduleVersionRef { id: string; savedAt: string; label?: string | null; isBaseline?: boolean }

async function getJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem('netpacific_token');
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Work Schedule request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** The project's Work Schedule tasks (the same store the Gantt page edits). */
export async function fetchScheduleTasks(projectId: string): Promise<ScheduleTask[]> {
  const r = await getJson<{ tasks?: ScheduleTask[] }>(`/api/schedule-tasks?projectId=${encodeURIComponent(projectId)}`);
  return r.tasks || [];
}

/** Saved versions as S-Curve status snapshots, plus the baseline version (if any). */
async function loadVersions(projectId: string): Promise<{ snapshots: SCurveSnapshot[]; baseline: ScheduleBaseline | null }> {
  const versions = await getJson<{ versions?: ScheduleVersionRef[] }>(`/api/schedule-versions?projectId=${encodeURIComponent(projectId)}`)
    .then((r) => r.versions || [])
    .catch(() => [] as ScheduleVersionRef[]);
  let baseline: ScheduleBaseline | null = null;
  const snapshots = await Promise.all(versions.map(async (v) => {
    try {
      const d = await getJson<{ version?: ScheduleVersionRef & { tasks?: ScheduleTask[] } }>(`/api/schedule-versions/${encodeURIComponent(v.id)}`);
      const tasks = d.version?.tasks || [];
      if (v.isBaseline && d.version) baseline = baselineFromVersion(d.version);
      return { date: formatLocalDate(new Date(v.savedAt)), tasks };
    } catch {
      return null;
    }
  }));
  return { snapshots: snapshots.filter((s): s is SCurveSnapshot => !!s && s.tasks.length > 0), baseline };
}

/**
 * Render the Work Schedule's own Gantt export for the project. `gantt` keeps the
 * Gantt pages, `sCurve` keeps the S-Curve page; null when the schedule is empty.
 */
export async function renderScheduleAttachment(
  projectId: string,
  project: { code?: string; name?: string },
  opts: { gantt: boolean; sCurve: boolean },
): Promise<Uint8Array | null> {
  if (!opts.gantt && !opts.sCurve) return null;
  const tasks = await fetchScheduleTasks(projectId);
  if (tasks.length === 0) return null;
  let workingDays = true;
  try { workingDays = localStorage.getItem(`gantt-wd-${projectId}`) !== '0'; } catch { /* default: working days */ }
  const { snapshots, baseline } = await loadVersions(projectId);
  const rows = flattenTree(rollUp(tasks), new Set());
  const data: ScheduleExportData = { workingDays, criticalIds: criticalPath(leafTasks(tasks), workingDays), snapshots, baseline };
  const settings = { ...loadScheduleExportSettings(projectId, project), includeSCurve: opts.sCurve };

  const bytes = new Uint8Array(await (await renderSchedulePdf(project, rows, data, settings)).arrayBuffer());
  if (opts.gantt) return bytes;
  // S-Curve only: it is the page after the Gantt pages.
  const ganttOnly = await PDFDocument.load(await (await renderSchedulePdf(project, rows, data, { ...settings, includeSCurve: false })).arrayBuffer());
  const full = await PDFDocument.load(bytes);
  const keep = full.getPageIndices().slice(ganttOnly.getPageCount());
  if (keep.length === 0) return null;
  const out = await PDFDocument.create();
  (await out.copyPages(full, keep)).forEach((p) => out.addPage(p));
  return out.save();
}

/** Append whole PDFs (in order) after the pages of `base`. */
export async function appendPdfs(base: ArrayBuffer | Uint8Array, extras: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.load(base);
  for (const extra of extras) {
    const src = await PDFDocument.load(extra);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return out.save();
}
