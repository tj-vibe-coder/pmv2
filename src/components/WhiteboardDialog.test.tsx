import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('due dates, done-by and repeats', () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('puts overdue items first and shows the overdue / due-today summary', () => {
    useWhiteboardStore.setState({
      items: [
        item({ id: 'a', text: 'Plain item', createdAt: '2026-09-01T00:00:00.000Z' }),
        item({ id: 'b', text: 'Late item', dueDate: day(-3), createdAt: '2026-09-02T00:00:00.000Z' }),
        item({ id: 'c', text: 'Today item', dueDate: day(0), createdAt: '2026-09-03T00:00:00.000Z' }),
      ],
    });
    renderBoard();
    const rows = within(screen.getByTestId('wb-list-general')).getAllByTestId(/wb-item-/).map((r) => r.getAttribute('data-testid'));
    expect(rows).toEqual(['wb-item-b', 'wb-item-c', 'wb-item-a']);
    expect(screen.getByTestId('wb-due-summary')).toHaveTextContent('1 overdue');
    expect(screen.getByTestId('wb-due-summary')).toHaveTextContent('1 due today');
  });

  it('shows who completed an item and when, under "Show done"', () => {
    useWhiteboardStore.setState({
      items: [item({ id: 'd', text: 'File 2551Q', done: true, doneByName: 'Nylle', doneAt: '2026-10-20T03:00:00.000Z' })],
    });
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-list-general')).getByRole('button', { name: /show done/i }));
    expect(screen.getByTestId('wb-done-by')).toHaveTextContent('✓ Nylle · Oct 20');
  });

  it('marks a repeating to-do with its repeat rule', () => {
    useWhiteboardStore.setState({ items: [item({ id: 'r', text: 'Monthly payroll check', recurrence: 'monthly', dueDate: day(5) })] });
    renderBoard();
    expect(within(screen.getByTestId('wb-item-r')).getByText('Monthly')).toBeInTheDocument();
  });

  it('tells the user when ticking a repeating to-do created the next one', async () => {
    updateItem.mockResolvedValueOnce({ spawned: item({ id: 'r2', text: 'Monthly payroll check', dueDate: '2026-11-25' }) });
    useWhiteboardStore.setState({ items: [item({ id: 'r', text: 'Monthly payroll check', recurrence: 'monthly', dueDate: day(1) })] });
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-r')).getByRole('checkbox'));
    expect(await screen.findByText(/the next one is due Nov 25/i)).toBeInTheDocument();
    expect(updateItem).toHaveBeenCalledWith('r', { done: true });
  });
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

  it('shows collapsible lists, a bottom quick-add bar and a ⋮ menu instead of per-list add fields', () => {
    renderBoard();
    // General has pending items, so it starts open; the others are collapsed
    expect(screen.getByRole('button', { name: /General/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Finance/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText('Add to General…')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add an item…')).toBeInTheDocument();
    // no tiny move icon; one actions menu per item
    const row = screen.getByTestId('wb-item-g1');
    expect(within(row).queryByRole('button', { name: /move to another list/i })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sales/ }));
    expect(updateItem).toHaveBeenCalledWith('g1', { category: 'sales' });
  });

  const LINKS = [
    { type: 'project' as const, id: 'p1', label: 'PCS2601 – Alpha Plant' },
    { type: 'calcsheet' as const, id: 'c1', label: 'PCS2602 – Beta Upgrade' },
    { type: 'invoice' as const, id: 'i1', label: 'Invoice 008 – Alpha Plant' },
    { type: 'liquidation' as const, id: 'l1', label: 'Liquidation LQ-0023 – Renzel' },
  ];

  it('lets you connect an item to something from the add bar, with a big-row picker you can search and filter', async () => {
    const addItem = jest.fn().mockResolvedValue(item({ id: 'n5', text: 'Chase payment' }));
    useWhiteboardStore.setState({ addItem, linkOptions: LINKS });
    renderBoard();
    const bar = screen.getByTestId('wb-add-options');
    fireEvent.click(within(bar).getByRole('button', { name: /link to a project, invoice, liquidation/i }));
    const picker = screen.getByTestId('wb-link-picker');
    expect(within(picker).getAllByRole('button', { name: /Alpha|Beta|Renzel/ })).toHaveLength(4);

    // filter chip by type
    fireEvent.click(within(picker).getByRole('button', { name: 'Invoices' }));
    expect(within(picker).getAllByRole('button', { name: /Alpha|Beta|Renzel/ })).toHaveLength(1);
    fireEvent.click(within(picker).getByRole('button', { name: 'All' }));

    // search by words
    fireEvent.change(within(picker).getByPlaceholderText(/search by name or number/i), { target: { value: 'beta upg' } });
    expect(within(picker).getAllByRole('button', { name: /Alpha|Beta|Renzel/ })).toHaveLength(1);
    fireEvent.click(within(picker).getByRole('button', { name: /Beta Upgrade/ }));

    // chosen link shows on the add bar and is sent with the item
    await waitFor(() => expect(screen.queryByTestId('wb-link-picker')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('wb-add-options')).getByText('PCS2602 – Beta Upgrade')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Add an item…'), { target: { value: 'Chase payment' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ text: 'Chase payment', link: { type: 'calcsheet', id: 'c1', label: 'PCS2602 – Beta Upgrade' } }));
  });

  it('editing on a phone opens the same big-row picker instead of a small dropdown', () => {
    useWhiteboardStore.setState({ items: [item({ id: 'mine', text: 'My item', createdBy: 'u1' })], linkOptions: LINKS });
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Edit$/ }));
    expect(screen.queryByRole('combobox', { name: /link to project/i })).not.toBeInTheDocument();
    const editDialog = screen.getByText('Edit item').closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(editDialog).getByRole('button', { name: /link to a project, invoice, liquidation/i }));
    expect(screen.getByTestId('wb-link-picker')).toBeInTheDocument();
  });
});

