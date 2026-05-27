import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Dashboard from './Dashboard';
import ProjectDetails from './ProjectDetails';
import { Project } from '../types/Project';

const ProjectMonitoringApp: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
  };

  const handleBackToDashboard = () => {
    setSelectedProject(null);
    sessionStorage.removeItem('selectedProjectId');
  };

  const handleProjectUpdated = (updated: Project) => {
    setSelectedProject(updated);
    setListRefreshTrigger((t) => t + 1);
  };

  // When navigated from Collections (via sessionStorage bridge), auto-open project detail
  useEffect(() => {
    const id = sessionStorage.getItem('selectedProjectId');
    if (id) {
      sessionStorage.removeItem('selectedProjectId');
      fetch(`/api/projects/${id}`)
        .then(r => r.json())
        .then((p: Project) => {
          if (p && p.id) setSelectedProject(p);
        })
        .catch(() => {});
    }
  }, []);

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {selectedProject ? (
        <ProjectDetails
          project={selectedProject}
          onBack={handleBackToDashboard}
          onProjectUpdated={handleProjectUpdated}
        />
      ) : (
        <Dashboard onProjectSelect={handleProjectSelect} refreshTrigger={listRefreshTrigger} />
      )}
    </Box>
  );
};

export default ProjectMonitoringApp;