import React, { useState } from 'react';
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
  };

  const handleProjectUpdated = (updated: Project) => {
    setSelectedProject(updated);
    setListRefreshTrigger((t) => t + 1);
  };

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