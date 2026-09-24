import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Typography, CircularProgress } from '@mui/material';
import { API_BASE } from '../config/api';
import { WorkScheduleGantt } from './calcsheet/CalcsheetProjectSchedule';
import type { Project } from '../types/Project';

// Work Schedule for a monitoring (awarded) project. Reuses the shared Gantt;
// schedule tasks are keyed by the monitoring project's id (carried over from
// the proposal at award). No calcsheet quotations here, so no import button.
export default function ProjectSchedulePage() {
  const { id = '' } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Project not found. <Link to="/dashboard">Back to dashboard</Link></Typography>
      </Box>
    );
  }

  return (
    <WorkScheduleGantt
      projectId={String(project.id)}
      code={project.project_no || ''}
      name={project.project_name || ''}
      backHref="/dashboard"
    />
  );
}
