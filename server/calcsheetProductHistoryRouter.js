const express = require('express');
const {
  flattenProductHistory,
  searchProductHistory,
} = require('./calcsheetProductHistory');
const { calculateSuggestion } = require('./calcsheetContingency');

const SUGGESTION_CLIENT_ERRORS = new Set([
  'Selected historical price was not found',
  'Valid analysis, source, and expected purchase dates are required',
  'Expected purchase date cannot be before the quotation date',
]);

function docsWithIds(snapshot) {
  return snapshot.docs.map((doc) => {
    const { id: _stored, ...data } = doc.data();
    return { ...data, id: doc.id };
  });
}

async function loadObservations(db) {
  const [projectSnap, quotationSnap, clientSnap] = await Promise.all([
    db.collection('calcsheet_projects').get(),
    db.collection('calcsheet_quotations').get(),
    db.collection('clients').get(),
  ]);
  return flattenProductHistory({
    projects: docsWithIds(projectSnap),
    quotations: docsWithIds(quotationSnap),
    clients: docsWithIds(clientSnap),
  });
}

function createProductHistoryRouter({ db, requireActiveUser }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const user = await requireActiveUser(req, res);
      if (!user) return;
      const observations = await loadObservations(db);
      res.json({
        success: true,
        ...searchProductHistory(observations, {
          search: req.query.search,
          status: req.query.status,
          sort: req.query.sort,
          limit: req.query.limit,
        }),
      });
    } catch (error) {
      console.error('[calcsheet] product history search failed:', error);
      res.status(500).json({ error: 'Failed to load quotation history' });
    }
  });

  router.post('/suggest', async (req, res) => {
    let observations;
    try {
      const user = await requireActiveUser(req, res);
      if (!user) return;
      observations = await loadObservations(db);
    } catch (error) {
      console.error('[calcsheet] product history suggestion failed:', error);
      res.status(500).json({ error: 'Failed to calculate quotation history suggestion' });
      return;
    }

    try {
      res.json({
        success: true,
        ...calculateSuggestion({
          observations,
          selectedObservationId: String(req.body?.selectedObservationId || ''),
          confirmedCandidateObservationIds: Array.isArray(
            req.body?.confirmedCandidateObservationIds,
          )
            ? req.body.confirmedCandidateObservationIds.map(String)
            : [],
          analysisDate: String(req.body?.analysisDate || ''),
          expectedPurchaseDate: String(req.body?.expectedPurchaseDate || ''),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Suggestion failed';
      if (SUGGESTION_CLIENT_ERRORS.has(message)) {
        res.status(400).json({ error: message });
        return;
      }
      console.error('[calcsheet] product history suggestion failed:', error);
      res.status(500).json({ error: 'Failed to calculate quotation history suggestion' });
    }
  });

  return router;
}

module.exports = { createProductHistoryRouter, loadObservations };
