import {
  financeFocusToken,
  financeFocusUrl,
  parseFinanceFocus,
} from './financeTraceFocus';

describe('financeTraceFocus', () => {
  test.each([
    ['investment:inv-1', { type: 'investment', id: 'inv-1' }],
    [
      'expense:project_expenses:exp-1',
      { type: 'expense', collection: 'project_expenses', id: 'exp-1' },
    ],
    [
      'expense:overhead_expenses:over-1',
      { type: 'expense', collection: 'overhead_expenses', id: 'over-1' },
    ],
    [
      'liquidation:liq-1:row-2',
      { type: 'liquidation', id: 'liq-1', rowId: 'row-2' },
    ],
    ['cash_advance:ca-1', { type: 'cash_advance', id: 'ca-1' }],
    ['reimbursement:reimb-1', { type: 'reimbursement', id: 'reimb-1' }],
  ])('parses %s', (token, expected) => {
    expect(parseFinanceFocus(token)).toEqual(expected);
  });

  test.each([
    '',
    'investment',
    'investment:',
    'investment:one:extra',
    'expense:unknown:1',
    'expense:project_expenses',
    'liquidation:liq-only',
    'liquidation:liq:row:extra',
    'unknown:1',
  ])('rejects malformed token %s', (token) => {
    expect(parseFinanceFocus(token)).toBeNull();
  });

  test('builds canonical focus tokens', () => {
    expect(financeFocusToken({ type: 'investment', id: 'a:b' })).toBe(
      'investment:a%3Ab',
    );
    expect(
      financeFocusToken({
        type: 'expense',
        collection: 'project_expenses',
        id: 'expense 1',
      }),
    ).toBe('expense:project_expenses:expense%201');
    expect(
      financeFocusToken({ type: 'liquidation', id: 'liq/1', rowId: 'row 2' }),
    ).toBe('liquidation:liq%2F1:row%202');
  });

  test('builds canonical module URLs and preserves a back-to-source URL', () => {
    expect(financeFocusUrl({ type: 'cash_advance', id: 'ca-1' })).toBe(
      '/finance/expense-monitoring/ca-form?focus=cash_advance%3Aca-1',
    );
    expect(
      financeFocusUrl(
        { type: 'investment', id: 'inv-1' },
        '/finance/expense-monitoring?focus=expense%3Aproject_expenses%3Aexp-1',
      ),
    ).toBe(
      '/finance/investment-tracker?focus=investment%3Ainv-1&from=%2Ffinance%2Fexpense-monitoring%3Ffocus%3Dexpense%253Aproject_expenses%253Aexp-1',
    );
  });

  test('round-trips encoded identifiers without accepting encoded separators', () => {
    const token = financeFocusToken({ type: 'investment', id: 'id:with/slash' });
    expect(parseFinanceFocus(token)).toEqual({
      type: 'investment',
      id: 'id:with/slash',
    });
  });
});
