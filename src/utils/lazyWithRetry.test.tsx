import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import { lazyWithRetry } from './lazyWithRetry';

const reload = jest.fn();
const realLocation = window.location;

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  jest.restoreAllMocks();
});

it('shows the page once its code has downloaded', async () => {
  const Page = lazyWithRetry(() => Promise.resolve({ default: () => <div>The page</div> }));
  render(<Suspense fallback={<div>Loading…</div>}><Page /></Suspense>);
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  expect(await screen.findByText('The page')).toBeInTheDocument();
  expect(reload).not.toHaveBeenCalled();
});

it('reloads once when the page code cannot be fetched (e.g. an old tab after a deploy)', async () => {
  const Page = lazyWithRetry(() => Promise.reject(new Error('ChunkLoadError')));
  render(<Suspense fallback={<div>Loading…</div>}><Page /></Suspense>);
  await new Promise((r) => setTimeout(r, 20));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('pmv2_chunk_reload')).toBe('1');
});

it('does not reload in a loop — a second failure shows the "Reload" message instead', async () => {
  sessionStorage.setItem('pmv2_chunk_reload', '1');
  const Page = lazyWithRetry(() => Promise.reject(new Error('ChunkLoadError')));
  render(
    <RouteErrorBoundary>
      <Suspense fallback={<div>Loading…</div>}><Page /></Suspense>
    </RouteErrorBoundary>,
  );
  expect(await screen.findByText(/this page couldn’t load/i)).toBeInTheDocument();
  expect(screen.getByTestId('route-error-detail')).toHaveTextContent('Details: Error: ChunkLoadError');
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
});

it('a successful load clears the reload flag so a later deploy can recover again', async () => {
  sessionStorage.setItem('pmv2_chunk_reload', '1');
  const Page = lazyWithRetry(() => Promise.resolve({ default: () => <div>Ok</div> }));
  render(<Suspense fallback={null}><Page /></Suspense>);
  await screen.findByText('Ok');
  expect(sessionStorage.getItem('pmv2_chunk_reload')).toBeNull();
});
