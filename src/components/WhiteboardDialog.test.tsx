import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WhiteboardDialog from './WhiteboardDialog';
import { useWhiteboardStore } from '../store/whiteboardStore';
import type { WhiteboardItem } from '../types/Whiteboard';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'tjc', full_name: 'TJ Caballero', role: 'admin' }, isAuthenticated: true }),
}));

const item = (p: Partial<WhiteboardItem>): WhiteboardItem => ({
  id: 'x', kind: 'todo', visibility: 'general', text: 'x', done: false,
  createdBy: 'someone-else', createdByName: 'RJ', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...p,
});

const updateItem = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  updateItem.mockClear();
  useWhiteboardStore.setState({
    items: [
      item({ id: 'g1', text: 'Order cable trays', category: 'general' }),
      item({ id: 'p1', text: 'Old person-column note', visibility: 'public' }),  // legacy → General
    ],
    loaded: true, loading: false,
    fetchItems: jest.fn().mockResolvedValue(undefined),
    fetchLinkOptions: jest.fn().mockResolvedValue(undefined),
    updateItem,
  });
});

const renderBoard = () => render(<MemoryRouter><WhiteboardDialog open onClose={() => {}} /></MemoryRouter>);

it('opens full screen', () => {
  renderBoard();
  expect(screen.getByRole('dialog')).toHaveClass('MuiDialog-paperFullScreen');
});

it('anyone can move a General item to another list with "Move to…"', () => {
  renderBoard();
  const row = within(screen.getByTestId('wb-list-general')).getByTestId('wb-item-g1');
  expect(row).toHaveTextContent('Order cable trays');
  fireEvent.click(within(row).getByRole('button', { name: /move to another list/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Sales/ }));
  expect(updateItem).toHaveBeenCalledWith('g1', { category: 'sales' });
});

it('dragging an item onto another list moves it there', () => {
  renderBoard();
  const data: Record<string, string> = {};
  const dataTransfer = {
    types: [] as string[],
    setData: (t: string, v: string) => { data[t] = v; dataTransfer.types.push(t); },
    getData: (t: string) => data[t],
    effectAllowed: '', dropEffect: '',
  };
  const row = within(screen.getByTestId('wb-list-general')).getByTestId('wb-item-p1');
  fireEvent.dragStart(row, { dataTransfer });
  const finance = screen.getByTestId('wb-list-finance');
  fireEvent.dragOver(finance, { dataTransfer });
  fireEvent.drop(finance, { dataTransfer });
  expect(updateItem).toHaveBeenCalledWith('p1', { category: 'finance' });
});
