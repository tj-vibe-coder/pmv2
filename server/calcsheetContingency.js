const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_DAYS = 91.3125;

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const parseDay = (value) => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year)
      || date.getUTCMonth() + 1 !== Number(month)
      || date.getUTCDate() !== Number(day)) return null;
  return date.getTime();
};

const quarterIndex = (dateOnly) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3);
};

function quarterlyRate(observations, analysisMs) {
  const analysisDate = new Date(analysisMs);
  const cutoff = Date.UTC(
    analysisDate.getUTCFullYear() - 1,
    analysisDate.getUTCMonth(),
    analysisDate.getUTCDate(),
  );
  const groups = new Map();
  observations
    .filter((row) => parseDay(row.quotationDate) >= cutoff)
    .forEach((row) => {
      const key = quarterIndex(row.quotationDate);
      groups.set(key, [...(groups.get(key) || []), row.normalizedUnitCost]);
    });
  const quarters = [...groups]
    .map(([index, costs]) => ({ index, cost: median(costs) }))
    .sort((a, b) => a.index - b.index);
  if (quarters.length < 3) return null;
  const rates = [];
  for (let index = 1; index < quarters.length; index += 1) {
    const elapsed = quarters[index].index - quarters[index - 1].index;
    rates.push((quarters[index].cost / quarters[index - 1].cost) ** (1 / elapsed) - 1);
  }
  return { rate: median(rates), quarterCount: quarters.length };
}

function annualizedRate(observations) {
  const sorted = [...observations].sort(
    (a, b) => parseDay(a.quotationDate) - parseDay(b.quotationDate),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const elapsedDays = (parseDay(last.quotationDate) - parseDay(first.quotationDate)) / DAY_MS;
  if (elapsedDays < 273.75) return null;
  return {
    rate: (last.normalizedUnitCost / first.normalizedUnitCost) ** (365 / elapsedDays) - 1,
    elapsedDays,
  };
}

function roundUpHalfPercent(value) {
  return Math.ceil(Math.max(0, value) * 2) / 2;
}

function theilSenLine(observations) {
  const points = observations.map((row) => ({
    x: parseDay(row.quotationDate) / DAY_MS,
    y: Math.log(row.normalizedUnitCost),
  }));
  const slopes = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const dx = points[right].x - points[left].x;
      if (dx !== 0) slopes.push((points[right].y - points[left].y) / dx);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(points.map((point) => point.y - slope * point.x));
  return { slope, intercept };
}

function excludeOutliers(observations) {
  if (observations.length < 5) return { included: observations, excluded: [] };
  const line = theilSenLine(observations);
  const residuals = observations.map((row) => {
    const x = parseDay(row.quotationDate) / DAY_MS;
    return Math.log(row.normalizedUnitCost) - (line.intercept + line.slope * x);
  });
  const center = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - center)));
  if (mad === 0) return { included: observations, excluded: [] };
  const outlierIds = new Set();
  residuals.forEach((value, index) => {
    const modifiedZ = 0.6745 * Math.abs(value - center) / mad;
    if (modifiedZ > 3.5) outlierIds.add(observations[index].observationId);
  });
  return {
    included: observations.filter((row) => !outlierIds.has(row.observationId)),
    excluded: observations
      .filter((row) => outlierIds.has(row.observationId))
      .map((row) => ({ observationId: row.observationId, reason: 'statistical_outlier' })),
  };
}

function confidenceOf({
  method, usableCount, quarterCount, staleDays, candidateUsed, hasWarnings,
}) {
  if (!candidateUsed && method === 'quarterly' && quarterCount >= 4
      && staleDays <= 92 && !hasWarnings) return 'high';
  if (!candidateUsed && !hasWarnings && staleDays <= 365
      && ((method === 'quarterly' && quarterCount >= 3)
        || (method === 'annualized' && usableCount >= 3))) return 'medium';
  return 'low';
}

