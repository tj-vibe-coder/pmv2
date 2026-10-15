'use strict';
const express = require('express');
const { searchLiquidationItems } = require('./liquidationItemSearch');

// GET /api/liquidations/item-search?amount=&q=&from=&to=
// Admins search every liquidation; everyone else only their own.
function createLiquidationItemSearchRouter({ db, requireActiveUser }) {
  const router = express.Router();
  router.get('/item-search', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['superadmin', 'admin', 'user'].includes(user.role)) return res.status(403).json({ success: false, error: 'Forbidden' });
      res.json({ success: true, ...(await searchLiquidationItems(db, user, req.query)) });
    } catch (error) {
      if (!error.status) console.error('Liquidation item search failed:', error);
      res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Search failed' });
    }
  });
  return router;
}

module.exports = { createLiquidationItemSearchRouter };
