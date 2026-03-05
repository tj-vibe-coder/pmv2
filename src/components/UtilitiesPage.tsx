import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';

/**
 * Utilities section: hosts EHS and ID Generator as nested routes.
 * /utilities redirects to /utilities/ehs.
 */
const UtilitiesPage: React.FC = () => {
  const location = useLocation();
  const isIndex = location.pathname === '/utilities' || location.pathname === '/utilities/';
  if (isIndex) {
    return <Navigate to="/utilities/ehs" replace />;
  }
  return <Outlet />;
};

export default UtilitiesPage;
