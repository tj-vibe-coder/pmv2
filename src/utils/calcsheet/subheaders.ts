/** Returns the visible inline subheader for a row, if that row begins a labeled block. */
export function subheaderBefore<T extends { subheader?: string }>(rows: T[], index: number): string | undefined {
  const label = rows[index]?.subheader?.trim();
  if (!label) return undefined;
  return rows[index - 1]?.subheader?.trim() === label ? undefined : label;
}
