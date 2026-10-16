'use strict';
const express = require('express');
const { buildProjectSpendMonitor } = require('./projectSpendMonitor');

// GET /api/projects-monitor/spend[?projectId=] — Project Monitoring Dashboard finance link.
function createProjectSpendMonitorRouter({ db, requireActiveUser }) {
  const router = express.Router();
  router.get('/spend', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['superadmin', 'admin', 'user'].includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const monitor = await buildProjectSpendMonitor(db, user);
      // ?projectId= → just that project's spend (Calcsheet proposal page budget card).
      const projectId = String(req.query.projectId || '').trim();
      if (projectId) {
        return res.json({ success: true, projectId, spend: monitor.byProject[projectId] || null });
      }
      res.json({ success: true, ...monitor });
    } catch (error) {
      console.error('Project spend monitor failed:', error);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });
  return router;
}

module.exports = { createProjectSpendMonitorRouter };
