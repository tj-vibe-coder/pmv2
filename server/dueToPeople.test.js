'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDueToPeople } = require('./dueToPeople');

test('owed is pending claims minus partial payments; drafts are listed apart', () => {
  const out = summarizeDueToPeople([
    { id: 'a', employeeId: 'user_14', employeeName: 'Reuel Rivera', status: 'pending', amount: 14657.56, paidAmount: 0, formNo: 'LQ26-022-RJR' },
    { id: 'b', employeeId: 'user_14', employeeName: 'Reuel Rivera', status: 'paid', amount: 5000, paidAmount: 5000 },
    { id: 'c', employeeId: 'kim', employeeName: 'Kim', status: 'pending', amount: 22176, paidAmount: 10000 },
    { id: 'd', employeeId: 'kim', status: 'pending', amount: 100, paidAmount: 100 },
  ], [
    { id: 'l1', user_id: 'user_14', employee_name: 'Reuel Rivera', total_amount: 10962, form_no: null },
    { id: 'l2', user_id: 'user_14', total_amount: 0 },
  ]);
  const rj = out.people.find((p) => p.employeeId === 'user_14');
  assert.equal(rj.owed, 14657.56);
  assert.equal(rj.draftTotal, 10962);
  assert.equal(rj.claims.length, 1);
  assert.equal(out.people.find((p) => p.employeeId === 'kim').owed, 12176);
  assert.equal(out.totalOwed, 26833.56);
  assert.equal(out.totalInDrafts, 10962);
});
