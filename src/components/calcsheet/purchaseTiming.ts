interface PurchaseTimingLine {
  expectedPurchaseDate?: string;
}

export function hasInvalidPurchaseTiming(
  quotationDate: string,
  quotationExpectedPurchaseDate: string | undefined,
  components: PurchaseTimingLine[],
) {
  return Boolean(
    (quotationExpectedPurchaseDate && quotationExpectedPurchaseDate < quotationDate)
    || components.some((line) => (
      line.expectedPurchaseDate && line.expectedPurchaseDate < quotationDate
    )),
  );
}
