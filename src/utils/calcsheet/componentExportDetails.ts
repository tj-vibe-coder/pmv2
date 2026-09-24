export function componentExportDetails(
  component: { brand?: string; partNo?: string },
  hidePartNumbers: boolean,
): string {
  return [component.brand, hidePartNumbers ? undefined : component.partNo]
    .filter(Boolean)
    .join(', ');
}
