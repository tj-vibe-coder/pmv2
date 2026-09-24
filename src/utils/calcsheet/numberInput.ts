import type { WheelEvent } from 'react';

/**
 * Browsers change a focused `<input type="number">`'s value on mouse-wheel
 * scroll. That's rarely what someone scrolling the page past a number field
 * wants — it silently mutates calcsheet figures. Blurring on wheel lets the
 * scroll pass through to the page instead of stepping the value.
 */
export function blurNumberInputOnWheel(e: WheelEvent<HTMLDivElement>): void {
  (e.target as HTMLElement).blur();
}

/**
 * `<input type="number">` cannot parse thousands separators, and browsers are
 * inconsistent (and sometimes outright buggy) about what they do when a
 * comma-formatted figure copied from Excel/a PDF — e.g. "503,170.08" — is
 * pasted into one; the field can silently land on a mangled value instead of
 * rejecting or cleanly stripping it. Fields that accept pasted currency
 * figures should use `type="text"` + `inputMode="decimal"` and run pasted/typed
 * text through this sanitizer themselves instead of trusting the browser.
 * Strips thousands separators, currency symbols, and whitespace; keeps digits,
 * a single leading minus, and a single decimal point.
 */
export function sanitizeNumericText(raw: string): string {
  const negative = raw.trim().startsWith('-');
  const digitsAndDot = raw.replace(/[^\d.]/g, '');
  const firstDot = digitsAndDot.indexOf('.');
  const cleaned = firstDot === -1
    ? digitsAndDot
    : digitsAndDot.slice(0, firstDot + 1) + digitsAndDot.slice(firstDot + 1).replace(/\./g, '');
  return negative ? `-${cleaned}` : cleaned;
}

export function parseLenientFloat(raw: string): number {
  const parsed = parseFloat(sanitizeNumericText(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseLenientInt(raw: string): number {
  const parsed = parseInt(sanitizeNumericText(raw), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
