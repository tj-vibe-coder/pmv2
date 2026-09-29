/**
 * Import: Siemens PLC / ET 200SP / SITOP prices (supplier quotes, 2026) into
 * the catalog (pricelist_items), so they show in Sales → Pricelists and
 * "Browse Catalog". The Siemens PLC configurator (src/utils/calcsheet/
 * siemensPlc.ts) carries the same prices as defaults and prefers a catalog
 * item with the same part number — keep the two in step.
 *
 * Usage:
 *   node scripts/import-pricelist-siemens.js
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/import-pricelist-siemens.js
 *
 * Idempotent: deterministic doc IDs (sie_<partNo>) — re-running overwrites
 * only these items.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

const COMMON = {
  // Vendor not recorded on the quotes — the supplier is the vendor, never IOCT.
  supplier: '',
  brand: 'Siemens',
  pricelistName: 'Siemens PLC quotes 2026',
  pricelistDate: '2026-09',
};

// [category, partNo, description, price]
const ROWS = [
  ['S7-1200', '6ES7214-1AG40-0XB0', 'SIMATIC S7-1200, CPU 1214C, compact CPU, DC/DC/DC, onboard I/O: 14 DI 24 V DC; 10 DO 24 V DC; 2 AI 0-10 V DC, power supply: DC 20.4-28.8 V DC, program/data memory 150 KB', 24059.81],
  ['S7-1200', '6ES7241-1CH30-1XB0', 'SIMATIC S7-1200, Communication Board CB 1241, RS485, terminal block, supports Freeport', 4995.65],
  ['S7-1500', '6ES7513-1AM03-0AB0', 'SIMATIC S7-1500, CPU 1513-1 PN, central processing unit with work memory 600 KB for program and 2.5 MB for data, 1st interface: PROFINET IRT with 2-port switch, 6 ns bit performance, SIMATIC Memory Card required', 124083.35],
  ['S7-1x00', '6ES7954-8LL04-0AA0', 'SIMATIC S7, memory card for S7-1x00 CPU, 3.3 V Flash, 256 MB', 19533.25],
  ['ET 200SP', '6ES7155-6AA02-0BN0', 'SIMATIC ET 200SP, bundle PROFINET interface module IM 155-6 PN ST, max. 32 I/O modules and 16 ET 200AL modules, bundle: interface module (6ES7155-6AU02-0BN0), server module (6ES7193-6PA00-0AA0), bus adapter BA 2x RJ45 (6ES7193-6AR00-0AA0)', 21697.11],
  ['ET 200SP', '6ES7131-6BH01-0BA0', 'SIMATIC ET 200SP, Digital input module, DI 16x 24V DC Standard, type 3 (IEC 61131), sink input (PNP, P-reading), fits to BU-type A0, Colour Code CC00', 6218.99],
  ['ET 200SP', '6ES7132-6BH01-0BA0', 'SIMATIC ET 200SP, Digital output module, DQ 16x 24V DC/0.5A Standard, Source output (PNP, P-switching), fits to BU-type A0, Colour Code CC00', 7255.57],
  ['ET 200SP', '6ES7134-6GF00-0AA1', 'SIMATIC ET 200SP, Analog input module, AI 8xI 2-/4-wire Basic, suitable for BU type A0, A1, Color code CC01, Module diagnostics, 16 bit', 16583.83],
  ['ET 200SP', '6ES7135-6HD00-0BA1', 'SIMATIC ET 200SP, Analog output module, AQ 4xU/I Standard, suitable for BU type A0, A1, Color code CC00, Module diagnostics, 16 bit, +/-0.3%', 14850.27],
  ['ET 200SP', '6ES7137-6AA01-0BA0', 'SIMATIC ET 200SP, CM PtP communication module for serial connection RS-422, RS-485 and RS-232, freeport, 3964 (R), USS, MODBUS RTU master, slave, max. 250 Kbit/s, suitable for BU type A0', 22526.27],
  ['ET 200SP', '6ES7193-6BP00-0BA0', 'SIMATIC ET 200SP, BaseUnit BU15-P16+A0+2B, BU type A0, Push-in terminals, without AUX terminals, bridged to the left, WxH: 15x 117 mm', 1105.71],
  ['ET 200SP', '6ES7193-6AR00-0AA0', 'SIMATIC ET 200SP, BusAdapter BA 2xRJ45, 2 RJ45 sockets', 3728.44],
  ['SITOP', '6EP1336-2BA10', 'SITOP PSU100S 20 A stabilized power supply input: 120/230 V AC output: 24 V DC/20 A', 27429.76],
  ['SITOP', '6EP1336-3BA10', 'SITOP PSU8200 20 A stabilized power supply input: 120-230 V AC 110-220 V DC output: 24 V DC/20 A', 33406.14],
];

const ITEMS = ROWS.map(([category, catalogNo, description, price]) => ({
  ...COMMON,
  category,
  categoryLabel: category,
  catalogNo,
  abbRefNo: '',
  description,
  uom: 'pc',
  sellingPrice: Number(price),
  sepEquivalent: null,
}));

async function importItems() {
  console.log(`Importing ${ITEMS.length} Siemens pricelist items...`);
  const batch = db.batch();
  for (const item of ITEMS) {
    const id = `sie_${item.catalogNo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
    batch.set(db.collection('pricelist_items').doc(id), {
      ...item,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Done — wrote ${ITEMS.length} items.`);
}

importItems().catch((err) => { console.error('Import failed:', err); process.exit(1); });
