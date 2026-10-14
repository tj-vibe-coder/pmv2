import {
  Box, Button, Collapse, Divider, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Fragment, useState } from 'react';
import type { ReactNode, CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sanitizeNumericText, parseLenientFloat } from '../../utils/calcsheet/numberInput';

export interface Column<T> {
  key: keyof T | string;
  // Usually a plain string; a column that needs interactive header content
  // (e.g. a "select all" checkbox above a row-checkbox column) can pass a
  // ReactNode instead.
  label: ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  type?: 'text' | 'number';
  render?: (row: T, idx: number) => ReactNode;
  editable?: boolean;
  step?: number;
  min?: number;
  mono?: boolean;
  multiline?: boolean;
  // Number columns only: unset (null/undefined) is a meaningful state distinct
  // from 0 — the cell shows `placeholder` greyed out, and clearing the field
  // stores undefined instead of 0 (e.g. per-line markup inheriting the global).
  nullable?: boolean;
  placeholder?: string;
  // Portrait-phone card view: how this column shows on the collapsed card.
  // eyebrow = small code above the title, title = the line's name, summary =
  // "Label value" pairs under it, total = bold amount on the right. Untagged
  // columns only appear in the expanded (edit) view. The card view is used only
  // when some column is tagged 'title'; otherwise phones keep the normal table.
  card?: 'eyebrow' | 'title' | 'summary' | 'total';
}

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Renders a divider above this item. */
  dividerBefore?: boolean;
  danger?: boolean;
}

interface Props<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  onChange: (idx: number, key: keyof T, value: any) => void;
  onDelete: (idx: number) => void;
  onReorder?: (newRows: T[]) => void;
  emptyMessage?: string;
  footer?: ReactNode;
  draggable?: boolean;
  readOnly?: boolean;
  // Row appears as a single spanning, bold label (bound to `description`)
  // instead of the normal per-column cells — used for BOM section headers.
  isHeaderRow?: (row: T) => boolean;
  // Second-level header — same spanning-label treatment as isHeaderRow, just
  // indented and lighter to read as nested under a preceding header row.
  isChildHeaderRow?: (row: T) => boolean;
  // Right-click on any row — return null/[] to suppress the menu for that row.
  getContextMenu?: (row: T, idx: number) => ContextMenuItem[] | null | undefined;
  subheader?: (row: T, idx: number) => string | undefined;
}

function NumberCell({
  value, step, min, align, mono, onChange, readOnly, nullable, placeholder,
}: { value: number | null | undefined; step?: number; min?: number; align?: 'left' | 'right' | 'center'; mono?: boolean; onChange: (v: number | undefined) => void; readOnly?: boolean; nullable?: boolean; placeholder?: string }) {
  // Nullable cells distinguish "unset" (empty, placeholder shows the inherited
  // value) from an explicit 0; plain cells keep treating 0 as empty.
  const display = nullable
    ? (value == null ? '' : String(value))
    : (value == null || value === 0 ? '' : String(value));
  return (
    <TextField
      value={display}
      onChange={(e) => {
        // Plain text + manual sanitize/parse — type="number" can't handle
        // thousands separators and mangles pasted comma-formatted figures
        // (e.g. "503,170.08" copied from Excel/a PDF).
        const raw = sanitizeNumericText(e.target.value);
        if (nullable && raw === '') return onChange(undefined);
        onChange(parseLenientFloat(raw));
      }}
      onFocus={(e) => e.target.select()}
      type="text"
      inputMode="decimal"
      variant="standard"
      placeholder={placeholder ?? '0'}
      disabled={readOnly}
      InputProps={{ disableUnderline: true, readOnly, sx: { fontSize: '0.8125rem', fontFamily: mono ? 'monospace' : undefined } }}
      inputProps={{
        step,
        min,
        style: { textAlign: align ?? 'left', padding: '6px 4px' },
      }}
      fullWidth
    />
  );
}

