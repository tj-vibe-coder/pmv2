import type { ReportIssuer } from './reportPdfKit';

/** Load the issuer's letterhead logo as a data URL (browser only). Null when it can't be loaded. */
export async function loadReportLogo(issuer: ReportIssuer): Promise<string | null> {
  try {
    const { loadLogoTransparentBackground, loadImageDataUrl } = await import('../logoUtils');
    const url = `${process.env.PUBLIC_URL || ''}${issuer.logoFile}`;
    return issuer.logoNeedsBgRemoval ? await loadLogoTransparentBackground(url) : await loadImageDataUrl(url);
  } catch {
    return null;
  }
}
