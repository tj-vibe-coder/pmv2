/**
 * Import: IOCT Electrical Materials Pricelist 2026
 * (pipes, accessories, cables, cable trays — compiled from supplier prices)
 *
 * Usage:
 *   node scripts/import-pricelist-materials.js
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/import-pricelist-materials.js
 *
 * Idempotent: deterministic doc IDs (mat_<catalogNo>), re-running overwrites.
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
  // No single supplier — this is IOCT's internally compiled list; per-item
  // manufacturer lives in `brand`. IOCT itself is never a supplier.
  supplier: '',
  pricelistName: 'IOCT Electrical Materials 2026',
  pricelistDate: '2026-01',
};

// [catalogNo, description, uom, price, brand]
const PIPES = [
  ['EMT-1', 'EMT Pipe 1"', 'length', 428.13, 'Panasonic'],
  ['EMT-0.5', 'EMT Pipe 1/2"', 'length', 205.00, 'Panasonic'],
  ['EMT-0.75', 'EMT Pipe 3/4"', 'length', 537.50, 'Panasonic'],
  ['IMC-1', 'IMC Pipe 1"', 'length', 759.38, 'Panasonic'],
  ['IMC-0.5', 'IMC Pipe 1/2"', 'length', 392.50, 'Panasonic'],
  ['IMC-0.75', 'IMC Pipe 3/4"', 'length', 304.02, 'Panasonic'],
  ['LQT-1', 'LQT 1"', 'm', 137.50, 'Panasonic'],
  ['LQT-0.5', 'LQT 1/2"', 'm', 71.43, 'Panasonic'],
  ['LQT-0.75', 'LQT 3/4"', 'm', 98.21, 'Panasonic'],
  ['UNISTRUT-SLOT', 'Unistrut Channel - Slotted', 'length', 589.29, 'Mcgill'],
  ['ANGLEBAR-1', 'Angle Bar - 1"', 'length', 785.71, ''],
];

const ACCESSORIES = [
  ['CADDY-1', 'Unistrut Caddy Clamp - 1"', 'pc', 24.00, 'Mcgill'],
  ['CADDY-0.5', 'Unistrut Caddy Clamp - 1/2"', 'pc', 16.50, 'Mcgill'],
  ['CADDY-0.75', 'Unistrut Caddy Clamp - 3/4"', 'pc', 19.00, 'Mcgill'],
  ['HANGER-1', 'Conduit Hanger - 1"', 'pc', 24.00, 'Mcgill'],
  ['HANGER-0.5', 'Conduit Hanger - 1/2"', 'pc', 16.50, 'Mcgill'],
  ['HANGER-0.75', 'Conduit Hanger - 3/4"', 'pc', 19.00, 'Mcgill'],
  ['EMTCON-1', 'EMT Connector - 1"', 'pc', 25.00, 'Panasonic'],
  ['EMTCON-0.5', 'EMT Connector - 1/2"', 'pc', 11.16, 'Panasonic'],
  ['EMTCON-0.75', 'EMT Connector - 3/4"', 'pc', 20.00, 'Panasonic'],
  ['LQTCON-1', 'LQT Straight Connector - 1"', 'pc', 69.73, 'Mcgill'],
  ['LQTCON-0.5', 'LQT Straight Connector - 1/2"', 'pc', 31.25, 'Mcgill'],
  ['LQTCON-0.75', 'LQT Straight Connector - 3/4"', 'pc', 42.68, 'Mcgill'],
  ['IMCCPL-1', 'IMC Coupling - 1"', 'pc', 57.50, 'Panasonic'],
  ['IMCCPL-0.5', 'IMC Coupling - 1/2"', 'pc', 28.75, 'Panasonic'],
  ['IMCCPL-0.75', 'IMC Coupling - 3/4"', 'pc', 40.63, 'Panasonic'],
  ['CLAMP-SH-1', 'Metal Conduit Clamp Single Hole - 1"', 'pc', 17.41, 'Panasonic'],
  ['CLAMP-SH-0.5', 'Metal Conduit Clamp Single Hole - 1/2"', 'pc', 9.38, 'Panasonic'],
  ['CLAMP-SH-0.75', 'Metal Conduit Clamp Single Hole - 3/4"', 'pc', 12.50, 'Panasonic'],
  ['CLAMP-DH-1', 'Metal Conduit Clamp Double Hole - 1"', 'pc', 33.93, 'Panasonic'],
  ['CLAMP-DH-0.5', 'Metal Conduit Clamp Double Hole - 1/2"', 'pc', 17.86, 'Panasonic'],
  ['CLAMP-DH-0.75', 'Metal Conduit Clamp Double Hole - 3/4"', 'pc', 32.14, 'Panasonic'],
  ['UBOLT-1', 'Ubolt - 1"', 'pc', 7.59, 'Panasonic'],
  ['UBOLT-0.5', 'Ubolt - 1/2"', 'pc', 5.80, 'Panasonic'],
  ['UBOLT-0.75', 'Ubolt - 3/4"', 'pc', 6.70, 'Panasonic'],
  ['LOCKNUT-1', 'Lock nut with bushing - 1"', 'pc', 23.29, 'Panasonic'],
  ['LOCKNUT-0.5', 'Lock nut with bushing - 1/2"', 'pc', 12.30, 'Panasonic'],
  ['LOCKNUT-0.75', 'Lock nut with bushing - 3/4"', 'pc', 15.55, 'Panasonic'],
  ['JBOX-4X4', 'Junction Box 4x4 Metal', 'pc', 66.54, 'Quapcor'],
  ['PULLBOX-6', 'Pull Box 6x6x4', 'pc', 862.50, 'Fabricated'],
  ['PULLBOX-8', 'Pull Box 8x8x4', 'pc', 1001.12, 'Fabricated'],
  ['PULLBOX-10', 'Pull Box 10x10x4', 'pc', 1380.00, 'Fabricated'],
  ['PULLBOX-12', 'Pull Box 12x12x4', 'pc', 1897.50, 'Fabricated'],
];

const CABLES = [
  ['LAN-CAT6-OUT', 'LAN Cable Cat 6 Outdoor SFTP CAT6 4P Twisted Pair (305m/reel)', 'box', 7800.00, 'Belden'],
  ['MODBUS-9841', 'Modbus Cable 9841 Belden RS-485 24AWG 1 Twisted Pair, shielded (305m/reel)', 'box', 37991.07, 'Belden'],
  ['SHIELDED-9842', '2-wire shielded cable 9842 Belden RS-485 24AWG 2 Twisted Pairs (305m/reel)', 'box', 44151.79, 'Belden'],
  ['MC-4C-0.75', 'Multi Core, 4 Core with ground, 0.75mm', 'm', 111.50, 'Helukabel'],
  ['MC-7C-0.75', 'Multi Core, 7 Core with ground, 0.75mm', 'm', 120.90, 'Helukabel'],
  ['RC2-18', 'Royal Cord 2 wire - 18 AWG (0.75mm2)', 'm', 53.13, 'Duraflex/Philflex'],
  ['RC2-16', 'Royal Cord 2 wire - 16 AWG (1.25mm2)', 'm', 60.89, 'Duraflex/Philflex'],
  ['RC2-14', 'Royal Cord 2 wire - 14 AWG (2.0mm2)', 'm', 97.95, 'Duraflex/Philflex'],
  ['RC2-12', 'Royal Cord 2 wire - 12 AWG (3.5mm2)', 'm', 137.50, 'Duraflex/Philflex'],
  ['RC2-10', 'Royal Cord 2 wire - 10 AWG (5.5mm2)', 'm', 190.94, 'Duraflex/Philflex'],
  ['RC3-18', 'Royal Cord 3 wire - 18 AWG (0.75mm2)', 'm', 60.22, 'Duraflex/Philflex'],
  ['RC3-16', 'Royal Cord 3 wire - 16 AWG (1.25mm2)', 'm', 73.08, 'Duraflex/Philflex'],
  ['RC3-14', 'Royal Cord 3 wire - 14 AWG (2.0mm2)', 'm', 120.71, 'Duraflex/Philflex'],
  ['RC3-12', 'Royal Cord 3 wire - 12 AWG (3.5mm2)', 'm', 176.16, 'Duraflex/Philflex'],
  ['RC3-10', 'Royal Cord 3 wire - 10 AWG (5.5mm2)', 'm', 234.87, 'Duraflex/Philflex'],
];

const CABLE_TRAYS = [
  ['CT-CLOSED-80X50', 'Cable Tray Closed Type (Hinge cover) 80mmW x 50mmH x 2400mmL, powder-coated danger orange, w/ cover, connector, bolts & nuts', 'length', 2530.00, 'ICSS'],
  ['CT-SS-PERF-300X150', 'Stainless Steel Perforated Cable Tray w/ Cover Hinged Type 300mmW x 150mmH x 2400mmL', 'length', 18257.14, 'ICSS'],
];

const GROUPS = [
  ['Pipes & Others', PIPES],
  ['Accessories', ACCESSORIES],
  ['Cables', CABLES],
  ['Cable Trays', CABLE_TRAYS],
];

const ITEMS = [];
for (const [category, rows] of GROUPS) {
  for (const [catalogNo, description, uom, price, brand] of rows) {
    if (!(Number(price) > 0)) continue; // skip items without a price
    ITEMS.push({
      ...COMMON,
      catalogNo,
      abbRefNo: '',
      description,
      category,
      categoryLabel: category,
      uom,
      brand: brand || '',
      sellingPrice: Number(price),
      sepEquivalent: null,
    });
  }
}

async function importItems() {
  console.log(`Importing ${ITEMS.length} material pricelist items...`);
  const batch = db.batch();
  for (const item of ITEMS) {
    const id = `mat_${item.catalogNo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
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