function TextCell({
  value, align, mono, onChange, readOnly, multiline,
}: { value: string; align?: 'left' | 'right' | 'center'; mono?: boolean; onChange: (v: string) => void; readOnly?: boolean; multiline?: boolean }) {
  return (
    <TextField
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => { if (!multiline) e.target.select(); }}
      variant="standard"
      disabled={readOnly}
      multiline={multiline}
      minRows={multiline ? 1 : undefined}
      InputProps={{ disableUnderline: true, readOnly, sx: { fontSize: '0.8125rem', fontFamily: mono ? 'monospace' : undefined } }}
      inputProps={{ style: { textAlign: align ?? 'left', padding: '6px 4px' } }}
      fullWidth
    />
  );
}

interface SortableRowProps<T extends { id: string }> {
  row: T;
  idx: number;
  columns: Column<T>[];
  draggable: boolean;
  onChange: (idx: number, key: keyof T, value: any) => void;
  onDelete: (idx: number) => void;
  readOnly?: boolean;
  isHeader?: boolean;
  isChildHeader?: boolean;
  onContextMenu?: (e: ReactMouseEvent, row: T, idx: number) => void;
}

function SortableRow<T extends { id: string }>({
  row, idx, columns, draggable, onChange, onDelete, readOnly, isHeader, isChildHeader, onContextMenu,
}: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: readOnly });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    backgroundColor: isDragging ? '#F0F4FF' : undefined,
  };

  if (isHeader || isChildHeader) {
    return (
      <TableRow ref={setNodeRef} style={style} hover onContextMenu={(e) => onContextMenu?.(e, row, idx)}>
        {draggable && (
          readOnly ? (
            <TableCell sx={{ width: 28, p: '0 4px', color: 'text.disabled', opacity: 0.3 }}>
              <DragIndicatorIcon fontSize="small" />
            </TableCell>
          ) : (
            <TableCell sx={{ width: 28, p: '0 4px', cursor: 'grab', color: 'text.disabled' }} {...attributes} {...listeners}>
              <DragIndicatorIcon fontSize="small" />
            </TableCell>
          )
        )}
        <TableCell colSpan={columns.length} sx={{ bgcolor: isChildHeader ? 'grey.50' : 'grey.100', p: '4px 8px', pl: isChildHeader ? 4 : '8px' }}>
          <TextField
            value={(row as any).description ?? ''}
            onChange={(e) => onChange(idx, 'description' as keyof T, e.target.value)}
            variant="standard"
            fullWidth
            disabled={readOnly}
            placeholder={isChildHeader ? 'Sub-section header' : 'Section header'}
            InputProps={{
              disableUnderline: true,
              readOnly,
              sx: {
                fontSize: isChildHeader ? '0.78125rem' : '0.8125rem',
                fontWeight: isChildHeader ? 600 : 700,
                textTransform: isChildHeader ? 'none' : 'uppercase',
                letterSpacing: isChildHeader ? 0 : 0.3,
                fontStyle: isChildHeader ? 'italic' : 'normal',
                color: isChildHeader ? 'primary.light' : 'primary.main',
              },
            }}
            inputProps={{ style: { padding: '6px 4px' } }}
          />
        </TableCell>
        <TableCell align="right" sx={{ p: '0 4px', width: 40 }}>
          {!readOnly && (
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => onDelete(idx)}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow ref={setNodeRef} style={style} hover onContextMenu={(e) => onContextMenu?.(e, row, idx)}>
      {draggable && (
        readOnly ? (
          <TableCell sx={{ width: 28, p: '0 4px', color: 'text.disabled', opacity: 0.3 }}>
            <DragIndicatorIcon fontSize="small" />
          </TableCell>
        ) : (
          <TableCell sx={{ width: 28, p: '0 4px', cursor: 'grab', color: 'text.disabled' }} {...attributes} {...listeners}>
            <DragIndicatorIcon fontSize="small" />
          </TableCell>
        )
      )}
      {columns.map((c) => {
        const value = (row as any)[c.key as string];
        const cellWidth = c.width ? { minWidth: c.width, width: c.width } : {};
        if (c.render) {
          return (
            <TableCell key={String(c.key)} align={c.align ?? 'left'} sx={cellWidth}>
              {c.render(row, idx)}
            </TableCell>
          );
        }
        if (c.editable === false) {
          return (
            <TableCell key={String(c.key)} align={c.align ?? 'left'} sx={{ fontFamily: c.mono ? 'monospace' : undefined, fontSize: '0.8125rem', ...cellWidth }}>
              {value}
            </TableCell>
          );
        }
        return (
          <TableCell key={String(c.key)} align={c.align ?? 'left'} sx={{ p: '4px 8px', ...cellWidth }}>
            {c.type === 'number' ? (
              <NumberCell
                value={value}
                step={c.step}
                min={c.min}
                align={c.align}
                mono={c.mono}
                readOnly={readOnly}
                nullable={c.nullable}
                placeholder={c.placeholder}
                onChange={(v) => onChange(idx, c.key as keyof T, v)}
              />
            ) : (
              <TextCell
                value={value ?? ''}
                align={c.align}
                mono={c.mono}
                readOnly={readOnly}
                multiline={c.multiline}
                onChange={(v) => onChange(idx, c.key as keyof T, v)}
              />
            )}
          </TableCell>
        );
      })}
      <TableCell align="right" sx={{ p: '0 4px', width: 40 }}>
        {!readOnly && (
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => onDelete(idx)}>
              <DeleteIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
}

const fmtCardNumber = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '';

interface SortableCardProps<T extends { id: string }> {
  row: T;
  idx: number;
  columns: Column<T>[];
  draggable: boolean;
  onChange: (idx: number, key: keyof T, value: any) => void;
  onDelete: (idx: number) => void;
  readOnly?: boolean;
  isHeader?: boolean;
  isChildHeader?: boolean;
  subheaderLabel?: string;
  onMenu?: (e: ReactMouseEvent<HTMLElement>, row: T, idx: number) => void;
}

// Portrait-phone version of a table row: a compact card (code, name, a few key
// figures, total) that expands into labelled fields to edit every column.
function SortableCard<T extends { id: string }>({
  row, idx, columns, draggable, onChange, onDelete, readOnly, isHeader, isChildHeader, subheaderLabel, onMenu,
}: SortableCardProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: readOnly });
  const [open, setOpen] = useState(false);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const handle = draggable && (
    <Box
      {...(readOnly ? {} : attributes)} {...(readOnly ? {} : listeners)}
      sx={{ display: 'flex', alignItems: 'center', p: 0.5, color: 'text.disabled', touchAction: 'none', cursor: readOnly ? 'default' : 'grab', opacity: readOnly ? 0.3 : 1 }}
      aria-label="Drag to reorder"
    >
      <DragIndicatorIcon fontSize="small" />
    </Box>
  );
  const menuBtn = onMenu && !readOnly && (
    <IconButton size="small" onClick={(e) => onMenu(e, row, idx)} aria-label="Row actions"><MoreVertIcon fontSize="small" /></IconButton>
  );

  const label = subheaderLabel ? (
    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'primary.dark', letterSpacing: 0.35, textTransform: 'uppercase', px: 0.5, pt: 1, pb: 0.5 }}>
      {subheaderLabel}
    </Typography>
  ) : null;

  if (isHeader || isChildHeader) {
    return (
      <>
        {label}
        <Paper ref={setNodeRef} style={style} variant="outlined" sx={{ mb: 1, bgcolor: isChildHeader ? 'grey.50' : 'grey.100', ml: isChildHeader ? 2 : 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ p: 0.5, pr: 0.5 }}>
            {handle}
            <TextField
              value={(row as any).description ?? ''}
              onChange={(e) => onChange(idx, 'description' as keyof T, e.target.value)}
              variant="standard" fullWidth disabled={readOnly}
              placeholder={isChildHeader ? 'Sub-section header' : 'Section header'}
              InputProps={{
                disableUnderline: true, readOnly,
                sx: {
                  fontSize: '0.8125rem', fontWeight: isChildHeader ? 600 : 700, textTransform: isChildHeader ? 'none' : 'uppercase',
                  letterSpacing: isChildHeader ? 0 : 0.3, fontStyle: isChildHeader ? 'italic' : 'normal',
                  color: isChildHeader ? 'primary.light' : 'primary.main',
                },
              }}
              inputProps={{ style: { padding: '8px 4px' } }}
            />
            {menuBtn}
            {!readOnly && (
              <IconButton size="small" onClick={() => onDelete(idx)} aria-label="Delete header"><DeleteIcon fontSize="small" /></IconButton>
            )}
          </Stack>
        </Paper>
      </>
    );
  }

  const selectCol = columns.find((c) => c.key === '_select');
  const eyebrow = columns.find((c) => c.card === 'eyebrow');
  const title = columns.find((c) => c.card === 'title');
  const summary = columns.filter((c) => c.card === 'summary');
  const total = columns.find((c) => c.card === 'total');
  const valueOf = (c?: Column<T>) => (c ? (row as any)[c.key as string] : undefined);
  const titleText = String(valueOf(title) ?? '').trim();
  const eyebrowText = String(valueOf(eyebrow) ?? '').trim();
  const summaryItems = summary
    .map((c) => {
      const v = valueOf(c);
      const text = c.type === 'number' ? (v ? fmtCardNumber(v) : '') : String(v ?? '').trim();
      return text ? { key: String(c.key), label: c.label, text } : null;
    })
    .filter((x): x is { key: string; label: ReactNode; text: string } => !!x);

  const control = (c: Column<T>) => {
    const value = (row as any)[c.key as string];
    if (c.render) return c.render(row, idx);
    if (c.editable === false) return <Box sx={{ fontFamily: c.mono ? 'monospace' : undefined, fontSize: '0.8125rem', px: 0.5 }}>{value}</Box>;
    return c.type === 'number' ? (
      <NumberCell
        value={value} step={c.step} min={c.min} align="left" mono={c.mono} readOnly={readOnly}
        nullable={c.nullable} placeholder={c.placeholder}
        onChange={(v) => onChange(idx, c.key as keyof T, v)}
      />
    ) : (
      <TextCell
        value={value ?? ''} align="left" mono={c.mono} readOnly={readOnly} multiline={c.multiline}
        onChange={(v) => onChange(idx, c.key as keyof T, v)}
      />
    );
  };

  return (
    <>
      {label}
      <Paper ref={setNodeRef} style={style} variant="outlined" sx={{ mb: 1, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ p: 1, pr: 0.5 }}>
          {handle}
          {selectCol?.render && <Box sx={{ pt: 0.25, display: 'flex' }}>{selectCol.render(row, idx)}</Box>}
          <Box onClick={() => setOpen((o) => !o)} sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            {eyebrowText && (
              <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: 'text.secondary' }}>{eyebrowText}</Typography>
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {titleText || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled', fontWeight: 400 }}>No description</Box>}
            </Typography>
            {(summaryItems.length > 0 || total) && (
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={1} sx={{ mt: 0.5 }}>
                <Stack direction="row" columnGap={1.5} rowGap={0} flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                  {summaryItems.map((it) => (
                    <Typography key={it.key} variant="caption" color="text.secondary">
                      {it.label} <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{it.text}</Box>
                    </Typography>
                  ))}
                </Stack>
                {total && (
                  <Box sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {total.render ? total.render(row, idx) : fmtCardNumber(valueOf(total))}
                  </Box>
                )}
              </Stack>
            )}
          </Box>
          {menuBtn}
          <IconButton size="small" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand to edit'}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>
        <Collapse in={open} unmountOnExit>
          <Divider />
          <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
            {columns.filter((c) => c.key !== '_select').map((c) => {
              const isTitle = c === title;
              const bordered = isTitle || (!c.render && c.editable !== false);
              return (
                <Box key={String(c.key)} sx={{ minWidth: 0, gridColumn: isTitle || c.multiline ? '1 / -1' : undefined }}>
                  {typeof c.label === 'string' && c.label && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>{c.label}</Typography>
                  )}
                  <Box
                    sx={bordered ? {
                      border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, minHeight: 40,
                      display: 'flex', alignItems: 'center', bgcolor: readOnly ? 'action.hover' : 'background.paper',
                      '& > *': { minWidth: 0, flex: 1 },
                    } : { minHeight: 32, display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: '0.8125rem' }}
                  >
                    {control(c)}
                  </Box>
                </Box>
              );
            })}
          </Box>
          {!readOnly && (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => onDelete(idx)}>Delete line</Button>
            </Box>
          )}
        </Collapse>
      </Paper>
    </>
  );
}

