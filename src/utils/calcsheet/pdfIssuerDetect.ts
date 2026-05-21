// Detect whether a quotation PDF was issued by IOCT or ACTI, based on the
// letterhead text on page 1. Used by the legacy import flow to auto-pick
// which kind(s) to import without forcing the user to inspect each PDF.

export type PdfIssuer = 'IOCT' | 'ACTI' | 'unknown';

let pdfjsPromise: Promise<any> | null = null;

async function loadPdfjs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    // Lazy import keeps pdfjs out of the main bundle for users who don't import legacy data.
    const pdfjs = await import(/* webpackChunkName: "pdfjs" */ 'pdfjs-dist/legacy/build/pdf.mjs');
    // Point the worker at the bundled file via the same CDN version. CRA cannot easily
    // serve the worker from node_modules, so jsDelivr is the path of least resistance.
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
    return pdfjs;
  })();
  return pdfjsPromise;
}

export async function detectIssuerFromPdf(file: File): Promise<PdfIssuer> {
  try {
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, disableFontFace: true }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    // Concatenate the first ~30 text items — the letterhead is always at the very top.
    const items: Array<{ str: string }> = content.items.slice(0, 30) as any;
    const blob = items.map((i) => i.str).join(' ').toLowerCase();
    try { await doc.destroy(); } catch { /* ignore cleanup */ }
    if (blob.includes('io control technologie') || blob.includes('iocontroltech')) return 'IOCT';
    if (blob.includes('advance controle technologie') || blob.includes('acti')) return 'ACTI';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
