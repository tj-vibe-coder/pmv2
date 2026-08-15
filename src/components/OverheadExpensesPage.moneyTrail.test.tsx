import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import OverheadExpensesPage from './OverheadExpensesPage';

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
};

test('legacy overhead route preserves exact focus and source parameters', async () => {
  render(
    <MemoryRouter initialEntries={[
      '/finance/overhead-expenses?focus=expense%3Aoverhead_expenses%3Ae1&from=%2Ffinance%2Finvestment-tracker',
    ]}>
      <Routes>
        <Route path="/finance/overhead-expenses" element={<OverheadExpensesPage />} />
        <Route path="/finance/expense-monitoring" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByTestId('location')).toHaveTextContent(
    '/finance/expense-monitoring?focus=expense%3Aoverhead_expenses%3Ae1&from=%2Ffinance%2Finvestment-tracker&scope=overhead',
  );
});
