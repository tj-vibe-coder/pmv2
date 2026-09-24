import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AiChartPanel from './AiChartPanel';
import type { AiChart } from '../../types/AiAssist';

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one to mount.
beforeAll(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

it('renders nothing when there is no chart', () => {
  const { container } = render(<AiChartPanel chart={null} />);
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing for an unrecognized tool or an empty data array', () => {
  const unknownTool: AiChart = { type: 'bar', title: 'x', tool: 'unknown_tool', data: [{ group: 'a', totalBalance: 1 }] };
  const { container: c1 } = render(<AiChartPanel chart={unknownTool} />);
  expect(c1).toBeEmptyDOMElement();

  const emptyData: AiChart = { type: 'bar', title: 'x', tool: 'get_portfolio_summary', data: [] };
  const { container: c2 } = render(<AiChartPanel chart={emptyData} />);
  expect(c2).toBeEmptyDOMElement();
});

it('renders the chart title and, via the table toggle, the real portfolio group totals', () => {
  const chart: AiChart = {
    type: 'bar',
    title: 'Balance by status',
    tool: 'get_portfolio_summary',
    data: [
      { group: 'Not Started', count: 3, totalContractAmount: 900000, totalBilled: 100000, totalBalance: 800000 },
      { group: 'In Progress', count: 2, totalContractAmount: 500000, totalBilled: 200000, totalBalance: 300000 },
    ],
  };
  render(<AiChartPanel chart={chart} />);
  expect(screen.getByText('Balance by status')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
  const table = screen.getByRole('table', { name: 'Balance by status data table' });
  expect(table).toBeInTheDocument();
  expect(screen.getByText('Not Started')).toBeInTheDocument();
  expect(screen.getByText('In Progress')).toBeInTheDocument();
  expect(screen.getAllByText('₱800,000.00')[0]).toBeInTheDocument();
  expect(screen.getAllByText('₱300,000.00')[0]).toBeInTheDocument();
});

it('charts get_expense_summary using totalAmount per group', () => {
  const chart: AiChart = {
    type: 'bar',
    title: 'Expenses by category',
    tool: 'get_expense_summary',
    data: [{ group: 'Fuel', count: 2, totalAmount: 1500 }],
  };
  render(<AiChartPanel chart={chart} />);
  fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
  expect(screen.getByText('Fuel')).toBeInTheDocument();
  expect(screen.getAllByText('₱1,500.00')[0]).toBeInTheDocument();
});

it('charts query_analytics with line view and triggers studio callback', () => {
  const onOpenStudio = jest.fn();
  const chart: AiChart = {
    type: 'line',
    title: 'Yearly Trend',
    tool: 'query_analytics',
    data: [
      { group: '2024', totalAmount: 1000000 },
      { group: '2025', totalAmount: 2500000 },
      { group: '2026', totalAmount: 4000000 },
    ],
  };
  render(<AiChartPanel chart={chart} onOpenStudio={onOpenStudio} />);
  expect(screen.getByText('Yearly Trend')).toBeInTheDocument();

  const studioBtn = screen.getByRole('button', { name: /studio/i });
  expect(studioBtn).toBeInTheDocument();
  fireEvent.click(studioBtn);
  expect(onOpenStudio).toHaveBeenCalledWith(chart);

  // Switch to table view
  fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
  expect(screen.getByText('2024')).toBeInTheDocument();
  expect(screen.getByText('₱1,000,000.00')).toBeInTheDocument();
  expect(screen.getByText('₱4,000,000.00')).toBeInTheDocument();
});

