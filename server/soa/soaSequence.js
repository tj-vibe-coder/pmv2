'use strict';

/**
 * Generate sequential SOA reference code:
 * SOA{YYMM}{SEQ:3}-{CLIENT:3}-{REVISION:2}
 * Example: SOA2607001-ACT-00
 */
function formatSoaCode(seq, clientCode, revision = '00', date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : (date || new Date());
  const year = String(d.getFullYear()).slice(-2);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yymm = `${year}${month}`;
  const seqStr = String(seq).padStart(3, '0');
  const cli = (clientCode || 'ACT').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const rev = String(revision || '00').padStart(2, '0');
  return `SOA${yymm}${seqStr}-${cli}-${rev}`;
}

/**
 * Parses an SOA reference number
 */
function parseSoaCode(code) {
  if (!code || typeof code !== 'string') return null;
  const match = code.trim().match(/^(SOA)(\d{4})(\d{3})-([A-Z0-9]{2,4})-(\d{2})$/i);
  if (!match) return null;
  return {
    prefix: match[1].toUpperCase(),
    yymm: match[2],
    seq: parseInt(match[3], 10),
    clientCode: match[4].toUpperCase(),
    revision: match[5],
    baseCode: `SOA${match[2]}${match[3]}-${match[4].toUpperCase()}`,
  };
}

/**
 * Calculate next sequence number for a given YYMM from Firestore
 */
async function getNextSoaSequence(db, yymm) {
  const snapshot = await db.collection('statements_of_account').get();
  const seqs = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const parsed = parseSoaCode(data.soaNo || '');
    if (parsed && parsed.yymm === yymm) {
      seqs.push(parsed.seq);
    }
  });
  return seqs.length > 0 ? Math.max(...seqs) + 1 : 1;
}

module.exports = {
  formatSoaCode,
  parseSoaCode,
  getNextSoaSequence,
};
