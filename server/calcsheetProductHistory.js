const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? '').trim();
}

function normalizedPart(value) {
  return clean(value).toLowerCase();
}

function productKeyOf(line) {
  const part = normalizedPart(line.partNo);
  return part || null;
}

function validDateOnly(value) {
  if (!value) return null;
  const calendarDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      check.getUTCFullYear() !== Number(year)
      || check.getUTCMonth() + 1 !== Number(month)
      || check.getUTCDate() !== Number(day)
    ) {
      return null;
    }
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function quotationDateOf(quotation) {
  const sent = validDateOnly(quotation.dateSent);
  if (sent) return { value: sent, source: 'dateSent' };
  const created = validDateOnly(quotation.createdAt);
  if (created) return { value: created, source: 'createdAt' };
  return { value: null, source: 'missing' };
}

function quotationRef(projectCode, clientCode, revision) {
  const base = clean(projectCode).replace(/-[A-Z]{3}-\d{2}$/, '');
  return `${base}-${(clean(clientCode) || 'XXX').slice(0, 3).toUpperCase()}-${clean(revision) || '00'}`;
}

function normalizedCostOf(line) {
  const cost = Number(line.unitCost);
  const forex = line.forex == null ? 1 : Number(line.forex);
  const discount = Number(line.discountPct || 0);
  const value = cost * forex * (1 - discount / 100);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function flattenProductHistory({ projects, quotations, clients }) {
  const projectById = new Map(projects.map((p) => [String(p.id), p]));
  const clientById = new Map(clients.map((c) => [String(c.id), c]));
  const rows = [];
  for (const quotation of quotations) {
    const project = projectById.get(String(quotation.projectId));
    if (!project) continue;
    const recipient = clientById.get(String(quotation.recipientId));
    const date = quotationDateOf(quotation);
    const components = Array.isArray(quotation.components) ? quotation.components : [];
    components.forEach((line, index) => {
      const normalizedUnitCost = normalizedCostOf(line);
      const contingencyPct = Number(line.contingencyPct || 0);
      const legacyFormula = quotation.formulaVersion === 'legacy';
      const markupPct = Number(
        legacyFormula
          ? quotation.productMarkupPct ?? 0
          : line.markupPct ?? quotation.productMarkupPct ?? 0,
      );
      const legacySellingUnit = Number(line.unitCost)
        * (line.forex == null ? 1 : Number(line.forex))
        * (1 + contingencyPct / 100 - Number(line.discountPct || 0) / 100)
        * (1 + markupPct / 100);
      const quotedSellingUnit = legacyFormula
        ? Number.isFinite(legacySellingUnit) && legacySellingUnit > 0
          ? legacySellingUnit
          : null
        : normalizedUnitCost == null
          ? null
          : normalizedUnitCost * (1 + contingencyPct / 100) * (1 + markupPct / 100);
      rows.push({
        observationId: `${quotation.id}:${line.id || index}`,
        productKey: productKeyOf(line),
        matchType: productKeyOf(line) ? 'exact' : 'unmatched',
        description: clean(line.description),
        brand: clean(line.brand),
        partNo: clean(line.partNo),
        uom: clean(line.uom),
        projectId: String(project.id),
        projectCode: clean(project.code),
        projectName: clean(project.name),
        projectStatus: project.status || 'draft',
        quotationId: String(quotation.id),
        quotationKind: quotation.kind,
        quotationRevision: clean(quotation.revision),
        quotationReference: quotationRef(project.code, recipient?.code, quotation.revision),
        quotationDate: date.value,
        quotationDateSource: date.source,
        sourceUnitCost: Number(line.unitCost || 0),
        sourceForex: line.forex == null ? 1 : Number(line.forex),
        sourceDiscountPct: Number(line.discountPct || 0),
        normalizedUnitCost,
        quotedSellingUnit,
        sourceContingencyPct: contingencyPct,
        sourceMarkupPct: markupPct,
      });
    });
  }
  return rows;
}

function searchProductHistory(rows, options = {}) {
  const search = clean(options.search).toLowerCase();
  const status = clean(options.status);
  const requestedLimit = Number(options.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit !== 0
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 50;
  let items = rows.filter((row) => {
    if (status && row.projectStatus !== status) return false;
    if (!search) return true;
    return [
      row.partNo, row.brand, row.description, row.projectName,
      row.projectCode, row.quotationReference,
    ].some((value) => clean(value).toLowerCase().includes(search));
  });
  const sort = options.sort || 'newest';
  items = [...items].sort((a, b) => {
    if (sort === 'oldest') return clean(a.quotationDate).localeCompare(clean(b.quotationDate));
    if (sort === 'price_asc') return (a.normalizedUnitCost ?? Infinity) - (b.normalizedUnitCost ?? Infinity);
    if (sort === 'price_desc') return (b.normalizedUnitCost ?? -Infinity) - (a.normalizedUnitCost ?? -Infinity);
    return clean(b.quotationDate).localeCompare(clean(a.quotationDate));
  });
  return { items: items.slice(0, limit), total: items.length, limit };
}

module.exports = {
  DAY_MS,
  flattenProductHistory,
  normalizedCostOf,
  productKeyOf,
  searchProductHistory,
};
