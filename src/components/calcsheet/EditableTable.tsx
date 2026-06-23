import { Box, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { ReactNode, CSSProperties } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  type?: 'text' | 'number';
  render?: (row: T, idx: number) => ReactNode;
  editable?: boolean;
  step?: number;
  min?: number;
  mono?: boolean;
  multiline?: boolean;
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
}

function NumberCell({
  value, step, min, align, mono, onChange, readOnly,
}: { value: number; step?: number; min?: number; align?: 'left' | 'right' | 'center'; mono?: boolean; onChange: (v: number) => void; readOnly?: boolean }) {
  const display = value === 0 ? '' : String(value);
  return (
    <TextField
      value={display}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onFocus={(e) => e.target.select()}
      type="number"
      variant="standard"
      placeholder="0"
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
}

function SortableRow<T extends { id: string }>({
  row, idx, columns, draggable, onChange, onDelete, readOnly,
}: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: readOnly });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    backgroundColor: isDragging ? '#F0F4FF' : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} hover>
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
                value={value ?? 0}
                step={c.step}
                min={c.min}
                align={c.align}
                mono={c.mono}
                readOnly={readOnly}
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

export function EditableTable<T extends { id: string }>({
  rows, columns, onChange, onDelete, onReorder, emptyMessage = 'No items', footer, draggable = true, readOnly = false,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
              {rows.map((row, idx) => (
                <SortableRow
                  key={row.id}
                  row={row}
                  idx={idx}
                  columns={columns}
                  draggable={enableDrag}
                  onChange={onChange}
                  onDelete={onDelete}
                  readOnly={readOnly}
                />
              ))}
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
    </Box>
  );
}