export function EditableTable<T extends { id: string }>({
  rows, columns, onChange, onDelete, onReorder, emptyMessage = 'No items', footer, draggable = true, readOnly = false,
  isHeaderRow, isChildHeaderRow, getContextMenu, subheader,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; items: ContextMenuItem[] } | null>(null);
  const handleRowContextMenu = (e: ReactMouseEvent, row: T, idx: number) => {
    if (!getContextMenu || readOnly) return;
    const items = getContextMenu(row, idx);
    if (!items || items.length === 0) return;
    e.preventDefault();
    setCtxMenu({ mouseX: e.clientX - 2, mouseY: e.clientY - 4, items });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = e;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIdx = rows.findIndex((r) => r.id === active.id);
    const newIdx = rows.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(rows, oldIdx, newIdx));
  };

  const enableDrag = draggable && !!onReorder;
  const colSpan = columns.length + 1 + (enableDrag ? 1 : 0);

  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const useCards = isPhone && columns.some((c) => c.card === 'title');

  const openRowMenu = (e: ReactMouseEvent<HTMLElement>, row: T, idx: number) => {
    const items = getContextMenu?.(row, idx);
    if (!items || items.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setCtxMenu({ mouseX: r.left, mouseY: r.bottom, items });
  };

  const rowMenu = (
    <Menu
      open={!!ctxMenu}
      onClose={() => setCtxMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
    >
      {ctxMenu?.items.map((item, i) => [
        item.dividerBefore && <Divider key={`d${i}`} />,
        <MenuItem
          key={i}
          disabled={item.disabled}
          sx={item.danger ? { color: 'error.main' } : undefined}
          onClick={() => { item.onClick(); setCtxMenu(null); }}
        >
          {item.label}
        </MenuItem>,
      ])}
    </Menu>
  );

  if (useCards) {
    return (
      <Box>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((row, idx) => (
              <SortableCard
                key={row.id}
                row={row}
                idx={idx}
                columns={columns}
                draggable={enableDrag}
                onChange={onChange}
                onDelete={onDelete}
                readOnly={readOnly}
                isHeader={isHeaderRow?.(row)}
                isChildHeader={isChildHeaderRow?.(row)}
                subheaderLabel={subheader?.(row, idx)?.trim()}
                onMenu={getContextMenu && (getContextMenu(row, idx)?.length ?? 0) > 0 ? openRowMenu : undefined}
              />
            ))}
          </SortableContext>
        </DndContext>
        {rows.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center', fontStyle: 'italic' }}>{emptyMessage}</Typography>
        )}
        {footer && (
          // The footer is table rows built for the wide table — flex them into simple label/amount lines.
          <Table size="small">
            <TableBody sx={{
              '& tr': { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 },
              '& td': { display: 'block', border: 0, px: 1, py: 0.5 },
              '& td:first-of-type': { flex: 1, textAlign: 'right' },
              '& td:empty': { display: 'none' },
            }}>
              {footer}
            </TableBody>
          </Table>
        )}
        {rowMenu}
      </Box>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table size="small" sx={{ '& .MuiTableCell-root': { borderBottom: '1px solid', borderColor: 'divider' } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              {enableDrag && <TableCell sx={{ width: 28 }} />}
              {columns.map((c) => (
                <TableCell key={String(c.key)} align={c.align ?? 'left'} sx={{ width: c.width, fontWeight: 600, fontSize: '0.75rem' }}>
                  {c.label}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row, idx) => {
                const label = subheader?.(row, idx)?.trim();
                return (
                  <Fragment key={row.id}>
                    {label && (
                      <TableRow sx={{ bgcolor: 'primary.50' }}>
                        <TableCell colSpan={colSpan} sx={{ py: 0.6, fontSize: '0.75rem', fontWeight: 700, color: 'primary.dark', letterSpacing: 0.35, textTransform: 'uppercase' }}>
                          {label}
                        </TableCell>
                      </TableRow>
                    )}
                    <SortableRow
                      row={row}
                      idx={idx}
                      columns={columns}
                      draggable={enableDrag}
                      onChange={onChange}
                      onDelete={onDelete}
                      readOnly={readOnly}
                      isHeader={isHeaderRow?.(row)}
                      isChildHeader={isChildHeaderRow?.(row)}
                      onContextMenu={handleRowContextMenu}
                    />
                  </Fragment>
                );
              })}
            </SortableContext>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ color: 'text.secondary', py: 3, fontStyle: 'italic' }}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {footer}
          </TableBody>
        </Table>
      </DndContext>
      {rowMenu}
    </Box>
  );
}
