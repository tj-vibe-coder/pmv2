import React, { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { FinanceTraceOrigin } from '../types/FinanceTrace';
import { useFinanceRowFocus } from './useFinanceRowFocus';

interface Row {
  id: string;
}

function Harness({
  records,
  revealRecord,
  setPage,
  rowElement,
  loading = false,
  indexForRecord,
}: {
  records: Row[];
  revealRecord: (row: Row) => void;
  setPage: (page: number) => void;
  rowElement: HTMLElement;
  loading?: boolean;
  indexForRecord?: (row: Row) => number;
}) {
  const rowRefs = useRef(new Map<string, HTMLElement>());
  rowRefs.current.set('expense:project_expenses:e22', rowElement);
  const focus = useFinanceRowFocus({
    records,
    originForRecord: (row): FinanceTraceOrigin => ({
      type: 'expense', collection: 'project_expenses', id: row.id,
    }),
    loading,
    pageSize: 10,
    setPage,
    revealRecord,
    indexForRecord,
    rowRefs,
  });
  const location = useLocation();
  return (
    <div>
      <span data-testid="key">{focus.focusedKey}</span>
      <span data-testid="error">{focus.focusError}</span>
      <span data-testid="location">{location.pathname}{location.search}</span>
      <button onClick={focus.clearFocus}>Clear focus</button>
      <button onClick={focus.backToSource}>Back to source</button>
    </div>
  );
}

beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('reveals, paginates to, scrolls to, and persistently focuses an exact row', async () => {
  const records = Array.from({ length: 25 }, (_, index) => ({ id: `e${index + 1}` }));
  const revealRecord = jest.fn();
  const setPage = jest.fn();
  const rowElement = document.createElement('tr');
  rowElement.scrollIntoView = jest.fn();

  render(
    <MemoryRouter initialEntries={[
      '/finance/expense-monitoring?focus=expense%3Aproject_expenses%3Ae22&from=%2Ffinance%2Finvestment-tracker',
    ]}>
      <Harness
        records={records}
        revealRecord={revealRecord}
        setPage={setPage}
        rowElement={rowElement}
      />
    </MemoryRouter>,
  );

  await act(async () => {});
  expect(revealRecord).toHaveBeenCalledWith({ id: 'e22' });
  expect(setPage).toHaveBeenCalledWith(2);
  expect(rowElement.scrollIntoView).toHaveBeenCalledWith({
    behavior: 'smooth', block: 'center', inline: 'nearest',
  });
  expect(screen.getByTestId('key')).toHaveTextContent('expense:project_expenses:e22');
  expect(screen.getByTestId('location')).toHaveTextContent('focus=expense%3Aproject_expenses%3Ae22');
});

test('Back to source uses the preserved URL', async () => {
  const records = [{ id: 'e22' }];
  const rowElement = document.createElement('tr');
  rowElement.scrollIntoView = jest.fn();
  render(
    <MemoryRouter initialEntries={[
      '/finance/expense-monitoring?focus=expense%3Aproject_expenses%3Ae22&from=%2Ffinance%2Finvestment-tracker%3Ffocus%3Dinvestment%253Ai1',
    ]}>
      <Harness records={records} revealRecord={jest.fn()} setPage={jest.fn()} rowElement={rowElement} />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Back to source' }));
  expect(screen.getByTestId('location')).toHaveTextContent(
    '/finance/investment-tracker?focus=investment%3Ai1',
  );
});

test('Clear focus removes focus and source parameters', async () => {
  const rowElement = document.createElement('tr');
  rowElement.scrollIntoView = jest.fn();
  render(
    <MemoryRouter initialEntries={[
      '/finance/expense-monitoring?year=2026&focus=expense%3Aproject_expenses%3Ae22&from=%2Fsource',
    ]}>
      <Harness records={[{ id: 'e22' }]} revealRecord={jest.fn()} setPage={jest.fn()} rowElement={rowElement} />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear focus' }));
  expect(screen.getByTestId('location')).toHaveTextContent(
    '/finance/expense-monitoring?year=2026',
  );
});

test('reports malformed and missing focused records without navigating away', async () => {
  const rowElement = document.createElement('tr');
  rowElement.scrollIntoView = jest.fn();
  const { unmount } = render(
    <MemoryRouter initialEntries={['/?focus=bad-token']}>
      <Harness records={[]} revealRecord={jest.fn()} setPage={jest.fn()} rowElement={rowElement} />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('error')).toHaveTextContent('Invalid money trail link');
  unmount();

  render(
    <MemoryRouter initialEntries={['/?focus=expense%3Aproject_expenses%3Amissing']}>
      <Harness records={[]} revealRecord={jest.fn()} setPage={jest.fn()} rowElement={rowElement} />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('error')).toHaveTextContent('Finance record not found');
});

test('uses the page index from a page-specific filtered view', async () => {
  const records = Array.from({ length: 25 }, (_, index) => ({ id: `e${index + 1}` }));
  const setPage = jest.fn();
  const rowElement = document.createElement('tr');
  rowElement.scrollIntoView = jest.fn();
  render(
    <MemoryRouter initialEntries={['/?focus=expense%3Aproject_expenses%3Ae22']}>
      <Harness
        records={records}
        revealRecord={jest.fn()}
        setPage={setPage}
        rowElement={rowElement}
        indexForRecord={() => 7}
      />
    </MemoryRouter>,
  );
  expect(setPage).toHaveBeenCalledWith(0);
  expect(setPage).not.toHaveBeenCalledWith(2);
});
