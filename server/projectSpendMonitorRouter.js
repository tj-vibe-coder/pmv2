'use strict';
const express = require('express');
const { buildProjectSpendMonitor } = require('./projectSpendMonitor');

// GET /api/projects-monitor/spend — Project Monitoring Dashboard finance link.
function createProjectSpendMonitorRouter({ db, requireActiveUser }) {
  const router = express.Router();
  router.get('/spend', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['superadmin', 'admin', 'user'].includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      res.json({ success: true, ...(await buildProjectSpendMonitor(db, user)) });
    } catch (error) {
      console.error('Project spend monitor failed:', error);
      res.status(500).json({ success: false, error: 'Database error' });
    }
  });
  return router;
}

module.exports = { createProjectSpendMonitorRouter };
