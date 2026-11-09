import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DueToPeopleCard from './DueToPeopleCard';

const DATA = {
  success: true, totalOwed: 4200, totalInDrafts: 900,
  people: [
    { employeeId: 'e1', name: 'Person One', owed: 3000, draftTotal: 0, claims: [{ id: 'c1', formNo: 'LQ-0021', remaining: 3000 }], drafts: [] },
    { employeeId: 'e2', name: 'Person Two', owed: 1200, draftTotal: 900, claims: [{ id: 'c2', formNo: null, remaining: 1200 }], drafts: [{ id: 'd1', formNo: 'LQ-0030', total: 900 }] },
  ],
};

beforeEach(() => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve(DATA) }));
});
const renderCard = () => render(<MemoryRouter><DueToPeopleCard /></MemoryRouter>);

it('desktop keeps the table with a total row', async () => {
  renderCard();
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByText('Person One')).toBeInTheDocument();
  expect(screen.getByText('₱4,200.00')).toBeInTheDocument();
});

describe('phone layout', () => {
  const realMatchMedia = window.matchMedia;
  beforeAll(() => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width:599.95px'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterAll(() => { window.matchMedia = realMatchMedia; });

  it('lists each person with what they are owed and their drafts, plus a total', async () => {
    renderCard();
    expect(await screen.findByText('Person One')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('LQ-0021')).toBeInTheDocument();
    expect(screen.getByText('₱3,000.00')).toBeInTheDocument();
    expect(screen.getByText('no drafts')).toBeInTheDocument();
    expect(screen.getByText('₱900.00 in draft')).toBeInTheDocument();
    expect(screen.getByText('claim')).toBeInTheDocument(); // a claim without a form number
    const total = screen.getByTestId('due-total');
    expect(within(total).getByText('Total owed')).toBeInTheDocument();
    expect(within(total).getByText('₱900.00 still in drafts')).toBeInTheDocument();
    expect(within(total).getByText('₱4,200.00')).toBeInTheDocument();
  });
});