function calculateSuggestion({
  observations,
  selectedObservationId,
  confirmedCandidateObservationIds = [],
  analysisDate,
  expectedPurchaseDate,
}) {
  const selected = observations.find((row) => row.observationId === selectedObservationId);
  if (!selected) throw new Error('Selected historical price was not found');
  const analysisMs = parseDay(analysisDate);
  const targetMs = parseDay(expectedPurchaseDate);
  const selectedMs = parseDay(selected.quotationDate);
  if (analysisMs == null || targetMs == null || selectedMs == null) {
    throw new Error('Valid analysis, source, and expected purchase dates are required');
  }
  if (targetMs < analysisMs) {
    throw new Error('Expected purchase date cannot be before the quotation date');
  }

  const confirmed = new Set(confirmedCandidateObservationIds);
  const excluded = [];
  let usable = observations.filter((row) => {
    const isSelected = row.observationId === selectedObservationId;
    const sameExactProduct = selected.productKey && row.productKey === selected.productKey;
    const userConfirmed = confirmed.has(row.observationId);
    if (!isSelected && !sameExactProduct && !userConfirmed) return false;
    const rowMs = parseDay(row.quotationDate);
    if (rowMs == null) {
      excluded.push({ observationId: row.observationId, reason: 'invalid_date' });
      return false;
    }
    if (rowMs > analysisMs) {
      excluded.push({ observationId: row.observationId, reason: 'future_observation' });
      return false;
    }
    if (!Number.isFinite(row.normalizedUnitCost) || !(row.normalizedUnitCost > 0)) {
      excluded.push({ observationId: row.observationId, reason: 'invalid_cost' });
      return false;
    }
    if (String(row.uom || '').trim().toLowerCase()
        !== String(selected.uom || '').trim().toLowerCase()) {
      excluded.push({ observationId: row.observationId, reason: 'incompatible_uom' });
      return false;
    }
    return true;
  });

  const outlierResult = excludeOutliers(usable);
  usable = outlierResult.included;
  excluded.push(...outlierResult.excluded);
  const selectedIsUsable = usable.some(
    (row) => row.observationId === selectedObservationId,
  );
  if (!selectedIsUsable || usable.length < 2) {
    return {
      status: 'insufficient_history',
      method: null,
      confidence: null,
      suggestedContingencyPct: null,
      included: usable,
      excluded,
    };
  }

  const quarterly = quarterlyRate(usable, analysisMs);
  const annualized = quarterly ? null : annualizedRate(usable);
  if (!quarterly && !annualized) {
    return {
      status: 'insufficient_history',
      method: null,
      confidence: null,
      suggestedContingencyPct: null,
      included: usable,
      excluded,
    };
  }

  const method = quarterly ? 'quarterly' : 'annualized';
  const rate = quarterly?.rate ?? annualized.rate;
  const unitDays = method === 'quarterly' ? QUARTER_DAYS : 365;
  const forecastDays = (targetMs - selectedMs) / DAY_MS;
  const projectedIncreasePct = ((1 + rate) ** (forecastDays / unitDays) - 1) * 100;
  const candidateUsed = usable.some((row) => confirmed.has(row.observationId));
  const latestMs = Math.max(...usable.map((row) => parseDay(row.quotationDate)));
  const staleDays = (analysisMs - latestMs) / DAY_MS;
  const confidence = confidenceOf({
    method,
    usableCount: usable.length,
    quarterCount: quarterly?.quarterCount || 0,
    staleDays,
    candidateUsed,
    hasWarnings: excluded.length > 0,
  });
  const suggestedContingencyPct = roundUpHalfPercent(projectedIncreasePct);
  return {
    status: 'ready',
    method,
    confidence,
    rate,
    forecastDays,
    suggestedContingencyPct,
    highRisk: suggestedContingencyPct > 50,
    included: usable,
    excluded,
  };
}

module.exports = {
  annualizedRate,
  calculateSuggestion,
  excludeOutliers,
  quarterlyRate,
  roundUpHalfPercent,
};
