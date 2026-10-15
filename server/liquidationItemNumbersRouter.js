'use strict';
const express = require('express');
const { physicalNumbering, mappingHash } = require('./liquidationItemNumbers');
const { receiptReviewHash } = require('./liquidationReceiptReview');
function createLiquidationItemNumbersRouter({ db, requireActiveUser }) {
  const router = express.Router();
  router.post('/:id/item-numbering/initialize', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res); if (!user) return;
      if (user.scannerScope || !['superadmin', 'admin', 'user'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
      const { expectedContentHash, expectedItemNumbers } = req.body || {};
      if (typeof expectedContentHash !== 'string' || !expectedItemNumbers || typeof expectedItemNumbers !== 'object' || Array.isArray(expectedItemNumbers)) return res.status(400).json({ error: 'Expected saved content hash and full row-ID/item-number mapping required' });
      const result = await db.runTransaction(async tx => {
        const ref = db.collection('liquidations').doc(req.params.id); const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw Object.assign(new Error('Liquidation not found'), { status: 404 });
        const liq = snapshot.data();
        if (!['admin', 'superadmin'].includes(user.role) && liq.user_id !== user.id) throw Object.assign(new Error('Forbidden'), { status: 403 });
        if (liq.pending_revision) throw Object.assign(new Error('Resolve pending revision before freezing physical item numbers'), { status: 409 });
        const numbering = physicalNumbering(liq);
        if (receiptReviewHash(liq) !== expectedContentHash || mappingHash(numbering.numbers) !== mappingHash(expectedItemNumbers)) throw Object.assign(new Error('Saved content or physical order changed; reload and verify the original printed items'), { status: 409 });
        const alreadyInitialized = !!liq.physical_item_numbering;
        if (!alreadyInitialized) {
          numbering.initializedBy = user.id; numbering.initializedAt = new Date().toISOString();
          tx.update(ref, { physical_item_numbering: numbering });
          tx.set(ref.collection('item_numbering_history').doc(), { actor: user.id, at: numbering.initializedAt, basis: numbering.basis, mappingHash: mappingHash(numbering.numbers) });
        }
        return { success: true, alreadyInitialized, physical_item_numbering: numbering };
      });
      res.json(result);
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Physical numbering initialization failed' }); }
  });
  return router;
}
module.exports = { createLiquidationItemNumbersRouter };
