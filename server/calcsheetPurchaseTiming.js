function parseCalendarDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year)
      || date.getUTCMonth() + 1 !== Number(month)
      || date.getUTCDate() !== Number(day)) return null;
  return date.getTime();
}

function purchaseDateError(value, label) {
  if (value == null || value === '') return null;
  return parseCalendarDate(value) == null
    ? `${label} must be a valid calendar date`
    : null;
}

function effectiveQuotationDate(quotation) {
  const dateSent = String(quotation?.dateSent ?? '').trim();
  if (dateSent) return { value: parseCalendarDate(dateSent), invalid: false };
  const createdAt = new Date(quotation?.createdAt);
  return Number.isFinite(createdAt.getTime())
    ? { value: Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()), invalid: false }
    : { value: null, invalid: true };
}

function validateQuotationPurchaseTiming(quotation) {
  const components = Array.isArray(quotation?.components) ? quotation.components : [];
  const quotationError = purchaseDateError(
    quotation?.expectedPurchaseDate,
    'Expected purchase date',
  );
  if (quotationError) return quotationError;
  for (let index = 0; index < components.length; index += 1) {
    const componentError = purchaseDateError(
      components[index]?.expectedPurchaseDate,
      `Component ${index + 1} expected purchase date`,
    );
    if (componentError) return componentError;
  }

  const hasPurchaseDates = Boolean(quotation?.expectedPurchaseDate)
    || components.some((component) => Boolean(component?.expectedPurchaseDate));
  if (!hasPurchaseDates) return null;

  const quotationDate = effectiveQuotationDate(quotation);
  if (quotationDate.invalid || quotationDate.value == null) {
    return 'Quotation date must be a valid calendar date before validating expected purchase dates';
  }
  if (quotation?.expectedPurchaseDate
      && parseCalendarDate(quotation.expectedPurchaseDate) < quotationDate.value) {
    return 'Expected purchase date cannot be before the quotation date';
  }
  for (let index = 0; index < components.length; index += 1) {
    const expectedPurchaseDate = components[index]?.expectedPurchaseDate;
    if (expectedPurchaseDate
        && parseCalendarDate(expectedPurchaseDate) < quotationDate.value) {
      return `Component ${index + 1} expected purchase date cannot be before the quotation date`;
    }
  }
  return null;
}

module.exports = { parseCalendarDate, validateQuotationPurchaseTiming };
