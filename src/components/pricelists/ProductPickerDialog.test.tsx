import { fireEvent, render, screen } from '@testing-library/react';
import ProductPickerDialog from './ProductPickerDialog';

const mockResetFilters = jest.fn();
const mockFetchFilters = jest.fn();
const mockFetchItems = jest.fn();

jest.mock('../calcsheet/ProductHistoryTab', () => (props: {
  active: boolean;
  onAdd: (value: unknown) => void;
  analysisDate: string;
  expectedPurchaseDate: string;
  defaultContingencyPct: number;
}) => props.active
  ? (
    <>
      <span>
        History context: {props.analysisDate} · {props.expectedPurchaseDate} · {props.defaultContingencyPct}%
      </span>
      <button
        onClick={() => props.onAdd({ observation: { observationId: 'q1:c1' } })}
      >
        Add historical fixture
      </button>
    </>
  )
  : null);

jest.mock('../../store/pricelistStore', () => ({
  usePricelistStore: (selector: (state: unknown) => unknown) => selector({
    items: [{
      id: 'price-1',
      description: 'Pricelist breaker',
      catalogNo: 'PL-1',
      brand: 'ABB',
      category: 'Breaker',
      uom: 'pc',
      sellingPrice: 100,
    }],
    loading: false,
    filters: {
      search: '',
      suppliers: [],
      categories: [],
      brands: [],
      poles: null,
      minPrice: null,
      maxPrice: null,
    },
    filterOptions: {
      suppliers: [],
      categories: ['Breaker'],
      brands: ['ABB'],
      poles: [],
    },
    setFilters: jest.fn(),
    fetchItems: mockFetchItems,
    fetchFilters: mockFetchFilters,
    resetFilters: mockResetFilters,
  }),
}));

const renderPicker = (overrides = {}) => {
  const props = {
    open: true,
    onClose: jest.fn(),
    onAddPricelist: jest.fn(),
    onAddHistory: jest.fn(),
    analysisDate: '2026-01-01',
    expectedPurchaseDate: '2026-04-01',
    defaultContingencyPct: 5,
    ...overrides,
  };
  render(<ProductPickerDialog {...props} />);
  return props;
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('labels the independent sources Pricelists and Quotation History', () => {
  renderPicker();

  expect(screen.getByRole('tab', { name: 'Pricelists' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Quotation History' })).toBeInTheDocument();
  expect(screen.queryByText('TJ Catalog')).not.toBeInTheDocument();
});

it('does not render history until its tab is selected', () => {
  renderPicker();

  expect(screen.queryByText('Add historical fixture')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Quotation History' }));

  expect(screen.getByText('Add historical fixture')).toBeInTheDocument();
});

it('forwards the quotation calculation context to history', () => {
  renderPicker();

  fireEvent.click(screen.getByRole('tab', { name: 'Quotation History' }));

  expect(screen.getByText('History context: 2026-01-01 · 2026-04-01 · 5%'))
    .toBeInTheDocument();
});

it('keeps Pricelist selection isolated while visiting Quotation History', () => {
  const { onAddPricelist } = renderPicker();

  fireEvent.click(screen.getAllByRole('checkbox')[1]);
  fireEvent.click(screen.getByRole('tab', { name: 'Quotation History' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Pricelists' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 item' }));

  expect(onAddPricelist).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'price-1' }),
  ]);
});

it('routes a history selection independently and closes the picker', () => {
  const onClose = jest.fn();
  const onAddHistory = jest.fn();
  renderPicker({ onClose, onAddHistory });

  fireEvent.click(screen.getByRole('tab', { name: 'Quotation History' }));
  fireEvent.click(screen.getByText('Add historical fixture'));

  expect(onAddHistory).toHaveBeenCalledWith({
    observation: { observationId: 'q1:c1' },
  });
  expect(onClose).toHaveBeenCalled();
});
