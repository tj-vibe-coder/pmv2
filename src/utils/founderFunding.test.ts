import {
  entryTypeLabel,
  formatCentavos,
  remainingAdvanceCentavos,
  sourceLabel,
} from './founderFunding';

test('formats centavos as Philippine pesos', () => {
  expect(formatCentavos(580744)).toBe('₱5,807.44');
});

test('calculates the remaining posted advance and exposes invalid over-settlement', () => {
  expect(remainingAdvanceCentavos(580744, [200000, 180000])).toBe(200744);
  expect(remainingAdvanceCentavos(10000, [12000])).toBe(-2000);
});

test('renders readable financial labels', () => {
  expect(entryTypeLabel('capital_contribution')).toBe('Capital contribution');
  expect(sourceLabel({ kind: 'liquidation', liquidationFormNo: 'LQ-001' })).toBe('Liquidation LQ-001');
  expect(sourceLabel({ kind: 'cash_deposit', depositReference: 'BDO-1482' })).toBe('Cash deposit · BDO-1482');
});
