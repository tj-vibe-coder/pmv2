/**
 * One-time import: HVC DCPI ABB Pricelist March 2026
 *
 * Usage:
 *   node scripts/import-pricelist-dcpi-abb.js
 *   # or with explicit path:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/import-pricelist-dcpi-abb.js
 *
 * Requires: service account JSON (at repo root or via GOOGLE_APPLICATION_CREDENTIALS)
 * Idempotent: uses deterministic doc IDs, re-running overwrites existing docs
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// --- Firebase init ---
if (!admin.apps.length) {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '..', 'pmv2-851ae-firebase-adminsdk-fbsvc-c4d13e6cb1.json');
  if (fs.existsSync(saPath)) {
    const serviceAccount = require(saPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Fall back to Application Default Credentials (e.g. gcloud auth)
    admin.initializeApp();
  }
}
const db = admin.firestore();

// --- Helpers ---
function docId(catalogNo) {
  return `dcpi_abb_${catalogNo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
}

const COMMON = {
  supplier: 'HVC DCPI',
  brand: 'ABB',
  pricelistName: 'HVC DCPI ABB Pricelist March 2026',
  pricelistDate: '2026-03',
};

function makeItem(o) {
  return {
    ...COMMON,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...o,
  };
}

// Compact builders per product family
function sh200(cat, poles, dim, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, price, sep]) => ({
    catalogNo, abbRefNo,
    description: `${ampRating}AT ${poles}P 10Kaic@240V, 6Kaic@440V`,
    category: 'SH200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Compact Home',
    poles, ampRating, sellingPrice: price,
    sepEquivalent: sep || null,
    dimensions: dim,
  }));
}

function s200(poles, kaic, dim, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, price, sep]) => ({
    catalogNo, abbRefNo,
    description: `${ampRating}AT ${poles}P ${kaic}`,
    category: 'S200 C-Series', categoryLabel: 'Miniature Circuit Breaker - Commercial & Industrial',
    poles, ampRating, sellingPrice: price,
    sepEquivalent: sep || null,
    dimensions: dim,
  }));
}

function axSeries(coilVoltage, coilDesc, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, price, sep]) => ({
    catalogNo, abbRefNo,
    description: `${ampRating}A, 3P ${coilDesc}`,
    category: 'AX Series', categoryLabel: 'Magnetic Contactor and Overload Relay',
    poles: 3, ampRating, sellingPrice: price,
    sepEquivalent: sep || null,
    coilVoltage,
  }));
}

function taSeries(rows) {
  return rows.map(([catalogNo, abbRefNo, desc, price, sep]) => ({
    catalogNo, abbRefNo, description: desc,
    category: 'TA Series', categoryLabel: 'Thermal Overload Relay',
    sellingPrice: price, sepEquivalent: sep || null,
  }));
}

function formulaA(category, categoryLabel, frameSize, kaicDesc, poles, dim, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, price, sep]) => ({
    catalogNo, abbRefNo,
    description: `${ampRating}AT/${frameSize}AF ${poles}P ${kaicDesc}`,
    category, categoryLabel, poles, ampRating, frameSize,
    sellingPrice: price, sepEquivalent: sep || null,
    dimensions: dim, kaic: kaicDesc,
  }));
}

function tmaxXt(series, frameSize, kaicDesc, funcType, dim, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, desc, price, sep]) => ({
    catalogNo, abbRefNo, description: desc,
    category: 'TMAX XT', categoryLabel: `SACE Molded Case Circuit Breaker - TMAX XT Series`,
    poles: 3, ampRating, frameSize, sellingPrice: price,
    sepEquivalent: sep || null, dimensions: dim,
    kaic: kaicDesc,
  }));
}

function emaxSeries(series, frameSize, kaicDesc, dim, rows) {
  return rows.map(([catalogNo, abbRefNo, ampRating, desc, price, sep]) => ({
    catalogNo, abbRefNo, description: desc,
    category: 'EMAX 2', categoryLabel: 'SACE Air Circuit Breaker - EMAX 2 Series',
    poles: 3, ampRating, frameSize, sellingPrice: price,
    sepEquivalent: sep || null, dimensions: dim,
    kaic: kaicDesc,
  }));
}

// ==================== ALL ITEMS ====================

const ITEMS = [

  // ===== PAGE 1: SH200 C-SERIES =====
  // Single Pole (1P)
  ...sh200('SH200', 1, { w: 17.5, d: 69.0, h: 85.0 }, [
    ['SH201-C6',  '2CDS211001R0064',  6, 339.05, 'EZ9F56106'],
    ['SH201-C10', '2CDS211001R0104', 10, 339.05, 'EZ9F56110'],
    ['SH201-C16', '2CDS211001R0164', 16, 339.05, 'EZ9F56116'],
    ['SH201-C20', '2CDS211001R0204', 20, 339.05, 'EZ9F56120'],
    ['SH201-C25', '2CDS211001R0254', 25, 339.05, 'EZ9F56125'],
    ['SH201-C32', '2CDS211001R0324', 32, 339.05, 'EZ9F56132'],
    ['SH201-C40', '2CDS211001R0404', 40, 339.05, 'EZ9F56140'],
    ['SH201-C50', '2CDS211001R0504', 50, 424.16, 'EZ9F56150'],
    ['SH201-C63', '2CDS211001R0634', 63, 424.16, 'EZ9F56163'],
  ]),
  // 2-Pole (2P)
  ...sh200('SH200', 2, { w: 35.0, d: 69.0, h: 88.0 }, [
    ['SH202-C6',  '2CDS212001R0064',  6, 617.02, 'EZ9F56206'],
    ['SH202-C10', '2CDS212001R0104', 10, 617.02, 'EZ9F56210'],
    ['SH202-C16', '2CDS212001R0164', 16, 617.02, 'EZ9F56216'],
    ['SH202-C20', '2CDS212001R0204', 20, 617.02, 'EZ9F56220'],
    ['SH202-C25', '2CDS212001R0254', 25, 617.02, 'EZ9F56225'],
    ['SH202-C32', '2CDS212001R0324', 32, 617.02, 'EZ9F56232'],
    ['SH202-C40', '2CDS212001R0404', 40, 617.02, 'EZ9F56240'],
    ['SH202-C50', '2CDS212001R0504', 50, 768.70, 'EZ9F56250'],
    ['SH202-C63', '2CDS212001R0634', 63, 768.70, 'EZ9F56263'],
  ]),
  // 3-Pole (3P)
  ...sh200('SH200', 3, { w: 52.5, d: 69.0, h: 85.0 }, [
    ['SH203-C6',  '2CDS213001R0064',  6,  992.45, 'EZ9F56306'],
    ['SH203-C10', '2CDS213001R0104', 10,  992.45, 'EZ9F56310'],
    ['SH203-C16', '2CDS213001R0164', 16,  992.45, 'EZ9F56316'],
    ['SH203-C20', '2CDS213001R0204', 20,  992.45, 'EZ9F56320'],
    ['SH203-C25', '2CDS213001R0254', 25,  992.45, 'EZ9F56325'],
    ['SH203-C32', '2CDS213001R0324', 32,  992.45, 'EZ9F56332'],
    ['SH203-C40', '2CDS213001R0404', 40,  992.45, 'EZ9F56340'],
    ['SH203-C50', '2CDS213001R0504', 50, 1238.85, 'EZ9F56350'],
    ['SH203-C63', '2CDS213001R0634', 63, 1238.85, 'EZ9F56363'],
  ]),

  // ===== PAGE 2: S200 C-SERIES =====
  // Single Pole (1P)
  ...s200(1, '6Kaic@240V, 4.5Kaic@440V', { w: 17.5, d: 69.0, h: 88.0 }, [
    ['S201-C6',   '2CDS251001R0064',   6,  535.35, 'A9F74106'],
    ['S201-C10',  '2CDS251001R0104',  10,  408.37, 'A9F74110'],
    ['S201-C16',  '2CDS251001R0164',  16,  408.37, 'A9F74116'],
    ['S201-C20',  '2CDS251001R0204',  20,  408.37, 'A9F74120'],
    ['S201-C25',  '2CDS251001R0254',  25,  535.35, 'A9F74125'],
    ['S201-C32',  '2CDS251001R0324',  32,  535.35, 'A9F74132'],
    ['S201-C40',  '2CDS251001R0404',  40,  437.89, 'A9F74140'],
    ['S201-C50',  '2CDS251001R0504',  50,  682.91, 'A9F74150'],
    ['S201-C63',  '2CDS251001R0634',  63,  682.91, 'A9F74163'],
    ['S201-C80',  '2CDS251001R0804',  80, 2023.34, null],
    ['S201-C100', '2CDS251001R0824', 100, 2131.78, null],
  ]),
  // 2-Pole (2P)
  ...s200(2, '20Kaic@240V, 10Kaic@440V', { w: 35.0, d: 69.0, h: 88.0 }, [
    ['S202-C6',   '2CDS252001R0064',   6,  909.20, 'A9F74206'],
    ['S202-C10',  '2CDS252001R0104',  10,  831.16, 'A9F74210'],
    ['S202-C16',  '2CDS252001R0164',  16,  831.16, 'A9F74216'],
    ['S202-C20',  '2CDS252001R0204',  20,  831.16, 'A9F74220'],
    ['S202-C25',  '2CDS252001R0254',  25, 1020.59, 'A9F74225'],
    ['S202-C32',  '2CDS252001R0324',  32,  831.16, 'A9F74232'],
    ['S202-C40',  '2CDS252001R0404',  40,  975.77, 'A9F74240'],
    ['S202-C50',  '2CDS252001R0504',  50, 1054.22, 'A9F74250'],
    ['S202-C63',  '2CDS252001R0634',  63, 1054.22, 'A9F74263'],
    ['S202-C80',  '2CDS252001R0804',  80, 4056.28, null],
    ['S202-C100', '2CDS252001R0824', 100, 4265.61, null],
  ]),
  // 3-Pole (3P)
  ...s200(3, '20Kaic@240V, 10Kaic@440V', { w: 52.5, d: 69.0, h: 88.0 }, [
    ['S203-C6',   '2CDS253001R0064',   6, 1551.13, 'A9F74306'],
    ['S203-C10',  '2CDS253001R0104',  10, 1373.37, 'A9F74310'],
    ['S203-C16',  '2CDS253001R0164',  16, 1373.37, 'A9F74316'],
    ['S203-C20',  '2CDS253001R0204',  20, 1373.37, 'A9F74320'],
    ['S203-C25',  '2CDS253001R0254',  25, 1551.13, 'A9F74325'],
    ['S203-C32',  '2CDS253001R0324',  32, 1424.85, 'A9F74332'],
    ['S203-C40',  '2CDS253001R0404',  40, 1595.74, 'A9F74340'],
    ['S203-C50',  '2CDS253001R0504',  50, 2093.34, 'A9F74350'],
    ['S203-C63',  '2CDS253001R0634',  63, 2093.34, 'A9F74363'],
    ['S203-C80',  '2CDS253001R0804',  80, 4730.95, null],
    ['S203-C100', '2CDS253001R0824', 100, 4965.68, null],
  ]),

  // ===== PAGE 3: AX SERIES (Magnetic Contactor) =====
  // 110V Coil
  ...axSeries('110V', '110V 50Hz, 110-120V 60Hz', [
    ['AX09-30-10,110-120V',  '1SBL901074R8410',   9,  1075.70, 'LC1D09F7'],
    ['AX12-30-10,110-120V',  '1SBL911074R8410',  12,  1280.34, 'LC1D12F7'],
    ['AX18-30-10,110-120V',  '1SBL921074R8410',  18,  1570.26, 'LC1D18F7'],
    ['AX25-30-10,110-120V',  '1SBL931074R8410',  25,  2142.22, 'LC1D25F7'],
    ['AX32-30-10,110-120V',  '1SBL281074R8410',  32,  3223.16, 'LC1D32F7'],
    ['AX40-30-10,110-120V',  '1SBL321074R8410',  40,  3972.87, 'LC1D40F7'],
    ['AX50-30-11,110-120V',  '1SBL351074R8411',  50,  5819.27, 'LC1D50F7'],
    ['AX65-30-11,110-120V',  '1SBL371074R8411',  65,  6702.13, 'LC1D65F7'],
    ['AX80-30-11,110-120V',  '1SBL411074R8411',  80,  7673.54, 'LC1D80F7'],
    ['AX95-30-11,110-120V',  '1SFL431074R8411',  95,  9158.53, 'LC1D95F7'],
    ['AX115-30-11,110-120V', '1SFL981074R8411', 115, 12605.35, 'LC1D115F7'],
    ['AX185-30-11,110-120V', '1SFL491074R8411', 185, 17891.37, 'LC1F185F7'],
    ['AX205-30-11,110-120V', '1SFL501074R8411', 205, 23919.87, null],
    ['AX260-30-11,110-120V', '1SFL547074R8411', 260, 31634.08, null],
    ['AX300-30-11,110-120V', '1SFL587074R8411', 300, 33334.86, null],
    ['AX370-30-11,110-120V', '1SFL607074R8411', 370, 39993.70, 'LC1F330F7'],
  ]),
  // 230V Coil
  ...axSeries('230V', '230V 50Hz, 240-260V 60Hz', [
    ['AX09-30-10,230-240V',  '1SBL901074R8010',   9,  1075.70, 'LC1D09M7'],
    ['AX12-30-10,230-240V',  '1SBL911074R8010',  12,  1280.34, 'LC1D12M7'],
    ['AX18-30-10,230-240V',  '1SBL921074R8010',  18,  1570.26, 'LC1D18M7'],
    ['AX25-30-10,230-240V',  '1SBL931074R8010',  25,  2142.22, 'LC1D25M7'],
    ['AX32-30-10,230-240V',  '1SBL281074R8010',  32,  3223.16, 'LC1D32M7'],
    ['AX40-30-10,230-240V',  '1SBL321074R8010',  40,  3972.87, 'LC1D40M7'],
    ['AX50-30-11,230-240V',  '1SBL351074R8011',  50,  5819.27, 'LC1D50M7'],
    ['AX65-30-11,230-240V',  '1SBL371074R8011',  65,  6702.13, 'LC1D65M7'],
    ['AX80-30-11,230-240V',  '1SBL411074R8011',  80,  7673.54, 'LC1D80M7'],
    ['AX95-30-11,230-240V',  '1SFL431074R8011',  95,  9158.53, 'LC1D95M7'],
    ['AX115-30-11,230-240V', '1SFL981074R8011', 115, 12605.35, 'LC1D115M7'],
    ['AX185-30-11,230-240V', '1SFL491074R8011', 185, 17891.37, 'LC1F185M7'],
    ['AX205-30-11,230-240V', '1SFL501074R8011', 205, 23919.87, null],
    ['AX260-30-11,230-240V', '1SFL547074R8011', 260, 31634.08, null],
    ['AX300-30-11,230-240V', '1SFL587074R8011', 300, 33334.86, null],
    ['AX370-30-11,230-240V', '1SFL607074R8011', 370, 39993.70, 'LC1F330M7'],
  ]),

  // ===== PAGE 4: TA SERIES (Thermal Overload Relay) =====
  ...taSeries([
    ['TA25DU-0.16M', '1SAZ211201R2005', 'Setting Range 0.10-0.16A, FOR AX09~AX40', 1329.54, 'LRD01'],
    ['TA25DU-0.25M', '1SAZ211201R2009', 'Setting Range 0.16-0.25A, FOR AX09~AX40', 1329.54, 'LRD02'],
    ['TA25DU-0.4M',  '1SAZ211201R2013', 'Setting Range 0.25-0.40A, FOR AX09~AX40', 1166.87, null],
    ['TA25DU-0.63M', '1SAZ211201R2017', 'Setting Range 0.40-0.63A, FOR AX09~AX40', 1166.87, 'LRD04'],
    ['TA25DU-1.0M',  '1SAZ211201R2021', 'Setting Range 0.63-1.00A, FOR AX09~AX40', 1003.55, 'LRD05'],
    ['TA25DU-1.4M',  '1SAZ211201R2023', 'Setting Range 1.00-1.40A, FOR AX09~AX40', 1166.87, 'LRD06'],
    ['TA25DU-1.8M',  '1SAZ211201R2025', 'Setting Range 1.30-1.80A, FOR AX09~AX40', 1166.87, 'LRD06'],
    ['TA25DU-2.4M',  '1SAZ211201R2028', 'Setting Range 1.70-2.40A, FOR AX09~AX40', 1166.87, 'LRD07'],
    ['TA25DU-3.1M',  '1SAZ211201R2031', 'Setting Range 2.20-3.10A, FOR AX09~AX40', 1003.55, 'LRD08'],
    ['TA25DU-4.0M',  '1SAZ211201R2033', 'Setting Range 2.80-4.00A, FOR AX09~AX40', 1003.55, 'LRD08'],
    ['TA25DU-5.0M',  '1SAZ211201R2035', 'Setting Range 3.50-5.00A, FOR AX09~AX40', 1003.55, 'LRD10'],
    ['TA25DU-6.5M',  '1SAZ211201R2038', 'Setting Range 4.50-6.50A, FOR AX09~AX40', 1003.55, 'LRD10'],
    ['TA25DU-8.5M',  '1SAZ211201R2040', 'Setting Range 6.00-8.50A, FOR AX09~AX40', 1003.55, 'LRD12'],
    ['TA25DU-11M',   '1SAZ211201R2043', 'Setting Range 7.50-11.00A, FOR AX09~AX40', 1003.55, 'LRD14'],
    ['TA25DU-14M',   '1SAZ211201R2045', 'Setting Range 10.00-14.00A, FOR AX09~AX40', 1166.87, 'LRD16'],
    ['TA25DU-19M',   '1SAZ211201R2047', 'Setting Range 13.00-19.00A, FOR AX09~AX40', 1586.00, 'LRD21'],
    ['TA25DU-25M',   '1SAZ211201R2051', 'Setting Range 18.00-25.00A, FOR AX09~AX40', 1586.00, 'LRD22'],
    ['TA25DU-32M',   '1SAZ211201R2053', 'Setting Range 24.00-32.00A, FOR AX09~AX40', 1824.75, 'LRD32'],
    ['TA42DU-25M',   '1SAZ311201R2001', 'Setting Range 18.00-25.00A, FOR AX30~AX40', 3233.66, null],
    ['TA42DU-32M',   '1SAZ311201R2002', 'Setting Range 22.00-32.00A, FOR AX30~AX40', 3233.66, null],
    ['TA42DU-42M',   '1SAZ311201R2003', 'Setting Range 29.00-42.00A, FOR AX30~AX40', 3233.66, null],
    ['TA75DU-25M',   '1SAZ321201R2001', 'Setting Range 18.00-25.00A, FOR AX50~AX80', 3305.15, null],
    ['TA75DU-32M',   '1SAZ321201R2002', 'Setting Range 22.00-32.00A, FOR AX50~AX80', 3305.15, null],
    ['TA75DU-42M',   '1SAZ321201R2003', 'Setting Range 29.00-42.00A, FOR AX50~AX80', 3305.15, null],
    ['TA75DU-52M',   '1SAZ321201R2004', 'Setting Range 36.00-52.00A, FOR AX50~AX80', 3305.15, null],
    ['TA75DU-63M',   '1SAZ321201R2005', 'Setting Range 45.00-63.00A, FOR AX50~AX80', 3393.70, null],
    ['TA75DU-80M',   '1SAZ321201R2006', 'Setting Range 60.00-80.00A, FOR AX50~AX80', 3652.13, null],
  ]),

  // ===== PAGE 5: FORMULA A1 — A1A (10Kaic) & A1B (25Kaic/18Kaic) =====
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '10Kaic@240V, 10Kaic@415V', 3, { w: 76.2, d: 60.0, h: 130.0 }, [
    ['A1A125STMF015-3P',  '1SDA066510R1',  15, 2937.60, 'EZC100F3015'],
    ['A1A125STMF020-3P',  '1SDA066511R1',  20, 2937.60, 'EZC100F3020'],
    ['A1A125STMF030-3P',  '1SDA066513R1',  30, 2937.60, 'EZC100F3030'],
    ['A1A125STMF040-3P',  '1SDA066514R1',  40, 2937.60, 'EZC100F3040'],
    ['A1A125STMF050-3P',  '1SDA066515R1',  50, 2937.60, 'EZC100F3050'],
    ['A1A125STMF060-3P',  '1SDA066516R1',  60, 3157.47, 'EZC100F3060'],
    ['A1A125STMF070-3P',  '1SDA066517R1',  70, 3157.47, 'EZC100F3075'],
    ['A1A125STMF080-3P',  '1SDA066518R1',  80, 3157.47, 'EZC100F3080'],
    ['A1A125STMF100-3P',  '1SDA066520R1', 100, 3157.47, 'EZC100F3100'],
    ['A1A125STMF125-3P',  '1SDA066521R1', 125, 3789.36, null],
  ]),
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '25Kaic@240V, 18Kaic@415V', 3, { w: 76.2, d: 60.0, h: 130.0 }, [
    ['A1B125STMF015-3P',  '1SDA066697R1',  15, 3176.62, 'EZC100F3015'],
    ['A1B125STMF020-3P',  '1SDA066698R1',  20, 3176.62, 'EZC100F3020'],
    ['A1B125STMF030-3P',  '1SDA066700R1',  30, 3176.62, 'EZC100F3030'],
    ['A1B125STMF040-3P',  '1SDA066701R1',  40, 3176.62, 'EZC100F3040'],
    ['A1B125STMF050-3P',  '1SDA066702R1',  50, 3176.62, 'EZC100F3050'],
    ['A1B125STMF060-3P',  '1SDA066703R1',  60, 3415.64, 'EZC100F3060'],
    ['A1B125STMF070-3P',  '1SDA066704R1',  70, 3415.64, 'EZC100F3075'],
    ['A1B125STMF080-3P',  '1SDA066705R1',  80, 3415.64, 'EZC100F3080'],
    ['A1B125STMF100-3P',  '1SDA066707R1', 100, 3415.64, 'EZC100F3100'],
    ['A1B125STMF125-3P',  '1SDA066708R1', 125, 4099.03, null],
  ]),

  // ===== PAGE 6: FORMULA A1 — A1C (1P & 3P) =====
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '18Kaic@240V, 2.5Kaic@415V', 1, { w: 25.4, d: 60.0, h: 130.0 }, [
    ['A1C125STMF016-1P',  '1SDA068745R1',  16, 1884.45, 'EZC100N1015'],
    ['A1C125STMF020-1P',  '1SDA066486R1',  20, 1884.45, 'EZC100N1020'],
    ['A1C125STMF030-1P',  '1SDA066488R1',  30, 1884.45, 'EZC100N1030'],
    ['A1C125STMF040-1P',  '1SDA066489R1',  40, 1884.45, 'EZC100N1040'],
    ['A1C125STMF050-1P',  '1SDA066490R1',  50, 1884.45, 'EZC100N1050'],
    ['A1C125STMF060-1P',  '1SDA066491R1',  60, 2025.75, 'EZC100N1060'],
    ['A1C125STMF070-1P',  '1SDA066492R1',  70, 2025.75, 'EZC100N1075'],
    ['A1C125STMF080-1P',  '1SDA066493R1',  80, 2025.75, 'EZC100N1080'],
    ['A1C125STMF100-1P',  '1SDA066495R1', 100, 2025.75, 'EZC100N1100'],
    ['A1C125STMF125-1P',  '1SDA066496R1', 125, 2431.16, null],
  ]),
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '30Kaic@240V, 25Kaic@415V', 3, { w: 76.2, d: 60.0, h: 130.0 }, [
    ['A1C125STMF016-3P',  '1SDA068748R1',  16, 3364.80, 'EZC100N3015'],
    ['A1C125STMF020-3P',  '1SDA066710R1',  20, 3364.80, 'EZC100N3020'],
    ['A1C125STMF030-3P',  '1SDA066712R1',  30, 3364.80, 'EZC100N3030'],
    ['A1C125STMF040-3P',  '1SDA066713R1',  40, 3364.80, 'EZC100N3040'],
    ['A1C125STMF050-3P',  '1SDA066714R1',  50, 3364.80, 'EZC100N3050'],
    ['A1C125STMF060-3P',  '1SDA066715R1',  60, 3618.35, 'EZC100N3060'],
    ['A1C125STMF070-3P',  '1SDA066716R1',  70, 3618.35, 'EZC100N3070'],
    ['A1C125STMF080-3P',  '1SDA066717R1',  80, 3618.35, 'EZC100N3080'],
    ['A1C125STMF100-3P',  '1SDA066719R1', 100, 3618.35, 'EZC100N3100'],
    ['A1C125STMF125-3P',  '1SDA066720R1', 125, 4342.02, null],
  ]),

  // ===== PAGE 7: FORMULA A1 — A1N (1P, 2P, 3P) =====
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '25Kaic@240V, 5Kaic@415V', 1, { w: 25.4, d: 60.0, h: 130.0 }, [
    ['A1N125STMF020-1P',  '1SDA066682R1',  20, 2166.39, 'EZC100H1020'],
    ['A1N125STMF030-1P',  '1SDA066688R1',  30, 2166.39, 'EZC100H1030'],
    ['A1N125STMF040-1P',  '1SDA066689R1',  40, 2166.39, 'EZC100H1040'],
    ['A1N125STMF050-1P',  '1SDA066690R1',  50, 2166.39, 'EZC100H1050'],
    ['A1N125STMF060-1P',  '1SDA066691R1',  60, 2329.48, 'EZC100H1060'],
    ['A1N125STMF070-1P',  '1SDA066692R1',  70, 2329.48, 'EZC100H1075'],
    ['A1N125STMF080-1P',  '1SDA066693R1',  80, 2329.48, 'EZC100H1080'],
    ['A1N125STMF100-1P',  '1SDA066695R1', 100, 2329.48, 'EZC100H1100'],
    ['A1N125STMF125-1P',  '1SDA066696R1', 125, 2794.97, null],
  ]),
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '50Kaic@240V, 36Kaic@415V', 2, { w: 50.8, d: 60.0, h: 130.0 }, [
    ['A1N125STMF016-2P',  '1SDA066596R1',  16, 2707.16, 'EZC100H2015'],
    ['A1N125STMF020-2P',  '1SDA066597R1',  20, 2707.16, 'EZC100H2020'],
    ['A1N125STMF030-2P',  '1SDA066499R1',  30, 2707.16, 'EZC100H2030'],
    ['A1N125STMF040-2P',  '1SDA066500R1',  40, 2707.16, 'EZC100H2040'],
    ['A1N125STMF050-2P',  '1SDA066501R1',  50, 2707.16, 'EZC100H2050'],
    ['A1N125STMF060-2P',  '1SDA066502R1',  60, 2911.18, 'EZC100H2060'],
    ['A1N125STMF070-2P',  '1SDA066503R1',  70, 2911.18, 'EZC100H2075'],
    ['A1N125STMF080-2P',  '1SDA066504R1',  80, 2911.18, 'EZC100H2080'],
    ['A1N125STMF100-2P',  '1SDA066421R1', 100, 2911.18, 'EZC100H2100'],
    ['A1N125STMF125-2P',  '1SDA066502R1', 125, 3493.55, null],
  ]),
  ...formulaA('Formula A1', 'SACE Molded Case Circuit Breaker - Formula A1 Series', 125, '100Kaic@240V, 36Kaic@415V', 3, { w: 76.2, d: 60.0, h: 130.0 }, [
    ['A1N125STMF016-3P',  '1SDA068749R1',  16, 3867.93, 'EZC100H3015'],
    ['A1N125STMF020-3P',  '1SDA066824R1',  20, 3867.93, 'EZC100H3020'],
    ['A1N125STMF030-3P',  '1SDA066826R1',  30, 3867.93, 'EZC100H3030'],
    ['A1N125STMF040-3P',  '1SDA066735R1',  40, 3867.93, 'EZC100H3040'],
    ['A1N125STMF050-3P',  '1SDA066726R1',  50, 3867.93, 'EZC100H3050'],
    ['A1N125STMF060-3P',  '1SDA066727R1',  60, 4158.46, 'EZC100H3060'],
    ['A1N125STMF070-3P',  '1SDA066728R1',  70, 4158.46, 'EZC100H3075'],
    ['A1N125STMF080-3P',  '1SDA066729R1',  80, 4158.46, 'EZC100H3080'],
    ['A1N125STMF100-3P',  '1SDA066731R1', 100, 4158.46, 'EZC100H3100'],
    ['A1N125STMF125-3P',  '1SDA066732R1', 125, 4990.41, null],
  ]),

  // ===== PAGE 8: FORMULA A2 =====
  // A2B 3P 250AF, 25Kaic@240V, 18Kaic@415V
  ...formulaA('Formula A2', 'SACE Molded Case Circuit Breaker - Formula A2 Series', 250, '25Kaic@240V, 18Kaic@415V', 3, { w: 105.0, d: 60.0, h: 150.0 }, [
    ['A2B250TMF125-3P',  '1SDA066548R1', 125, 7580.70, 'EZC250F3125'],
    ['A2B250TMF160-3P',  '1SDA066549R1', 160, 7580.70, 'EZC250F3160'],
    ['A2B250TMF175-3P',  '1SDA066550R1', 175, 7580.70, 'EZC250F3175'],
    ['A2B250TMF200-3P',  '1SDA066551R1', 200, 7580.70, 'EZC250F3200'],
    ['A2B250TMF225-3P',  '1SDA066552R1', 225, 8151.84, 'EZC250F3225'],
    ['A2B250TMF250-3P',  '1SDA066553R1', 250, 8151.84, 'EZC250F3250'],
  ]),
  // A2C 3P 250AF, 50Kaic@240V, 25Kaic@415V
  ...formulaA('Formula A2', 'SACE Molded Case Circuit Breaker - Formula A2 Series', 250, '50Kaic@240V, 25Kaic@415V', 3, { w: 105.0, d: 60.0, h: 150.0 }, [
    ['A2C250TMF125-3P',  '1SDA066775R1', 125, 8307.01, 'EZC250N3125'],
    ['A2C250TMF160-3P',  '1SDA066776R1', 160, 8307.01, 'EZC250N3160'],
    ['A2C250TMF175-3P',  '1SDA066777R1', 175, 8307.01, 'EZC250N3175'],
    ['A2C250TMF200-3P',  '1SDA066778R1', 200, 8307.01, 'EZC250N3200'],
    ['A2C250TMF225-3P',  '1SDA066779R1', 225, 8933.62, 'EZC250N3225'],
    ['A2C250TMF250-3P',  '1SDA066780R1', 250, 8933.62, 'EZC250N3250'],
  ]),
  // A2N 2P 250AF, 50Kaic@240V, 36Kaic@415V
  ...formulaA('Formula A2', 'SACE Molded Case Circuit Breaker - Formula A2 Series', 250, '50Kaic@240V, 36Kaic@415V', 2, { w: 70.0, d: 60.0, h: 150.0 }, [
    ['A2N250TMF125-2P',  '1SDA066542R1', 125, 6415.96, 'EZC250H2125'],
    ['A2N250TMF160-2P',  '1SDA066543R1', 160, 6415.96, 'EZC250H2160'],
    ['A2N250TMF175-2P',  '1SDA066544R1', 175, 6415.96, 'EZC250H2175'],
    ['A2N250TMF200-2P',  '1SDA066545R1', 200, 6415.96, 'EZC250H2200'],
    ['A2N250TMF225-2P',  '1SDA066546R1', 225, 6898.63, 'EZC250H2225'],
    ['A2N250TMF250-2P',  '1SDA066547R1', 250, 6898.63, 'EZC250H2250'],
  ]),
  // A2N 3P 250AF, 85Kaic@240V, 36Kaic@415V
  ...formulaA('Formula A2', 'SACE Molded Case Circuit Breaker - Formula A2 Series', 250, '85Kaic@240V, 36Kaic@415V', 3, { w: 105.0, d: 60.0, h: 150.0 }, [
    ['A2N250TMF125-3P',  '1SDA066781R1', 125, 9166.04, 'EZC250H3125'],
    ['A2N250TMF160-3P',  '1SDA066782R1', 160, 9166.04, 'EZC250H3160'],
    ['A2N250TMF175-3P',  '1SDA066783R1', 175, 9166.04, 'EZC250H3175'],
    ['A2N250TMF200-3P',  '1SDA066784R1', 200, 9166.04, 'EZC250H3200'],
    ['A2N250TMF225-3P',  '1SDA066785R1', 225, 9855.37, 'EZC250H3225'],
    ['A2N250TMF250-3P',  '1SDA066786R1', 250, 9855.37, 'EZC250H3250'],
  ]),

  // ===== PAGE 9: FORMULA A3 =====
  ...formulaA('Formula A3', 'SACE Molded Case Circuit Breaker - Formula A3 Series', 400, '85Kaic@240V, 36Kaic@415V', 3, { w: 139.5, d: 103.5, h: 205.0 }, [
    ['A3N400TMF320-3P',  '1SDA066560R1', 320, 17729.24, 'EZC400N3320'],
    ['A3N400TMF400-3P',  '1SDA066561R1', 400, 17729.24, 'EZC400N3400'],
  ]),
  ...formulaA('Formula A3', 'SACE Molded Case Circuit Breaker - Formula A3 Series', 630, '85Kaic@240V, 36Kaic@415V', 3, { w: 139.5, d: 103.5, h: 205.0 }, [
    ['A3N630TMF500-3P',  '1SDA066564R1', 500, 22003.91, 'EZC630N3500'],
  ]),
  { catalogNo: 'A3N630ELT630-3P', abbRefNo: '1SDA066566R1', description: '630AT/630AF 3P ELT TRIP LI 85Kaic@240V, 36Kaic@415V', category: 'Formula A3', categoryLabel: 'SACE Molded Case Circuit Breaker - Formula A3 Series', poles: 3, ampRating: 630, frameSize: 630, sellingPrice: 24025.03, sepEquivalent: 'EZC630N3600', dimensions: { w: 139.5, d: 103.5, h: 205.0 }, kaic: '85Kaic@240V, 36Kaic@415V' },
  ...formulaA('Formula A3', 'SACE Molded Case Circuit Breaker - Formula A3 Series', 400, '100Kaic@240V, 50Kaic@415V', 3, { w: 139.5, d: 103.5, h: 205.0 }, [
    ['A3S400TMF320-3P',  '1SDA066562R1', 320, 19834.22, 'EZC400H3320'],
    ['A3S400TMF400-3P',  '1SDA066563R1', 400, 19834.22, 'EZC400H3400'],
  ]),
  ...formulaA('Formula A3', 'SACE Molded Case Circuit Breaker - Formula A3 Series', 630, '100Kaic@240V, 50Kaic@415V', 3, { w: 139.5, d: 103.5, h: 205.0 }, [
    ['A3S630TMF500-3P',  '1SDA066565R1', 500, 25821.00, 'EZC630H3500'],
  ]),
  { catalogNo: 'A3S630ELT630-3P', abbRefNo: '1SDA066567R1', description: '630AT/630AF 3P ELT TRIP LI 100Kaic@240V, 50Kaic@415V', category: 'Formula A3', categoryLabel: 'SACE Molded Case Circuit Breaker - Formula A3 Series', poles: 3, ampRating: 630, frameSize: 630, sellingPrice: 28192.73, sepEquivalent: 'EZC630H3600', dimensions: { w: 139.5, d: 103.5, h: 205.0 }, kaic: '100Kaic@240V, 50Kaic@415V' },

  // ===== PAGE 10: TMAX XT (160A Frame) =====
  // XT1N TMD 36Kaic@415V
  ...tmaxXt('XT1N', 160, '36Kaic@415V', 'TMD', { w: 76.2, d: 70.0, h: 130.0 }, [
    ['XT1N-32',  '1SDA067411R1',  32, 'XT1N 160 TMD 32-450 3p F F',      7953.25, 'NSX'],
    ['XT1N-40',  '1SDA067412R1',  40, 'XT1N 160 TMD 40-450 3p F F',      7953.25, 'NSX'],
    ['XT1N-50',  '1SDA067413R1',  50, 'XT1N 160 TMD 50-500 3p F F',      7953.25, 'NSX'],
    ['XT1N-63',  '1SDA067414R1',  63, 'XT1N 160 TMD 63-630 3p F F',      7953.25, 'NSX'],
    ['XT1N-80',  '1SDA067415R1',  80, 'XT1N 160 TMD 80-800 3p F F',      9460.51, 'NSX'],
    ['XT1N-100', '1SDA067416R1', 100, 'XT1N 160 TMD 100-1000 3p F F',    9460.51, 'NSX'],
    ['XT1N-125', '1SDA067417R1', 125, 'XT1N 160 TMD 125-1250 3p F F',    9729.55, 'NSX'],
    ['XT1N-160', '1SDA067418R1', 160, 'XT1N 160 TMD 160-1600 3p F F',   10998.60, 'NSX'],
  ]),
  // XT2N LS/I 36Kaic@415V (LI Function)
  ...tmaxXt('XT2N', 160, '36Kaic@415V', 'LI', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2N-10-LI',  '1SDA067054R1',  10, 'XT2N 160 Ekip LS/I In=10A 3p F F',  18661.73, 'NSX'],
    ['XT2N-25-LI',  '1SDA067055R1',  25, 'XT2N 160 Ekip LS/I In=25A 3p F F',  18661.73, 'NSX'],
    ['XT2N-63-LI',  '1SDA067056R1',  63, 'XT2N 160 Ekip LS/I In=63A 3p F F',  18661.73, 'NSX'],
    ['XT2N-100-LI', '1SDA067057R1', 100, 'XT2N 160 Ekip LS/I In=100A 3p F F', 18661.73, 'NSX'],
    ['XT2N-160-LI', '1SDA067058R1', 160, 'XT2N 160 Ekip LS/I In=160A 3p F F', 20595.45, 'NSX'],
  ]),
  // XT2N LSIG 36Kaic@415V
  ...tmaxXt('XT2N', 160, '36Kaic@415V', 'LSIG', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2N-10-LSIG',  '1SDA067072R1',  10, 'XT2N 160 Ekip LSIG In=10A 3p F F',  41441.22, 'NSX'],
    ['XT2N-25-LSIG',  '1SDA067073R1',  25, 'XT2N 160 Ekip LSIG In=25A 3p F F',  41441.22, 'NSX'],
    ['XT2N-63-LSIG',  '1SDA067074R1',  63, 'XT2N 160 Ekip LSIG In=63A 3p F F',  41441.22, 'NSX'],
    ['XT2N-100-LSIG', '1SDA067075R1', 100, 'XT2N 160 Ekip LSIG In=100A 3p F F', 41441.22, 'NSX'],
    ['XT2N-160-LSIG', '1SDA067076R1', 160, 'XT2N 160 Ekip LSIG In=160A 3p F F', 44831.57, 'NSX'],
  ]),
  // XT2S LI 50Kaic@415V
  ...tmaxXt('XT2S', 160, '50Kaic@415V', 'LI', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2S-10-LI',  '1SDA067600R1',  10, 'XT2S 160 Ekip LS/I In=10A 3p F F',  20048.99, 'NSX'],
    ['XT2S-25-LI',  '1SDA067801R1',  25, 'XT2S 160 Ekip LS/I In=25A 3p F F',  20048.99, 'NSX'],
    ['XT2S-63-LI',  '1SDA067802R1',  63, 'XT2S 160 Ekip LS/I In=63A 3p F F',  20048.99, 'NSX'],
    ['XT2S-100-LI', '1SDA067803R1', 100, 'XT2S 160 Ekip LS/I In=100A 3p F F', 20048.99, 'NSX'],
    ['XT2S-160-LI', '1SDA067804R1', 160, 'XT2S 160 Ekip LS/I In=160A 3p F F', 21981.51, 'NSX'],
  ]),
  // XT2S LSIG 50Kaic@415V
  ...tmaxXt('XT2S', 160, '50Kaic@415V', 'LSIG', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2S-10-LSIG',  '1SDA067813R1',  10, 'XT2S 160 Ekip LSIG In=10A 3p F F',  42827.88, 'NSX'],
    ['XT2S-25-LSIG',  '1SDA067817R1',  25, 'XT2S 160 Ekip LSIG In=25A 3p F F',  42827.88, 'NSX'],
    ['XT2S-63-LSIG',  '1SDA067818R1',  63, 'XT2S 160 Ekip LSIG In=63A 3p F F',  42827.88, 'NSX'],
    ['XT2S-100-LSIG', '1SDA067819R1', 100, 'XT2S 160 Ekip LSIG In=100A 3p F F', 42827.88, 'NSX'],
    ['XT2S-160-LSIG', '1SDA067804E1', 160, 'XT2S 160 Ekip LSIG In=160A 3p F F', 46218.84, 'NSX'],
  ]),
  // XT2H LI 70Kaic@415V
  ...tmaxXt('XT2H', 160, '70Kaic@415V', 'LI', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2H-10-LI',  '1SDA067857R1',  10, 'XT2H 160 Ekip LS/I In=10A 3p F F',  21696.82, 'NSX'],
    ['XT2H-25-LI',  '1SDA067858R1',  25, 'XT2H 160 Ekip LS/I In=25A 3p F F',  21696.82, 'NSX'],
    ['XT2H-63-LI',  '1SDA067859R1',  63, 'XT2H 160 Ekip LS/I In=63A 3p F F',  21696.82, 'NSX'],
    ['XT2H-100-LI', '1SDA067860R1', 100, 'XT2H 160 Ekip LS/I In=100A 3p F F', 21696.82, 'NSX'],
    ['XT2H-160-LI', '1SDA067861R1', 160, 'XT2H 160 Ekip LS/I In=160A 3p F F', 23629.94, 'NSX'],
  ]),
  // XT2H LSIG 70Kaic@415V
  ...tmaxXt('XT2H', 160, '70Kaic@415V', 'LSIG', { w: 90.0, d: 82.5, h: 130.0 }, [
    ['XT2H-10-LSIG',  '1SDA067872R1',  10, 'XT2H 160 Ekip LSIG In=10A 3p F F',  44474.50, 'NSX'],
    ['XT2H-25-LSIG',  '1SDA067873R1',  25, 'XT2H 160 Ekip LSIG In=25A 3p F F',  44474.50, 'NSX'],
    ['XT2H-63-LSIG',  '1SDA067874R1',  63, 'XT2H 160 Ekip LSIG In=63A 3p F F',  44474.50, 'NSX'],
    ['XT2H-100-LSIG', '1SDA067875R1', 100, 'XT2H 160 Ekip LSIG In=100A 3p F F', 44474.50, 'NSX'],
    ['XT2H-160-LSIG', '1SDA067876R1', 160, 'XT2H 160 Ekip LSIG In=160A 3p F F', 47865.46, 'NSX'],
  ]),

  // ===== PAGE 11: TMAX XT (250A Frame) =====
  // XT3N TMD 36Kaic@415V
  ...tmaxXt('XT3N', 250, '36Kaic@415V', 'TMD', { w: 105.0, d: 70.0, h: 150.0 }, [
    ['XT3N-63',  '1SDA068053R1',  63, 'XT3N 250 TMD 63-630 3p F F',     14350.95, 'NSX'],
    ['XT3N-80',  '1SDA068054R1',  80, 'XT3N 250 TMD 80-800 3p F F',     14350.95, 'NSX'],
    ['XT3N-100', '1SDA068055R1', 100, 'XT3N 250 TMD 100-1000 3p F F',   14350.95, 'NSX'],
    ['XT3N-125', '1SDA068056R1', 125, 'XT3N 250 TMD 125-1250 3p F F',   14350.95, 'NSX'],
    ['XT3N-160', '1SDA068057R1', 160, 'XT3N 250 TMD 160-1600 3p F F',   14350.95, 'NSX'],
    ['XT3N-200', '1SDA068058R1', 200, 'XT3N 250 TMD 200-2000 3p F F',   15945.10, 'NSX'],
    ['XT3N-250', '1SDA068059R1', 250, 'XT3N 250 TMD 200-2500 3p F F',   15945.10, 'NSX'],
  ]),
  // XT4N LI 36Kaic@415V
  ...tmaxXt('XT4N', 250, '36Kaic@415V', 'LI', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4N-40-LI',  '1SDA068122R1',  40, 'XT4N 160 Ekip LS/I In=40A 3p F F',  23692.67, 'NSX'],
    ['XT4N-63-LI',  '1SDA068123R1',  63, 'XT4N 160 Ekip LS/I In=63A 3p F F',  23692.67, 'NSX'],
    ['XT4N-100-LI', '1SDA068124R1', 100, 'XT4N 160 Ekip LS/I In=100A 3p F F', 23692.67, 'NSX'],
    ['XT4N-150-LI', '1SDA068125R1', 150, 'XT4N 160 Ekip LS/I In=160A 3p F F', 23692.67, 'NSX'],
    ['XT4N-250-LI', '1SDA068126R1', 250, 'XT4N 250 Ekip LS/I In=250A 3p F F', 24658.93, 'NSX'],
  ]),
  // XT4N LSIG 36Kaic@415V
  ...tmaxXt('XT4N', 250, '36Kaic@415V', 'LSIG', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4N-40-LSIG',  '1SDA068137R1',  40, 'XT4N 160 Ekip LSIG In=40A 3p F F',  53980.28, 'NSX'],
    ['XT4N-63-LSIG',  '1SDA068138R1',  63, 'XT4N 160 Ekip LSIG In=63A 3p F F',  53980.28, 'NSX'],
    ['XT4N-100-LSIG', '1SDA068139R1', 100, 'XT4N 160 Ekip LSIG In=100A 3p F F', 53980.28, 'NSX'],
    ['XT4N-150-LSIG', '1SDA068140R1', 150, 'XT4N 160 Ekip LSIG In=160A 3p F F', 53980.28, 'NSX'],
    ['XT4N-250-LSIG', '1SDA068142R1', 250, 'XT4N 250 Ekip LSIG In=250A 3p F F', 53980.28, 'NSX'],
  ]),
  // XT4S LI 50Kaic@415V
  ...tmaxXt('XT4S', 250, '50Kaic@415V', 'LI', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4S-40-LI',  '1SDA068471R1',  40, 'XT4S 160 Ekip LS/I In=40A 3p F F',  24876.67, 'NSX'],
    ['XT4S-63-LI',  '1SDA068472R1',  63, 'XT4S 160 Ekip LS/I In=63A 3p F F',  24876.67, 'NSX'],
    ['XT4S-100-LI', '1SDA068473R1', 100, 'XT4S 160 Ekip LS/I In=100A 3p F F', 24876.67, 'NSX'],
    ['XT4S-150-LI', '1SDA068474R1', 150, 'XT4S 160 Ekip LS/I In=160A 3p F F', 24876.67, 'NSX'],
    ['XT4S-250-LI', '1SDA068475R1', 250, 'XT4S 250 Ekip LS/I In=250A 3p F F', 25843.54, null],
  ]),
  // XT4S LSIG 50Kaic@415V
  ...tmaxXt('XT4S', 250, '50Kaic@415V', 'LSIG', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4S-40-LSIG',  '1SDA068486R1',  40, 'XT4S 160 Ekip LSIG In=40A 3p F F',  55164.89, 'NSX'],
    ['XT4S-63-LSIG',  '1SDA068487R1',  63, 'XT4S 160 Ekip LSIG In=63A 3p F F',  55164.89, 'NSX'],
    ['XT4S-100-LSIG', '1SDA068488R1', 100, 'XT4S 160 Ekip LSIG In=100A 3p F F', 55164.89, 'NSX'],
    ['XT4S-150-LSIG', '1SDA068489R1', 150, 'XT4S 160 Ekip LSIG In=160A 3p F F', 55164.89, 'NSX'],
    ['XT4S-250-LSIG', '1SDA068490R1', 250, 'XT4S 250 Ekip LSIG In=250A 3p F F', 55164.89, null],
  ]),
  // XT4H LI 70Kaic@415V
  ...tmaxXt('XT4H', 250, '70Kaic@415V', 'LI', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4H-40-LI',  '1SDA068511R1',  40, 'XT4H 160 Ekip LS/I In=40A 3p F F',  26007.60, 'NSX'],
    ['XT4H-63-LI',  '1SDA068512R1',  63, 'XT4H 160 Ekip LS/I In=63A 3p F F',  26007.60, 'NSX'],
    ['XT4H-100-LI', '1SDA068513R1', 100, 'XT4H 160 Ekip LS/I In=100A 3p F F', 26007.60, 'NSX'],
    ['XT4H-150-LI', '1SDA068514R1', 150, 'XT4H 160 Ekip LS/I In=160A 3p F F', 26007.60, 'NSX'],
    ['XT4H-250-LI', '1SDA068515R1', 250, 'XT4H 250 Ekip LS/I In=250A 3p F F', 26975.06, null],
  ]),
  // XT4H LSIG 70Kaic@415V
  ...tmaxXt('XT4H', 250, '70Kaic@415V', 'LSIG', { w: 105.0, d: 82.5, h: 160.0 }, [
    ['XT4H-40-LSIG',  '1SDA068526R1',  40, 'XT4H 160 Ekip LSIG In=40A 3p F F',  56296.41, 'NSX'],
    ['XT4H-63-LSIG',  '1SDA068527R1',  63, 'XT4H 160 Ekip LSIG In=63A 3p F F',  56296.41, 'NSX'],
    ['XT4H-100-LSIG', '1SDA068528R1', 100, 'XT4H 160 Ekip LSIG In=100A 3p F F', 56296.41, 'NSX'],
    ['XT4H-150-LSIG', '1SDA068529R1', 150, 'XT4H 160 Ekip LSIG In=160A 3p F F', 56296.41, 'NSX'],
    ['XT4H-250-LSIG', '1SDA068530R1', 250, 'XT4H 250 Ekip LSIG In=250A 3p F F', 56296.41, null],
  ]),

  // ===== PAGE 12: TMAX XT (400-1000A Frame) =====
  // XT5N 400AF 36Kaic@415V
  ...tmaxXt('XT5N', 400, '36Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5N-320-TMA',  '1SDA100344R1', 320, 'XT5N 400 TMA 320-3200 3p F F',     32707.48, 'NSX'],
    ['XT5N-400-TMA',  '1SDA100345R1', 400, 'XT5N 400 TMA 400-4000 3p F F',     32707.48, 'NSX'],
  ]),
  ...tmaxXt('XT5N', 400, '36Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5N-320-LSIG', '1SDA100361R1', 320, 'XT5N 400 Ekip Dip LSIG In=320 3p F F', 63904.05, 'NSX'],
    ['XT5N-400-LSIG', '1SDA100362R1', 400, 'XT5N 400 Ekip Dip LSIG In=400 3p F F', 63904.05, 'NSX'],
  ]),
  // XT5N 630AF 36Kaic@415V
  ...tmaxXt('XT5N', 630, '36Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5N-500-TMA',  '1SDA100346R1', 500, 'XT5N 630 TMA 500-5000 3p F F',     41681.88, 'NSX'],
    ['XT5N-630-TMA',  '1SDA100347R1', 630, 'XT5N 630 TMA 630-6300 3p F F',     41681.88, 'NSX'],
  ]),
  ...tmaxXt('XT5N', 630, '36Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5N-630-LSIG', '1SDA100363R1', 630, 'XT5N 630 Ekip Dip LSIG In=630 3p F F', 78501.09, 'NSX'],
  ]),
  // XT5S 400AF 50Kaic@415V
  ...tmaxXt('XT5S', 400, '50Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5S-320-TMA',  '1SDA100414R1', 320, 'XT5S 400 TMA 320-3200 3p F F',     33555.52, 'NSX'],
    ['XT5S-400-TMA',  '1SDA100415R1', 400, 'XT5S 400 TMA 400-4000 3p F F',     33555.52, 'NSX'],
  ]),
  ...tmaxXt('XT5S', 400, '50Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5S-320-LSIG', '1SDA100431R1', 320, 'XT5S 400 Ekip Dip LSIG In=320 3p F F', 64753.30, 'NSX'],
    ['XT5S-400-LSIG', '1SDA100432R1', 400, 'XT5S 400 Ekip Dip LSIG In=400 3p F F', 64753.30, 'NSX'],
  ]),
  // XT5H 400AF 70Kaic@415V
  ...tmaxXt('XT5H', 400, '70Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5H-320-TMA',  '1SDA100484R1', 320, 'XT5H 400 TMA 320-3200 3p F F',     37234.79, 'NSX'],
    ['XT5H-400-TMA',  '1SDA100485R1', 400, 'XT5H 400 TMA 400-4000 3p F F',     37234.79, 'NSX'],
  ]),
  ...tmaxXt('XT5H', 400, '70Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT5H-320-LSIG', '1SDA100497R1', 320, 'XT5H 400 Ekip Dip LSIG In=320 3p F F', 68431.96, 'NSX'],
    ['XT5H-400-LSIG', '1SDA100498R1', 400, 'XT5H 400 Ekip Dip LSIG In=400 3p F F', 68431.96, 'NSX'],
  ]),
  // XT6N 800/1000AF 36Kaic@415V
  ...tmaxXt('XT6N', 800, '36Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6N-630-TMA',  '1SDA100347R1B', 630, 'XT6N 630 TMA 630-6300 3p F F',    41681.88, 'NSX'],
  ]),
  ...tmaxXt('XT6N', 800, '36Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6N-630-LSIG', '1SDA100363R1B', 630, 'XT6N 630 Ekip Dip LSIG In=630 3p F F', 78501.09, 'NSX'],
  ]),
  ...tmaxXt('XT6N', 800, '36Kaic@415V', 'TMA', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6N-800-TMA',  '1SDA100718R1', 800, 'XT6N 800 TMA 800-8000 3p F F',     47143.48, 'NSX'],
  ]),
  ...tmaxXt('XT6N', 800, '36Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6N-800-LSIG', '1SDA100723R1', 800, 'XT6N 800 Ekip Dip LSIG In=800 3p F F', 77836.41, 'NSX'],
  ]),
  ...tmaxXt('XT6N', 1000, '36Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6N-1000', '1SDA100724R1', 1000, 'XT6N 1000 Ekip Dip LSIG In=1000 3p F F', 0.00, 'NSX'],
  ]),
  // XT6S 800/1000AF 50Kaic@415V
  ...tmaxXt('XT6S', 800, '50Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6S-630-TMA',  '1SDA100417R1', 630, 'XT6S 630 TMA 630-6300 3p F F',     38307.03, 'NSX'],
  ]),
  ...tmaxXt('XT6S', 800, '50Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6S-630-LSIG', '1SDA100433R1', 630, 'XT6S 630 Ekip Dip LSIG In=630 3p F F', 71970.82, 'NSX'],
  ]),
  ...tmaxXt('XT6S', 800, '50Kaic@415V', 'TMA', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6S-800-TMA',  '1SDA100740R1', 800, 'XT6S 800 TMA 800-8000 3p F F',     52991.87, 'NSX'],
  ]),
  ...tmaxXt('XT6S', 800, '50Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6S-800-LSIG', '1SDA100745R1', 800, 'XT6S 800 Ekip Dip LSIG In=800 3p F F', 81053.52, 'NSX'],
  ]),
  ...tmaxXt('XT6S', 1000, '50Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6S-1000', '1SDA100746R1', 1000, 'XT6S 1000 Ekip Dip LSIG In=1000 3p F F', 0.00, 'NSX'],
  ]),
  // XT6H 800/1000AF 70Kaic@415V
  ...tmaxXt('XT6H', 800, '70Kaic@415V', 'TMA', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6H-630-TMA',  '1SDA100487R1', 630, 'XT6H 630 TMA 630-6300 3p F F',     38505.65, 'NSX'],
  ]),
  ...tmaxXt('XT6H', 800, '70Kaic@415V', 'LSIG', { w: 140.0, d: 103.5, h: 205.0 }, [
    ['XT6H-630-LSIG', '1SDA100499R1', 630, 'XT6H 630 Ekip Dip LSIG In=630 3p F F', 72168.84, 'NSX'],
  ]),
  ...tmaxXt('XT6H', 800, '70Kaic@415V', 'TMA', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6H-800-TMA',  '1SDA100762R1', 800, 'XT6H 800 TMA 800-8000 3p F F',     64534.31, 'NSX'],
  ]),
  ...tmaxXt('XT6H', 800, '70Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6H-800-LSIG', '1SDA100767R1', 800, 'XT6H 800 Ekip Dip LSIG In=800 3p F F', 92596.52, 'NSX'],
  ]),
  ...tmaxXt('XT6H', 1000, '70Kaic@415V', 'LSIG', { w: 210.0, d: 103.5, h: 268.0 }, [
    ['XT6H-1000', '1SDA100768R1', 1000, 'XT6H 1000 Ekip Dip LSIG In=1000 3p F F', 0.00, 'NSX'],
  ]),

  // ===== PAGE 13: TMAX XT (800-1600A Frame) =====
  // XT7S 50Kaic@415V
  ...tmaxXt('XT7S', 1600, '50Kaic@415V', 'LS/I', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7S-800-LSI',   '1SDA100826R1',  800, 'XT7S 800 Ekip Dip LS/I In=800A 3p F F',   72107.01, 'NS800N2.0E'],
    ['XT7S-1000-LSI',  '1SDA100827R1', 1000, 'XT7S 1000 Ekip Dip LS/I In=1000A 3p F F', 84912.67, 'NS1000N2.0E'],
    ['XT7S-1250-LSI',  '1SDA100828R1', 1250, 'XT7S 1250 Ekip Dip LS/I In=1250A 3p F F', 98643.57, 'NS1250N2.0E'],
    ['XT7S-1600-LSI',  '1SDA100829R1', 1600, 'XT7S 1600 Ekip Dip LS/I In=1600A 3p F F', 109209.71, 'NS1600N2.0E'],
  ]),
  ...tmaxXt('XT7S', 1600, '50Kaic@415V', 'LSIG', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7S-800-LSIG',  '1SDA100834R1',  800, 'XT7S 800 Ekip Dip LSIG In=800A 3p F F',   99468.09, 'NS800N6.0E'],
    ['XT7S-1000-LSIG', '1SDA100835R1', 1000, 'XT7S 1000 Ekip Dip LSIG In=1000A 3p F F', 112273.75, 'NS1000N6.0E'],
    ['XT7S-1250-LSIG', '1SDA100836R1', 1250, 'XT7S 1250 Ekip Dip LSIG In=1250A 3p F F', 126004.05, 'NS1250N6.0E'],
    ['XT7S-1600-LSIG', '1SDA100837R1', 1600, 'XT7S 1600 Ekip Dip LSIG In=1600A 3p F F', 136571.39, 'NS1600N6.0E'],
  ]),
  // XT7H 70Kaic@415V
  ...tmaxXt('XT7H', 1600, '70Kaic@415V', 'LS/I', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7H-800-LSI',   '1SDA100890R1',  800, 'XT7H 800 Ekip Dip LS/I In=800A 3p F F',    82128.49, 'NS800H2.0E'],
    ['XT7H-1000-LSI',  '1SDA100891R1', 1000, 'XT7H 1000 Ekip Dip LS/I In=1000A 3p F F',  107373.69, 'NS1000H2.0E'],
    ['XT7H-1250-LSI',  '1SDA100892R1', 1250, 'XT7H 1250 Ekip Dip LS/I In=1250A 3p F F',  145083.77, 'NS1250H2.0E'],
    ['XT7H-1600-LSI',  '1SDA100832R1', 1600, 'XT7H 1600 Ekip Dip LS/I In=1600A 3p F F',  156724.73, 'NS1600H2.0E'],
  ]),
  ...tmaxXt('XT7H', 1600, '70Kaic@415V', 'LSIG', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7H-800-LSIG',  '1SDA100898R1',  800, 'XT7H 800 Ekip Dip LSIG In=800A 3p F F',   109489.57, 'NS800H6.0E'],
    ['XT7H-1000-LSIG', '1SDA100899R1', 1000, 'XT7H 1000 Ekip Dip LSIG In=1000A 3p F F', 134734.77, 'NS1000H6.0E'],
    ['XT7H-1250-LSIG', '1SDA100900R1', 1250, 'XT7H 1250 Ekip Dip LSIG In=1250A 3p F F', 172446.06, 'NS1250H6.0E'],
    ['XT7H-1600-LSIG', '1SDA100901R1', 1600, 'XT7H 1600 Ekip Dip LSIG In=1600A 3p F F', 184087.02, 'NS1600H6.0E'],
  ]),
  // XT7L 120Kaic@415V
  ...tmaxXt('XT7L', 1600, '120Kaic@415V', 'LS/I', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7L-800-LSI',   '1SDA100954R1',  800, 'XT7L 800 Ekip Dip LS/I In=800A 3p F F',   110873.22, null],
    ['XT7L-1000-LSI',  '1SDA100955R1', 1000, 'XT7L 1000 Ekip Dip LS/I In=1000A 3p F F', 144954.69, null],
    ['XT7L-1250-LSI',  '1SDA100956R1', 1250, 'XT7L 1250 Ekip Dip LS/I In=1250A 3p F F', 195863.09, null],
    ['XT7L-1600-LSI',  '1SDA100957R1', 1600, 'XT7L 1600 Ekip Dip LS/I In=1600A 3p F F', 211578.99, null],
  ]),
  ...tmaxXt('XT7L', 1600, '120Kaic@415V', 'LSIG', { w: 210.0, d: 166.0, h: 268.0 }, [
    ['XT7L-800-LSIG',  '1SDA100962R1',  800, 'XT7L 800 Ekip Dip LSIG In=800A 3p F F',   138234.90, null],
    ['XT7L-1000-LSIG', '1SDA100963R1', 1000, 'XT7L 1000 Ekip Dip LSIG In=1000A 3p F F', 172316.38, null],
    ['XT7L-1250-LSIG', '1SDA100964R1', 1250, 'XT7L 1250 Ekip Dip LSIG In=1250A 3p F F', 223224.17, null],
    ['XT7L-1600-LSIG', '1SDA100965R1', 1600, 'XT7L 1600 Ekip Dip LSIG In=1600A 3p F F', 238940.68, null],
  ]),

  // ===== PAGE 14: EMAX 2 (66Kaic@415V) =====
  // EMAX 1.2N 1600AF 66Kaic Fixed
  ...emaxSeries('E1.2N', 1600, '66Kaic@415V', { w: 210.0, d: 183.0, h: 296.0 }, [
    ['E1.2N-800-LI',    '1SDA070764R1',  800, 'E1.2N 800 Ekip Touch LI 3p F F',   149619.69, 'NW08H13F2E'],
    ['E1.2N-800-LSIG',  '1SDA070766R1',  800, 'E1.2N 800 Ekip Touch LSIG 3p F F', 191826.11, 'NW08H13F6E'],
    ['E1.2N-1000-LI',   '1SDA070804R1', 1000, 'E1.2N 1000 Ekip Touch LI 3p F F',  153364.18, 'NW10H13F2E'],
    ['E1.2N-1000-LSIG', '1SDA070806R1', 1000, 'E1.2N 1000 Ekip Touch LSIG 3p F F', 195570.61, 'NW10H13F6E'],
    ['E1.2N-1250-LI',   '1SDA070844R1', 1250, 'E1.2N 1250 Ekip Touch LI 3p F F',  170908.18, 'NW12H13F2E'],
    ['E1.2N-1250-LSIG', '1SDA070846R1', 1250, 'E1.2N 1250 Ekip Touch LSIG 3p F F', 213114.61, 'NW12H13F6E'],
    ['E1.2N-1600-LI',   '1SDA070884R1', 1600, 'E1.2N 1600 Ekip Touch LI 3p F F',  189179.36, 'NW16H13F2E'],
    ['E1.2N-1600-LSIG', '1SDA070886R1', 1600, 'E1.2N 1600 Ekip Touch LSIG 3p F F', 231385.05, 'NW16H13F6E'],
  ]),
  // EMAX 2.2N 2500AF 66Kaic Fixed
  ...emaxSeries('E2.2N', 2500, '66Kaic@415V', { w: 276.0, d: 270.0, h: 371.0 }, [
    ['E2.2N-800-LI',    '1SDA070894R1',  800, 'E2.2N 800 Ekip Touch LI 3p FHR',   191580.30, 'NW08H13F2E'],
    ['E2.2N-800-LSIG',  '1SDA070896R1',  800, 'E2.2N 800 Ekip Touch LSIG 3p FHR', 233787.46, 'NW08H13F6E'],
    ['E2.2N-1000-LI',   '1SDA070924R1', 1000, 'E2.2N 1000 Ekip Touch LI 3p FHR',  191580.30, 'NW10H13F2E'],
    ['E2.2N-1000-LSIG', '1SDA070926R1', 1000, 'E2.2N 1000 Ekip Touch LSIG 3p FHR', 233787.46, 'NW10H13F6E'],
    ['E2.2N-1250-LI',   '1SDA070954R1', 1250, 'E2.2N 1250 Ekip Touch LI 3p FHR',  191580.30, 'NW12H13F2E'],
    ['E2.2N-1250-LSIG', '1SDA070956R1', 1250, 'E2.2N 1250 Ekip Touch LSIG 3p FHR', 233787.46, 'NW12H13F6E'],
    ['E2.2N-1600-LI',   '1SDA070994R1', 1600, 'E2.2N 1600 Ekip Touch LI 3p FHR',  211881.12, 'NW16H13F2E'],
    ['E2.2N-1600-LSIG', '1SDA070996R1', 1600, 'E2.2N 1600 Ekip Touch LSIG 3p FHR', 254088.28, 'NW16H13F6E'],
    ['E2.2N-2000-LI',   '1SDA071034R1', 2000, 'E2.2N 2000 Ekip Touch LI 3p FHR',  225389.32, 'NW20H13F2E'],
    ['E2.2N-2000-LSIG', '1SDA071036R1', 2000, 'E2.2N 2000 Ekip Touch LSIG 3p FHR', 267596.48, 'NW20H13F6E'],
    ['E2.2N-2500-LI',   '1SDA071064R1', 2500, 'E2.2N 2500 Ekip Touch LI 3p FHR',  251034.28, 'NW25H13F2E'],
    ['E2.2N-2500-LSIG', '1SDA071066R1', 2500, 'E2.2N 2500 Ekip Touch LSIG 3p FHR', 293241.44, 'NW25H13F6E'],
  ]),
  // EMAX 4.2N 4000AF 66Kaic Fixed
  ...emaxSeries('E4.2N', 4000, '66Kaic@415V', { w: 384.0, d: 270.0, h: 371.0 }, [
    ['E4.2N-3200-LI',   '1SDA071144R1', 3200, 'E4.2N 3200 Ekip Touch LI 3p FHR',  329211.45, 'NW32H13F2E'],
    ['E4.2N-3200-LSIG', '1SDA071146R1', 3200, 'E4.2N 3200 Ekip Touch LSIG 3p FHR', 371418.61, 'NW32H13F6E'],
    ['E4.2N-4000-LI',   '1SDA071194R1', 4000, 'E4.2N 4000 Ekip Touch LI 3p FHR',  494018.96, 'NW40H13F2E'],
    ['E4.2N-4000-LSIG', '1SDA071196R1', 4000, 'E4.2N 4000 Ekip Touch LSIG 3p FHR', 536226.13, 'NW40H13F6E'],
  ]),

  // ===== PAGE 15: EMAX 2 (85Kaic@415V) =====
  // EMAX 2.2S 2500AF 85Kaic Fixed
  ...emaxSeries('E2.2S', 2500, '85Kaic@415V', { w: 276.0, d: 270.0, h: 371.0 }, [
    ['E2.2S-800-LI',    '1SDA070904R1',  800, 'E2.2S 800 Ekip Touch LI 3p FHR',   202345.62, null],
    ['E2.2S-800-LSIG',  '1SDA070906R1',  800, 'E2.2S 800 Ekip Touch LSIG 3p FHR', 244552.05, null],
    ['E2.2S-1000-LI',   '1SDA070934R1', 1000, 'E2.2S 1000 Ekip Touch LI 3p FHR',  202345.62, null],
    ['E2.2S-1000-LSIG', '1SDA070936R1', 1000, 'E2.2S 1000 Ekip Touch LSIG 3p FHR', 244552.05, null],
    ['E2.2S-1250-LI',   '1SDA070964R1', 1250, 'E2.2S 1250 Ekip Touch LI 3p FHR',  202345.62, null],
    ['E2.2S-1250-LSIG', '1SDA070966R1', 1250, 'E2.2S 1250 Ekip Touch LSIG 3p FHR', 244552.05, null],
    ['E2.2S-1600-LI',   '1SDA071004R1', 1600, 'E2.2S 1600 Ekip Touch LI 3p FHR',  223546.79, null],
    ['E2.2S-1600-LSIG', '1SDA071006R1', 1600, 'E2.2S 1600 Ekip Touch LSIG 3p FHR', 265753.95, null],
    ['E2.2S-2000-LI',   '1SDA071044R1', 2000, 'E2.2S 2000 Ekip Touch LI 3p FHR',  245995.40, null],
    ['E2.2S-2000-LSIG', '1SDA071046R1', 2000, 'E2.2S 2000 Ekip Touch LSIG 3p FHR', 288202.56, null],
    ['E2.2S-2500-LI',   '1SDA071074R1', 2500, 'E2.2S 2500 Ekip Touch LI 3p FHR',  282046.12, null],
    ['E2.2S-2500-LSIG', '1SDA071076R1', 2500, 'E2.2S 2500 Ekip Touch LSIG 3p FHR', 324253.28, null],
  ]),
  // EMAX 4.2S 4000AF 85Kaic Fixed
  ...emaxSeries('E4.2S', 4000, '85Kaic@415V', { w: 384.0, d: 270.0, h: 371.0 }, [
    ['E4.2S-3200-LI',   '1SDA071154R1', 3200, 'E4.2S 3200 Ekip Touch LI 3p FHR',  345621.76, null],
    ['E4.2S-3200-LSIG', '1SDA071156R1', 3200, 'E4.2S 3200 Ekip Touch LSIG 3p FHR', 387827.45, null],
    ['E4.2S-4000-LI',   '1SDA071204R1', 4000, 'E4.2S 4000 Ekip Touch LI 3p FHR',  520023.48, null],
    ['E4.2S-4000-LSIG', '1SDA071206R1', 4000, 'E4.2S 4000 Ekip Touch LSIG 3p FHR', 562230.64, null],
  ]),
];

// --- Import ---
async function importItems() {
  console.log(`Importing ${ITEMS.length} pricelist items...`);
  const BATCH_SIZE = 400;
  let written = 0;

  for (let i = 0; i < ITEMS.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = ITEMS.slice(i, i + BATCH_SIZE);

    for (const item of slice) {
      const id = docId(item.catalogNo);
      const ref = db.collection('pricelist_items').doc(id);
      batch.set(ref, makeItem(item));
    }

    await batch.commit();
    written += slice.length;
    console.log(`  Written ${written} / ${ITEMS.length}`);
  }

  console.log('Done!');
}

importItems().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
