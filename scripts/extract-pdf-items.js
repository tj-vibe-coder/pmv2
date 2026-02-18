#!/usr/bin/env node
/**
 * Extracts line items from PO PDFs, logs them, and returns CSV rows.
 * Run: node scripts/extract-pdf-items.js
 * Used by extract-pos-to-suppliers.js
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const PO_DIRS = [
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP24120518-MMR JX Metals Slitting Machine Panel Rehab - COMP/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25010029-AVR Aboitiz TMI Nasipit RTU Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25060301-RTR True Temp Linden Suites BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25070317-TJC True Temp Supply of VFD/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25080381-TJC Cardinal Santos Operating Room BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25080415-NSG ADI Integration of 3 Vertiv UPS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/Project Completed 2025 - DS/CMRP25100500-TJC RPAT Additionals/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/DS Project 2025/CMRP25030149-JMO URC Cavite Silo PLC & SCADA Electrical Upgrade/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25050226-JMO URC Cal 2 Schaaf 2 Machine Elec Panel Rehab/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25070344-CBG URC BCFG-Cavite-CCTV Power Panel Installation/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25070349-CBG URC-Cavite-PPM2A Panel Installation/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2025 - Orders/SE Project 2025/CMRP25080414-CBG Unilab-Mandaluyong-Replacement of MDP Panel at FLEX/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/DS Projects 2024/CMRP24040105-EIS No 5 Upper East Avenue BMS/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24060234-RJR ATTSC Brent School Chiller BMS Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24060224-JMO URC Cavite Dynamite SCADA PLC Upgrade/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24050176-RJR LBI MDI Compressor Rack Conversion/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP23100347-EIS Unilab Glatt Panel Retrofitting/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2024 - Orders/Project Completed 2024 - DS/CMRP24080301-RJR STMicro PM Installation and FMCS Integration/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2026 - Orders/SE Project 2026/CMRP25060265B-CBG URC BCFG-Calamba 2-Installation of Power Meter/P.O',
  '/Users/tjc/Library/CloudStorage/GoogleDrive-tyronejames.caballero@cmrpautomation.com/.shortcut-targets-by-id/0BwLYHtwPeCSpZzRmd0ZONlVTWjA/02 Execution Stage/2026 - Orders/SE Project 2026/CMRP25070326-CBG URC UCP AIG-Pasig-Rectification of Auxiliary at Concrete Silo/P.O',
];

const LOG_DIR = path.join(__dirname, 'logs');

/** Parse PO text for supplier info and line items */
function parsePOText(text, filename) {
  const rows = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Extract supplier from vendor block (often at bottom: COMPANY NAME, address, phone, email)
  let supplierName = '';
  let contact = '';
  let email = '';
  let phone = '';
  let address = '';
  let paymentTerms = '';

  // Match vendor block: typically after "Attention:" or "PURCHASE ORDER" - look for company name in caps
  const vendorMatch = text.match(/([A-Z][A-Z0-9\s.,&()-]+(?:INC\.|CORP\.|CO\.|CORPORATION|INCORPORATED)?)\s*[\r\n]+([^\r\n]+?)\s*[\r\n]+(?:Phone|Tel|Mobile)[\s:]*([^\r\n]+)/i);
  if (vendorMatch) {
    supplierName = vendorMatch[1].trim();
    address = (vendorMatch[2] || '').trim();
    phone = (vendorMatch[3] || '').replace(/[^0-9+\-() ]/g, '').trim();
  }
  const emailMatch = text.match(/Email\s*:\s*([^\s\r\n]+@[^\s\r\n]+)/i);
  if (emailMatch) email = emailMatch[1].trim();
  const paymentMatch = text.match(/Payment[:\s]*([^\r\n]+)/i);
  if (paymentMatch) paymentTerms = paymentMatch[1].trim().slice(0, 80);

  // Infer supplier from filename: CMRP25080414-EPO001-00_ELECTROTRADE.pdf (primary - more reliable than vendor block)
  const supplierFromFile = (filename || '').match(/[-_]([A-Z0-9]+)\.pdf$/i);
  const supplierCode = supplierFromFile ? supplierFromFile[1].toUpperCase() : '';
  const SUPPLIER_NAMES = {
    ELECTROTRADE: 'ELECTROTRADE INDUSTRIES INC.',
    KAIROS: 'Kairos Electrical and Industrial Supply',
    ELESCOM: 'ELECTRICAL & EQUIPMENT SALES CO.',
    JJLAPP: 'JJLAPP (P) INC.',
    TAYAN: 'TAYAN ELECTRICAL & INDUSTRIAL COMPONENTS ENTERPRISES',
    DCPI: 'DCPI Distribution & Control Products, Inc.',
    RAS: 'RAS POWER SYSTEM CORPORATION',
    AMTI: 'ACCENT MICRO TECHNOLOGIES, INC.',
    FEPCOR: 'FEPCOR ELECTRICAL CORP',
    NETPAC: 'NET PACIFIC INC.',
    AVESCO: 'AVESCO Marketing Corp',
    HYPERTECH: 'HYPERTECH WIRE AND CABLE INC.',
    DOTX: 'DOT[X].SOLUTIONS',
    SHOPEE: 'SHOPEE PHILIPPINES',
    FALCONHUB: 'FALCONHUB LOGISTICS INC.',
    'AC DEANG': 'AC DEANG ELECTRICAL SUPPLY',
    AWS: 'AWS Distribution Phils., Corp',
    HIGHPOINT: 'HIGHPOINT SYSTEMS INC.',
    PRISMA: 'PRISMA ELECTRICAL CONTROLS CORP.',
    IMAXX: 'IMAXX ENERGIE SOLUTIONS CORP',
    MTECH: 'MTECH Industrial Automation Corporation',
    SHOTOKU: 'Shotoku Trading Corporation',
    ELECTRUM: 'ELECTRUM CONTROLS CORP.',
    DIFSYS: 'DIFSYS INC.',
    IAWORX: 'IAWORX SOLUTIONS & SERVICES INC.',
    WIN: 'WIN ELECTRONICS',
    AMTEK: 'AMTEK INDUSTRIAL CORP.',
    HANWIN: 'HANWIN ELECTRONICS',
    GOLDENRATIO: 'GOLDEN RATIO ELECTRO-AUTOMATION SYSTEM INC.',
    RSCOMPONENTS: 'RS COMPONENTS PHILIPPINES',
    ECA: 'ECA ELECTRICAL SUPPLY',
    ACTI: 'ADVANCE CONTROLE TECHNOLOGIE INC.',
    EXPLORER: 'EXPLORER FREIGHT CORP.',
    DATABLITZ: 'DATABLITZ',
    EXPONENT: 'EXPONENT CONTROLS & ELECTRICAL CORP.',
    ENCLOSURE: 'ENCLOSURE SYSTEMS PHILIPPINES',
    LAPP: 'LAPP (PHILIPPINES)',
    AK: 'AK ELECTRICAL',
  };
  if (SUPPLIER_NAMES[supplierCode]) {
    supplierName = SUPPLIER_NAMES[supplierCode];
  } else if (supplierFromFile && !supplierName) {
    supplierName = supplierCode.replace(/([A-Z])/g, ' $1').trim();
  }

  // Extract order date
  const dateMatch = text.match(/(\w+\s+\d{1,2},?\s+\d{4})/);
  const priceDate = dateMatch ? dateMatch[1].replace(/\s+/g, ' ') : '';

  // Parse line items: look for "qty unit unitPrice subtotal" pattern
  // e.g. "1 assy 187,752.68 187,752.68" or "2 assy 19,320.54 38,641.07"
  const itemPattern = /(\d+(?:\.\d+)?)\s+(assy|pcs|pc|unit|units|set|sets|lot|lots|mtrs|meters|roll|length|packs?|box|boxes)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;
  const qtyUnitPricePattern = /(\d+(?:\.\d+)?)\s+(assy|pcs|pc|unit|units|set|sets|lot|lots|mtrs|meters|roll|length|packs?|box|boxes)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;

  let match;
  const itemMatches = [];
  while ((match = qtyUnitPricePattern.exec(text)) !== null) {
    const qty = parseFloat(match[1]);
    const unit = (match[2] || 'pcs').toLowerCase().replace(/packs$/, 'pack');
    const unitPrice = parseFloat(match[3].replace(/,/g, ''));
    const subtotal = parseFloat(match[4].replace(/,/g, ''));
    if (unitPrice > 0 && unitPrice < 1e9) {
      itemMatches.push({ qty, unit, unitPrice, subtotal, index: match.index });
    }
  }

  // Build description from text before each match - exclude PO header/metadata
  const isHeaderLine = (line) => {
    if (!line || line.length < 2) return true;
    if (/^\w+\s+\d{1,2},?\s+\d{4}/.test(line)) return true; // "March 04, 2025"
    if (/P\.?O\s*No\.?/i.test(line)) return true;
    if (/Requisitioner:/i.test(line)) return true;
    if (/Subject:/i.test(line)) return true;
    if (/^No\.\s+CRN\s+Description/i.test(line)) return true;
    if (/^\d{2}-\d{4}$/.test(line)) return true; // "25-0120"
    if (/^Qty\s+MOQ\s+Unit/i.test(line)) return true;
    if (/^\d+\s+(assy|pcs|unit|lot)/i.test(line)) return true;
    if (/[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/.test(line)) return true;
    if (/^TOTAL PRICE|^12% VAT|^LESS DISCOUNT|^Quotation Reference|^Terms and Conditions|^Lead time:|^Important:/i.test(line)) return true;
    if (/^Item\s+\d+$/i.test(line)) return true; // "Item 7" placeholder
    if (line.includes('@') || /—\s*\S+@\S+/.test(line)) return true; // contact/email line
    if (/^[\w\s.-]+\s+—\s+/.test(line) && line.length < 120) return true; // "Name — email"
    return false;
  };
  // Line that is a continuation of previous (wrap from PDF): e.g. "D, Optidrive...", ".3 Manual Motor..."
  const isContinuationLine = (line) => /^[.,]\d*\s*[\w\s,]/.test(line) || /^[A-Z],\s*\w/.test(line);

  for (let i = 0; i < itemMatches.length; i++) {
    const curr = itemMatches[i];
    const start = i > 0 ? itemMatches[i - 1].index + 50 : 0;
    const chunk = text.slice(start, curr.index);
    const beforeLines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const descLines = [];
    for (let j = beforeLines.length - 1; j >= 0; j--) {
      const line = beforeLines[j];
      if (isHeaderLine(line)) {
        if (/^No\.\s+CRN\s+Description/i.test(line)) break;
        continue;
      }
      descLines.unshift(line);
    }
    // Merge continuation lines into the previous line (PDF line wrap)
    for (let k = 1; k < descLines.length; k++) {
      if (isContinuationLine(descLines[k])) {
        descLines[k - 1] = descLines[k - 1] + ' ' + descLines[k];
        descLines.splice(k, 1);
        k--;
      }
    }
    let desc = descLines.join(' ').trim().replace(/\s+/g, ' ').slice(0, 500);
    if (!desc) desc = `Item ${i + 1}`;
    // Skip rows that are only placeholder or contact junk
    if (/^Item\s+\d+$/i.test(desc)) continue;
    if (desc.includes('@') || /^[\w\s.-]+\s+—\s+\S+@/.test(desc)) continue;

    const partNo = '';
    const brand = '';
    rows.push([
      supplierName || 'Unknown',
      contact,
      email,
      phone,
      address,
      paymentTerms,
      desc,
      partNo,
      brand,
      desc,
      curr.unit,
      curr.unitPrice,
      priceDate,
    ]);
  }

  return { supplierName, contact, email, phone, address, paymentTerms, rows, priceDate };
}

/** Extract text from PDF, parse, log, return rows */
async function extractFromPdf(pdfPath) {
  const filename = path.basename(pdfPath);
  try {
    const data = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    await parser.destroy();

    const { rows, supplierName } = parsePOText(result.text, filename);

    if (rows.length > 0) {
      const logPath = path.join(LOG_DIR, filename.replace(/\.pdf$/i, '.txt'));
      const logContent = [
        `=== ${filename} ===`,
        `Supplier: ${supplierName}`,
        `Items extracted: ${rows.length}`,
        '',
        ...rows.map(
          (r, i) =>
            `${i + 1}. ${r[6]} | ${r[10]} | ${r[11]} | ${r[12]}`
        ),
        '',
      ].join('\n');
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.writeFileSync(logPath, logContent, 'utf8');
      console.log(`  [${filename}] ${rows.length} items -> ${path.basename(logPath)}`);
    }

    return rows;
  } catch (err) {
    console.error(`  [${filename}] Error: ${err.message}`);
    return [];
  }
}

/** Main: extract from all PDFs */
async function main() {
  console.log('Extracting items from PO PDFs...\n');
  const allRows = [];
  const seenDirs = new Set();

  for (const dir of PO_DIRS) {
    if (seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
    if (files.length === 0) continue;
    console.log(path.basename(path.dirname(dir)));
    for (const f of files) {
      const rows = await extractFromPdf(path.join(dir, f));
      allRows.push(...rows);
    }
    console.log('');
  }

  console.log(`\nTotal extracted: ${allRows.length} items`);
  console.log(`Logs written to: ${LOG_DIR}`);
  return allRows;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { extractFromPdf, parsePOText, main, PO_DIRS };