describe('adding with a due date and a repeat', () => {
  it('sends the due date and repeat rule when adding to a list', async () => {
    const addItem = jest.fn().mockResolvedValue(item({ id: 'n1', text: 'File 2551Q' }));
    useWhiteboardStore.setState({ addItem });
    renderBoard();
    const general = screen.getByTestId('wb-list-general');
    fireEvent.change(within(general).getByPlaceholderText('Add to General…'), { target: { value: 'File 2551Q' } });
    // the due date / repeat fields are already open — no need to tap anything first
    const options = within(general).getByTestId('wb-add-options');
    fireEvent.change(within(options).getByLabelText('Due date'), { target: { value: '2026-10-25' } });
    fireEvent.mouseDown(within(options).getByRole('combobox', { name: /repeats/i }));
    fireEvent.click(await screen.findByRole('option', { name: /every month/i }));
    fireEvent.click(within(general).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    // picking "Every month" pre-selects the due date's day of the month (the 25th)
    expect(addItem).toHaveBeenCalledWith({
      kind: 'todo', visibility: 'general', text: 'File 2551Q', done: false, category: 'general', dueDate: '2026-10-25',
      recurrence: 'monthly', recurrenceDay: 25,
    });
  });

  it('adds a plain item when the options are left alone', async () => {
    const addItem = jest.fn().mockResolvedValue(item({ id: 'n2', text: 'Plain' }));
    useWhiteboardStore.setState({ addItem });
    renderBoard();
    const general = screen.getByTestId('wb-list-general');
    fireEvent.change(within(general).getByPlaceholderText('Add to General…'), { target: { value: 'Plain' } });
    fireEvent.click(within(general).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith({ kind: 'todo', visibility: 'general', text: 'Plain', done: false, category: 'general' });
  });
});

describe('choosing the specific day of a repeat', () => {
  const pick = async (scope: HTMLElement, label: RegExp, option: RegExp) => {
    fireEvent.mouseDown(within(scope).getByRole('combobox', { name: label }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
  };

  it('weekly lets you pick the weekday', async () => {
    const addItem = jest.fn().mockResolvedValue(item({ id: 'n3', text: 'Team meeting' }));
    useWhiteboardStore.setState({ addItem });
    renderBoard();
    const general = screen.getByTestId('wb-list-general');
    fireEvent.change(within(general).getByPlaceholderText('Add to General…'), { target: { value: 'Team meeting' } });
    const options = within(general).getByTestId('wb-add-options');
    await pick(options, /repeats/i, /every week/i);
    await pick(options, /^on$/i, /^Monday$/);
    fireEvent.click(within(general).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ recurrence: 'weekly', recurrenceDay: 1 }));
  });

  it('monthly lets you pick a day of the month, or the last day', async () => {
    const addItem = jest.fn().mockResolvedValue(item({ id: 'n4', text: 'Payroll' }));
    useWhiteboardStore.setState({ addItem });
    renderBoard();
    const general = screen.getByTestId('wb-list-general');
    fireEvent.change(within(general).getByPlaceholderText('Add to General…'), { target: { value: 'Payroll' } });
    const options = within(general).getByTestId('wb-add-options');
    await pick(options, /repeats/i, /every month/i);
    await pick(options, /on day/i, /last day of the month/i);
    fireEvent.click(within(general).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ recurrence: 'monthly', recurrenceDay: 0 }));
  });

  it('shows the chosen day on the item', () => {
    useWhiteboardStore.setState({
      items: [
        item({ id: 'w', text: 'Weekly sync', recurrence: 'weekly', recurrenceDay: 1 }),
        item({ id: 'm', text: 'Month-end close', recurrence: 'monthly', recurrenceDay: 0 }),
        item({ id: 'k', text: 'Payroll', recurrence: 'monthly', recurrenceDay: 15 }),
      ],
    });
    renderBoard();
    expect(within(screen.getByTestId('wb-item-w')).getByText('Weekly · Mon')).toBeInTheDocument();
    expect(within(screen.getByTestId('wb-item-m')).getByText('Monthly · last day')).toBeInTheDocument();
    expect(within(screen.getByTestId('wb-item-k')).getByText('Monthly · 15th')).toBeInTheDocument();
  });
});

