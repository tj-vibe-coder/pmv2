interface PurchaseTimingLine {
  expectedPurchaseDate?: string;
}

function isCalendarDate(value: string | undefined) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return !value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day);
}

export function hasInvalidPurchaseTiming(
  quotationDate: string,
  quotationExpectedPurchaseDate: string | undefined,
  components: PurchaseTimingLine[],
) {
  return Boolean(
    !isCalendarDate(quotationDate)
    || !isCalendarDate(quotationExpectedPurchaseDate)
    || components.some((line) => !isCalendarDate(line.expectedPurchaseDate))
    || (quotationExpectedPurchaseDate && quotationExpectedPurchaseDate < quotationDate)
    || components.some((line) => (
      line.expectedPurchaseDate && line.expectedPurchaseDate < quotationDate
    )),
  );
}
