'use strict';

const express = require('express');
const { formatSoaCode, parseSoaCode, getNextSoaSequence } = require('./soaSequence');
const { uploadFileToFolder } = require('../backups/onedriveBackup');

const SOA_COLLECTION = 'statements_of_account';

function computeTotals(items) {
  let subtotalWithPo = 0;
  let subtotalPendingPo = 0;
  if (Array.isArray(items)) {
    for (const item of items) {
      const amt = Number(item.amount) || 0;
      if (item.hasPo) {
        subtotalWithPo += amt;
      } else {
        subtotalPendingPo += amt;
      }
    }
  }
  return {
    subtotalWithPo: Math.round(subtotalWithPo * 100) / 100,
    subtotalPendingPo: Math.round(subtotalPendingPo * 100) / 100,
    totalOutstanding: Math.round((subtotalWithPo + subtotalPendingPo) * 100) / 100,
  };
}

function isActiFrontedProject(data) {
  if (!data) return false;
  if (data.with_acti) return true;
  const name = String(data.partner_name || '');
  return /advance controle|\bacti\b/i.test(name);
}

function createSoaRouter(opts) {
  const {
    db,
    getCurrentUser,
    getGraphAppToken,
    resolveCorporateDriveId,
    ensureFolderByPath,
  } = opts;
  const router = express.Router();

  // Middleware: Active user authentication
  async function requireAuth(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      req.user = user;
      next();
    } catch (err) {
      console.error('[SOA Router] Auth error:', err);
      res.status(500).json({ success: false, error: 'Authentication failed' });
    }
  }

  // GET /api/soa/by-project/:projectId - Find all SOAs containing line items for a project
  router.get('/by-project/:projectId', requireAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      const snapshot = await db.collection(SOA_COLLECTION).get();
      const matches = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const matchingItems = items.filter((it) => String(it.projectId) === String(projectId));
        if (matchingItems.length > 0) {
          matches.push({
            id: doc.id,
            soaNo: data.soaNo,
            date: data.date,
            status: data.status,
            recipientName: data.recipientName,
            matchingItems,
          });
        }
      });

      res.json({ success: true, count: matches.length, data: matches });
    } catch (err) {
      console.error('[SOA Router] GET /by-project error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch project SOAs' });
    }
  });

  // GET /api/soa - List all Statements of Account
  router.get('/', requireAuth, async (req, res) => {
    try {
      const { status, recipientCode, search } = req.query;
      let query = db.collection(SOA_COLLECTION);

      if (status && status !== 'all') {
        query = query.where('status', '==', String(status));
      }
      if (recipientCode) {
        query = query.where('recipientCode', '==', String(recipientCode).toUpperCase());
      }

      const snapshot = await query.get();
      let records = [];

      snapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
      });

      // In-memory sort by date / createdAt descending
      records.sort((a, b) => {
        const dateA = a.date || a.createdAt || '';
        const dateB = b.date || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      if (search) {
        const q = String(search).toLowerCase();
        records = records.filter((r) =>
          (r.soaNo && r.soaNo.toLowerCase().includes(q)) ||
          (r.recipientName && r.recipientName.toLowerCase().includes(q)) ||
          (r.subject && r.subject.toLowerCase().includes(q)) ||
          (Array.isArray(r.items) && r.items.some((it) =>
            (it.projectName && it.projectName.toLowerCase().includes(q)) ||
            (it.poNumber && it.poNumber.toLowerCase().includes(q)) ||
            (it.description && it.description.toLowerCase().includes(q))
          ))
        );
      }

      res.json({ success: true, count: records.length, data: records });
    } catch (err) {
      console.error('[SOA Router] GET / error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch SOAs' });
    }
  });

  // GET /api/soa/:id - Get a single Statement of Account
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const doc = await db.collection(SOA_COLLECTION).doc(req.params.id).get();
      if (!doc.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }
      res.json({ success: true, data: { id: doc.id, ...doc.data() } });
    } catch (err) {
      console.error('[SOA Router] GET /:id error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch SOA' });
    }
  });

  // POST /api/soa - Create a new Statement of Account
  router.post('/', requireAuth, async (req, res) => {
    try {
      const payload = req.body || {};
      const now = new Date().toISOString();
      const date = payload.date || now.slice(0, 10);
      const recipientCode = (payload.recipientCode || 'ACT').toUpperCase().slice(0, 3);
      const revision = payload.revision || '00';

      const d = new Date(date);
      const year = String(d.getFullYear()).slice(-2);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const yymm = `${year}${month}`;

      let soaNo = payload.soaNo;
      if (!soaNo) {
        const nextSeq = await getNextSoaSequence(db, yymm);
        soaNo = formatSoaCode(nextSeq, recipientCode, revision, date);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      const totals = computeTotals(items);

      const record = {
        soaNo,
        revision,
        date,
        currency: payload.currency || 'PHP',
        status: payload.status || 'for_payment',

        recipientId: payload.recipientId || null,
        recipientCode,
        recipientName: payload.recipientName || 'Advance Controle Technologie Inc',
        recipientContactName: payload.recipientContactName || 'Lindsey Salilig',
        recipientContactPhone: payload.recipientContactPhone || '',
        recipientContactEmail: payload.recipientContactEmail || '',
        recipientAddress: payload.recipientAddress || '',

        subject: payload.subject || 'Consolidated Statement of Account – Outstanding Billings',
        salutation: payload.salutation || '',
        bodyText: payload.bodyText || '',

        items,
        footnotes: Array.isArray(payload.footnotes) ? payload.footnotes : [],

        subtotalWithPo: totals.subtotalWithPo,
        subtotalPendingPo: totals.subtotalPendingPo,
        totalOutstanding: totals.totalOutstanding,

        preparedByName: payload.preparedByName || req.user.full_name || req.user.name || 'Reuel Joshua Rivera',
        preparedByTitle: payload.preparedByTitle || req.user.designation || req.user.position || 'Managing Partner - Operations',
        preparedByPhone: payload.preparedByPhone || req.user.contact_number || '+63 919 082 5434',
        preparedByEmail: payload.preparedByEmail || req.user.email || 'rj.rivera@iocontroltech.com',

        amountCollected: Number(payload.amountCollected) || 0,
        balanceRemaining: Math.max(0, totals.totalOutstanding - (Number(payload.amountCollected) || 0)),
        settlementDate: payload.settlementDate || null,
        collections: Array.isArray(payload.collections) ? payload.collections : [],

        notes: payload.notes || '',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.username || req.user.userId || 'system',
      };

      const docRef = await db.collection(SOA_COLLECTION).add(record);
      res.status(201).json({ success: true, id: docRef.id, data: { id: docRef.id, ...record } });
    } catch (err) {
      console.error('[SOA Router] POST / error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to create SOA' });
    }
  });

  // PUT /api/soa/:id - Update an existing Statement of Account
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const payload = req.body || {};
      const now = new Date().toISOString();
      const items = Array.isArray(payload.items) ? payload.items : existing.data().items || [];
      const totals = computeTotals(items);
      const amountCollected = Number(payload.amountCollected !== undefined ? payload.amountCollected : existing.data().amountCollected) || 0;

      const updateData = {
        ...(payload.soaNo && { soaNo: payload.soaNo }),
        ...(payload.revision && { revision: payload.revision }),
        ...(payload.date && { date: payload.date }),
        ...(payload.currency && { currency: payload.currency }),
        ...(payload.status && { status: payload.status }),

        ...(payload.recipientId !== undefined && { recipientId: payload.recipientId }),
        ...(payload.recipientCode && { recipientCode: payload.recipientCode.toUpperCase() }),
        ...(payload.recipientName !== undefined && { recipientName: payload.recipientName }),
        ...(payload.recipientContactName !== undefined && { recipientContactName: payload.recipientContactName }),
        ...(payload.recipientContactPhone !== undefined && { recipientContactPhone: payload.recipientContactPhone }),
        ...(payload.recipientContactEmail !== undefined && { recipientContactEmail: payload.recipientContactEmail }),
        ...(payload.recipientAddress !== undefined && { recipientAddress: payload.recipientAddress }),

        ...(payload.subject !== undefined && { subject: payload.subject }),
        ...(payload.salutation !== undefined && { salutation: payload.salutation }),
        ...(payload.bodyText !== undefined && { bodyText: payload.bodyText }),

        items,
        ...(payload.footnotes && { footnotes: payload.footnotes }),

        subtotalWithPo: totals.subtotalWithPo,
        subtotalPendingPo: totals.subtotalPendingPo,
        totalOutstanding: totals.totalOutstanding,

        ...(payload.preparedByName && { preparedByName: payload.preparedByName }),
        ...(payload.preparedByTitle && { preparedByTitle: payload.preparedByTitle }),
        ...(payload.preparedByPhone && { preparedByPhone: payload.preparedByPhone }),
        ...(payload.preparedByEmail && { preparedByEmail: payload.preparedByEmail }),

        amountCollected,
        balanceRemaining: Math.max(0, totals.totalOutstanding - amountCollected),
        ...(payload.settlementDate !== undefined && { settlementDate: payload.settlementDate }),
        ...(payload.collections && { collections: payload.collections }),
        ...(payload.notes !== undefined && { notes: payload.notes }),

        updatedAt: now,
      };

      await docRef.update(updateData);
      const updated = await docRef.get();
      res.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      console.error('[SOA Router] PUT /:id error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update SOA' });
    }
  });

  // PATCH /api/soa/:id/status - Quick status update
  router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
      const { status, settlementDate } = req.body;
      if (!status) {
        return res.status(400).json({ success: false, error: 'Status is required' });
      }

      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const now = new Date().toISOString();
      const updates = {
        status,
        updatedAt: now,
      };
      if (settlementDate !== undefined) {
        updates.settlementDate = settlementDate;
      }
      if (status === 'settled' && !existing.data().settlementDate) {
        updates.settlementDate = settlementDate || now.slice(0, 10);
        updates.amountCollected = existing.data().totalOutstanding || 0;
        updates.balanceRemaining = 0;
      }

      await docRef.update(updates);
      const updated = await docRef.get();
      res.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      console.error('[SOA Router] PATCH /:id/status error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update status' });
    }
  });

  // PATCH /api/soa/:id/items/:itemId - Update an individual line item (e.g. retroactive PO number)
  router.patch('/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
      const { itemId } = req.params;
      const {
        poNumber,
        poDate,
        hasPo,
        amount,
        description,
        completionDateText,
        footnoteSymbol,
        syncProject = true,
      } = req.body;

      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const data = existing.data();
      const items = Array.isArray(data.items) ? [...data.items] : [];
      const itemIndex = items.findIndex((it) => it.id === itemId);

      if (itemIndex === -1) {
        return res.status(404).json({ success: false, error: 'Line item not found' });
      }

      const item = { ...items[itemIndex] };
      if (poNumber !== undefined) item.poNumber = poNumber;
      if (poDate !== undefined) item.poDate = poDate;
      if (hasPo !== undefined) item.hasPo = hasPo;
      if (amount !== undefined) item.amount = Number(amount) || 0;
      if (description !== undefined) item.description = description;
      if (completionDateText !== undefined) item.completionDateText = completionDateText;
      if (footnoteSymbol !== undefined) item.footnoteSymbol = footnoteSymbol;

      // If poNumber was provided and hasPo wasn't explicitly set, default hasPo to true
      if (poNumber && hasPo === undefined) {
        item.hasPo = true;
      }

      items[itemIndex] = item;
      const totals = computeTotals(items);
      const now = new Date().toISOString();

      await docRef.update({
        items,
        subtotalWithPo: totals.subtotalWithPo,
        subtotalPendingPo: totals.subtotalPendingPo,
        totalOutstanding: totals.totalOutstanding,
        balanceRemaining: Math.max(0, totals.totalOutstanding - (data.amountCollected || 0)),
        updatedAt: now,
      });

      // Synchronize PO to linked Project record if present.
      // ACTI-fronted jobs: this PO is ACTI → IOCT (never overwrite the customer PO).
      // Direct jobs: this PO is already the customer → IOCT number.
      if (syncProject && item.projectId && item.poNumber) {
        try {
          const projRef = db.collection('projects').doc(String(item.projectId));
          const projDoc = await projRef.get();
          if (projDoc.exists) {
            const proj = projDoc.data() || {};
            if (isActiFrontedProject(proj)) {
              const trail = { ...(proj.commercial_trail || {}) };
              trail.acti_to_ioct_po_number = item.poNumber;
              if (item.poDate) trail.acti_to_ioct_po_date = item.poDate;
              trail.acti_to_ioct_po_status = 'received';
              await projRef.update({
                commercial_trail: trail,
                updated_at: now,
              });
            } else {
              const poDateUnix = item.poDate ? Math.floor(new Date(item.poDate).getTime() / 1000) : null;
              await projRef.update({
                po_number: item.poNumber,
                ...(poDateUnix ? { po_date: poDateUnix } : {}),
                updated_at: now,
              });
            }
          }
        } catch (syncErr) {
          console.warn('[SOA Router] Project PO sync notice:', syncErr.message);
        }
      }

      const updated = await docRef.get();
      res.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      console.error('[SOA Router] PATCH /:id/items/:itemId error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update item' });
    }
  });

  // POST /api/soa/:id/payments - Record a collection/payment against an SOA
  router.post('/:id/payments', requireAuth, async (req, res) => {
    try {
      const { amount, paymentDate, reference, invoiceId, notes } = req.body;
      const paymentAmount = Number(amount) || 0;
      if (paymentAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Payment amount must be greater than zero' });
      }

      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const data = existing.data();
      const now = new Date().toISOString();
      const collections = Array.isArray(data.collections) ? [...data.collections] : [];

      collections.push({
        id: `col_${Date.now()}`,
        amount: paymentAmount,
        date: paymentDate || now.slice(0, 10),
        reference: reference || '',
        invoiceId: invoiceId || null,
        notes: notes || '',
        recordedBy: req.user.username || req.user.userId || 'system',
        recordedAt: now,
      });

      const totalCollected = (Number(data.amountCollected) || 0) + paymentAmount;
      const totalOutstanding = Number(data.totalOutstanding) || 0;
      const balanceRemaining = Math.max(0, totalOutstanding - totalCollected);
      const isSettled = balanceRemaining <= 0.01;

      const updates = {
        collections,
        amountCollected: totalCollected,
        balanceRemaining,
        ...(isSettled ? { status: 'settled', settlementDate: paymentDate || now.slice(0, 10) } : { status: 'partially_paid' }),
        updatedAt: now,
      };

      await docRef.update(updates);
      const updated = await docRef.get();
      res.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      console.error('[SOA Router] POST /:id/payments error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to record payment' });
    }
  });

  // POST /api/soa/:id/upload-onedrive - Upload SOA PDF to Corporate OneDrive
  router.post('/:id/upload-onedrive', requireAuth, async (req, res) => {
    try {
      if (typeof getGraphAppToken !== 'function' || typeof resolveCorporateDriveId !== 'function') {
        return res.status(503).json({ success: false, error: 'OneDrive integration is not configured on server' });
      }

      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const soa = existing.data();
      const { pdfBase64 } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ success: false, error: 'pdfBase64 string is required' });
      }

      const token = await getGraphAppToken();
      const driveId = await resolveCorporateDriveId(token);

      const d = new Date(soa.date || Date.now());
      const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const targetFolder = `00 Finance/Statements of Account/${yyyymm}`;

      const folder = await ensureFolderByPath(token, driveId, targetFolder);
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const filename = `${soa.soaNo || 'SOA'}.pdf`;

      const uploadResult = await uploadFileToFolder(
        token,
        driveId,
        folder.id,
        filename,
        pdfBuffer,
        'application/pdf'
      );

      const now = new Date().toISOString();
      await docRef.update({
        onedrive_item_id: uploadResult.id,
        onedrive_web_url: uploadResult.webUrl || '',
        onedrive_uploaded_at: now,
        updatedAt: now,
      });

      res.json({
        success: true,
        itemId: uploadResult.id,
        webUrl: uploadResult.webUrl || '',
        folderPath: targetFolder,
      });
    } catch (err) {
      console.error('[SOA Router] POST /:id/upload-onedrive error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to upload to OneDrive' });
    }
  });

  // POST /api/soa/:id/revise - Create a new revision of an SOA
  router.post('/:id/revise', requireAuth, async (req, res) => {
    try {
      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }

      const orig = existing.data();
      const parsed = parseSoaCode(orig.soaNo || '');
      const prevRev = orig.revision || (parsed ? parsed.revision : '00');
      const nextRevNum = parseInt(prevRev, 10) + 1;
      const nextRev = String(isNaN(nextRevNum) ? 1 : nextRevNum).padStart(2, '0');

      const baseCode = parsed ? parsed.baseCode : (orig.soaNo || '').replace(/-\d{2}$/, '');
      const newSoaNo = `${baseCode}-${nextRev}`;
      const now = new Date().toISOString();

      const newRecord = {
        ...orig,
        soaNo: newSoaNo,
        revision: nextRev,
        date: now.slice(0, 10),
        status: 'draft',
        amountCollected: 0,
        balanceRemaining: orig.totalOutstanding || 0,
        settlementDate: null,
        collections: [],
        previousRevisionId: docRef.id,
        previousSoaNo: orig.soaNo,
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.username || req.user.userId || 'system',
      };

      const newDocRef = await db.collection(SOA_COLLECTION).add(newRecord);
      res.status(201).json({ success: true, id: newDocRef.id, data: { id: newDocRef.id, ...newRecord } });
    } catch (err) {
      console.error('[SOA Router] POST /:id/revise error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to revise SOA' });
    }
  });

  // DELETE /api/soa/:id - Delete an SOA
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const docRef = db.collection(SOA_COLLECTION).doc(req.params.id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return res.status(404).json({ success: false, error: 'Statement of Account not found' });
      }
      await docRef.delete();
      res.json({ success: true, message: 'Statement of Account deleted' });
    } catch (err) {
      console.error('[SOA Router] DELETE /:id error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to delete SOA' });
    }
  });

  return router;
}

module.exports = {
  createSoaRouter,
  computeTotals,
  isActiFrontedProject,
};