describe('subtasks, status notes and progress', () => {
  const addSubtask = jest.fn().mockResolvedValue(undefined);
  const setSubtaskDone = jest.fn().mockResolvedValue(undefined);
  const deleteSubtask = jest.fn().mockResolvedValue(undefined);
  const addUpdate = jest.fn().mockResolvedValue(undefined);
  const deleteUpdate = jest.fn().mockResolvedValue(undefined);

  const sub = (id: string, text: string, done = false) => ({ id, text, done, createdAt: '2026-10-20T00:00:00.000Z' });
  const note = (id: string, text: string, by: string, extra: object = {}) => ({ id, text, by, byName: by === 'u1' ? 'TJ' : 'RJ', at: '2026-10-21T06:10:00.000Z', ...extra });

  beforeEach(() => {
    [addSubtask, setSubtaskDone, deleteSubtask, addUpdate, deleteUpdate].forEach((f) => f.mockClear());
    useWhiteboardStore.setState({
      items: [
        // posted by the signed-in user (u1) → "mine"
        item({
          id: 'mine', text: 'Install panel', createdBy: 'u1', createdByName: 'TJ', progress: 40,
          subtasks: [{ ...sub('s1', 'Order breakers', true), doneBy: 'u3', doneByName: 'Renzel Punongbayan', doneAt: '2026-10-20T06:20:00.000Z' }, sub('s2', 'Wire it')],
          updates: [note('n1', 'Waiting on supplier', 'u1', { progress: 40 }), note('n2', 'Supplier replied', 'u2')],
        }),
        // posted by someone else
        item({ id: 'theirs', text: 'Site survey', progress: 70, subtasks: [sub('t1', 'Book visit')], updates: [note('n3', 'Visit booked', 'u2', { progress: 70 })] }),
      ],
      addSubtask, setSubtaskDone, deleteSubtask, addUpdate, deleteUpdate,
    });
  });

  it('shows progress, subtask count, note count and the latest note without opening anything', () => {
    renderBoard();
    const row = screen.getByTestId('wb-item-mine');
    expect(within(row).getByTestId('wb-progress')).toHaveTextContent('40%');
    expect(within(row).getByText('1/2')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByTestId('wb-latest-note')).toHaveTextContent('RJ: Supplier replied');
    expect(screen.queryByTestId('wb-detail-mine')).not.toBeInTheDocument(); // collapsed
  });

  it('expands and collapses the subtasks and notes', async () => {
    renderBoard();
    const row = screen.getByTestId('wb-item-mine');
    fireEvent.click(within(row).getByRole('button', { name: /show subtasks and notes/i }));
    const detail = screen.getByTestId('wb-detail-mine');
    expect(within(detail).getByText('Order breakers')).toBeInTheDocument();
    expect(within(detail).getByText('Waiting on supplier')).toBeInTheDocument();
    expect(within(detail).getByText('Supplier replied')).toBeInTheDocument();
    // the one-line preview gives way to the full log
    expect(within(row).queryByTestId('wb-latest-note')).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /hide subtasks and notes/i }));
    await waitFor(() => expect(screen.queryByTestId('wb-detail-mine')).not.toBeInTheDocument());
  });

  it('does not make the row draggable-by-accident: the panel sits outside the draggable row', () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    expect(screen.getByTestId('wb-item-mine')).not.toContainElement(screen.getByTestId('wb-detail-mine'));
  });

  it('shows who ticked a subtask by first name, with the full name on hover', () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    const ticked = within(screen.getByTestId('wb-detail-mine')).getByText(/✓ Renzel/);
    expect(ticked).toHaveAttribute('title', 'Renzel Punongbayan');
    expect(ticked).not.toHaveTextContent('Punongbayan');
  });

  it('anyone can tick a subtask', () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-theirs')).getByRole('button', { name: /show subtasks and notes/i }));
    fireEvent.click(within(screen.getByTestId('wb-detail-theirs')).getByRole('checkbox', { name: 'Book visit' }));
    expect(setSubtaskDone).toHaveBeenCalledWith('theirs', 't1', true);
  });

  it('the poster can add and remove subtasks and move the progress bar with a note', async () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    const detail = screen.getByTestId('wb-detail-mine');

    fireEvent.change(within(detail).getByLabelText('New subtask'), { target: { value: 'Test it' } });
    fireEvent.keyDown(within(detail).getByLabelText('New subtask'), { key: 'Enter' });
    expect(addSubtask).toHaveBeenCalledWith('mine', 'Test it');

    fireEvent.click(within(detail).getByRole('button', { name: /delete subtask wire it/i }));
    expect(deleteSubtask).toHaveBeenCalledWith('mine', 's2');

    fireEvent.change(within(detail).getByLabelText('Status note'), { target: { value: 'Parts arrived' } });
    fireEvent.change(within(detail).getByRole('slider'), { target: { value: 65 } });
    fireEvent.click(within(detail).getByRole('button', { name: /post note/i }));
    expect(addUpdate).toHaveBeenCalledWith('mine', { text: 'Parts arrived', progress: 65 });
    await waitFor(() => expect(within(detail).getByLabelText('Status note')).toHaveValue(''));
  });

  it('a note posted without touching the slider leaves progress alone', async () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    const detail = screen.getByTestId('wb-detail-mine');
    fireEvent.change(within(detail).getByLabelText('Status note'), { target: { value: 'Still on it' } });
    fireEvent.click(within(detail).getByRole('button', { name: /post note/i }));
    expect(addUpdate).toHaveBeenCalledWith('mine', { text: 'Still on it' });
    await waitFor(() => expect(within(detail).getByLabelText('Status note')).toHaveValue(''));
  });

  it('a teammate can add a note but sees no progress slider and cannot add or remove subtasks', async () => {
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-theirs')).getByRole('button', { name: /show subtasks and notes/i }));
    const detail = screen.getByTestId('wb-detail-theirs');
    expect(within(detail).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText('New subtask')).not.toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /delete subtask/i })).not.toBeInTheDocument();
    fireEvent.change(within(detail).getByLabelText('Status note'), { target: { value: 'FYI the gate code changed' } });
    fireEvent.click(within(detail).getByRole('button', { name: /post note/i }));
    expect(addUpdate).toHaveBeenCalledWith('theirs', { text: 'FYI the gate code changed' });
    await waitFor(() => expect(within(detail).getByLabelText('Status note')).toHaveValue(''));
  });

  it('notes can be deleted by their author or the poster, not by other people', () => {
    renderBoard();
    // On the poster's own task they can delete every note…
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    expect(within(screen.getByTestId('wb-detail-mine')).getAllByRole('button', { name: 'Delete note' })).toHaveLength(2);
    // …but on someone else's task only their own (none here — the one note is RJ's).
    fireEvent.click(within(screen.getByTestId('wb-item-theirs')).getByRole('button', { name: /show subtasks and notes/i }));
    expect(within(screen.getByTestId('wb-detail-theirs')).queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument();
  });

  it('hides the progress bar once the task is done', () => {
    useWhiteboardStore.setState({ items: [item({ id: 'd', text: 'Finished', done: true, progress: 90 })] });
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /show done/i }));
    expect(within(screen.getByTestId('wb-item-d')).queryByTestId('wb-progress')).not.toBeInTheDocument();
  });

  it('shows the server’s message when something is not allowed', async () => {
    addUpdate.mockRejectedValueOnce(new Error('Only the poster can set progress'));
    renderBoard();
    fireEvent.click(within(screen.getByTestId('wb-item-mine')).getByRole('button', { name: /show subtasks and notes/i }));
    const detail = screen.getByTestId('wb-detail-mine');
    fireEvent.change(within(detail).getByLabelText('Status note'), { target: { value: 'x' } });
    fireEvent.click(within(detail).getByRole('button', { name: /post note/i }));
    expect(await within(detail).findByText('Only the poster can set progress')).toBeInTheDocument();
    expect(within(detail).getByLabelText('Status note')).toHaveValue('x'); // draft kept
  });
});
