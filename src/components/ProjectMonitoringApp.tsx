import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import Dashboard from './Dashboard';
import ProjectDetails from './ProjectDetails';
import { Project } from '../types/Project';
import { useQuotationStore } from '../store/quotationStore';

const ProjectMonitoringApp: React.FC = () => {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);
  // Proposal (Calcsheet) data feeds budgets, the awarded price check and spend vs
  // budget here. It was only loaded on Sales routes, so a fresh load of the
  // dashboard or a project page showed no proposal link. init() is idempotent.
  const initCalcsheet = useQuotationStore((s) => s.init);
  useEffect(() => {
    void initCalcsheet();
  }, [initCalcsheet]);

  const handleProjectSelect = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const handleBackToDashboard = () => {
    setSelectedProject(null);
    sessionStorage.removeItem('selectedProjectId');
    if (routeProjectId) navigate('/dashboard');
  };

  const handleProjectUpdated = (updated: Project) => {
    setSelectedProject(updated);
    setListRefreshTrigger((t) => t + 1);
  };

  useEffect(() => {
    const bridgedId = sessionStorage.getItem('selectedProjectId');
    if (bridgedId && !routeProjectId) {
      sessionStorage.removeItem('selectedProjectId');
    }
    const id = routeProjectId || bridgedId;
    if (!id) {
      setSelectedProject(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        if (cancelled) return;
        if (p && p.id) {
          setSelectedProject(p);
        } else if (routeProjectId) {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled && routeProjectId) navigate('/dashboard', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [routeProjectId, navigate]);

  const waitingForRouteProject = Boolean(routeProjectId) && !selectedProject;

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {selectedProject ? (
        <ProjectDetails
          project={selectedProject}
          onBack={handleBackToDashboard}
          onProjectUpdated={handleProjectUpdated}
        />
      ) : waitingForRouteProject ? null : (
        <Dashboard onProjectSelect={handleProjectSelect} refreshTrigger={listRefreshTrigger} />
      )}
    </Box>
  );
};

export default ProjectMonitoringApp;
