'use strict';

// Evidence uploads reuse project identity. Never create/rename an execution
// project folder: unresolved or ambiguous historical mappings need human repair.
async function resolveInvoiceEvidenceFolder({ db, fetch, token, driveId, invoiceId, root }) {
  const invoice = await db.collection('invoices').doc(String(invoiceId)).get();
  if (!invoice.exists) throw new Error('Invoice not found');
  const project = await db.collection('projects').doc(String(invoice.data().project_id)).get();
  if (!project.exists) throw new Error('Invoice project not found');
  const p = project.data();
  let proposals = [];
  if (!p.executionFolderId && p.calcsheet_project_id) {
    const linked = await db.collection('calcsheet_projects').doc(String(p.calcsheet_project_id)).get();
    proposals = linked.exists ? [linked.data()] : [];
  } else if (!p.executionFolderId) {
    const linked = await db.collection('calcsheet_projects').where('mainProjectId', '==', project.id).get();
    proposals = linked.docs.map(d => d.data());
  }
  const base = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}`;
  const graph = async url => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Project folder lookup failed (${response.status})`);
    return response.json();
  };
  const children = async path => {
    const enc = path.split('/').map(encodeURIComponent).join('/');
    let url = `${base}/root:/${enc}:/children?$top=500&$select=id,name,folder,parentReference`;
    const items = [];
    while (url) {
      const page = await graph(url);
      if (!page) break;
      items.push(...(page.value || []).filter(item => item.folder));
      url = page['@odata.nextLink'];
    }
    return items;
  };
  // Project List mapping is authoritative, then its linked Calcsheet mapping.
  const ids = [...new Set(proposals.map(item => item.executionFolderId).filter(Boolean))];
  if (!p.executionFolderId && ids.length > 1) throw new Error('Ambiguous project folder mapping');
  const folderId = p.executionFolderId || ids[0];
  let folder;
  if (folderId) {
    folder = await graph(`${base}/items/${encodeURIComponent(folderId)}?$select=id,name,folder,parentReference`);
    if (!folder?.folder) throw new Error('Saved execution folder is unavailable; repair project folder mapping before uploading');
  } else {
    const number = String(p.project_no || '').trim();
    if (!number) throw new Error('Project number missing; link an execution folder before uploading');
    const code = p.calcsheet_code || (proposals.length === 1 ? proposals[0].code : '') || '';
    const customer = code.match(/^PCS\d{7}-([A-Z0-9]+)-/i)?.[1];
    const canonicalPrefix = (customer ? `${number}-${customer}` : number).toLowerCase();
    const matchesNumber = name => {
      const value = name.toLowerCase(); const prefix = number.toLowerCase();
      return value === prefix || value.startsWith(`${prefix}-`) || value.startsWith(`${prefix} `);
    };
    // Search the flat historical root and every year, independent of upload date.
    const top = await children(root);
    const candidates = top.filter(item => matchesNumber(item.name || ''));
    for (const year of top.filter(item => /^\d{4}$/.test(item.name))) {
      candidates.push(...(await children(`${root}/${year.name}`)).filter(item => matchesNumber(item.name || '')));
    }
    const canonical = customer ? candidates.filter(item => item.name.toLowerCase() === canonicalPrefix || item.name.toLowerCase().startsWith(`${canonicalPrefix} `)) : candidates;
    const distinct = [...new Map((canonical.length ? canonical : candidates).map(item => [item.id, item])).values()];
    if (distinct.length !== 1) throw new Error('Project execution folder missing or ambiguous; link the existing folder before uploading');
    folder = distinct[0];
  }
  // Address the child by parent identity, independent of name/year/moves.
  const childUrl = `${base}/items/${encodeURIComponent(folder.id)}:/Sales%20Invoice`;
  const existing = await graph(childUrl);
  if (existing) {
    if (!existing.folder) throw new Error('Sales Invoice exists but is not a folder');
    return existing;
  }
  const created = await fetch(`${base}/items/${encodeURIComponent(folder.id)}/children`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sales Invoice', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (created.status === 409) {
    const concurrent = await graph(childUrl);
    if (concurrent?.folder) return concurrent;
  }
  if (!created.ok) throw new Error(`Sales Invoice folder creation failed (${created.status})`);
  return created.json();
}

module.exports = { resolveInvoiceEvidenceFolder };
