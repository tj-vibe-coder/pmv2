import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Slider, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import MergeIcon from '@mui/icons-material/CallMerge';
import AddIcon from '@mui/icons-material/Add';
import { DUCT_H_H, DUCT_V_W, type PanelLayout, type Placed } from '../../utils/calcsheet/panelLayout';
import {
  addRow, joinWithNext, moveItem, nudgeItem, removeRow, restack, cloneLayout, rowAt, splitItem,
  type EditResult, type ItemRef,
} from '../../utils/calcsheet/panelLayoutEdit';

// Mounting-plate layout editor: every bay's plate side by side, to scale.
// Drag a device or a terminal / relay run onto another row (or another bay),
// nudge it along the rail, split a run into two pieces to spread it over
// rows, add or remove rail rows. Done hands the edited layout back to the
// Control Panel dialog, which uses it for the drawings and the rail / duct
// quantities.

const BAY_GAP = 120; // mm between bays on screen
const ZONE_FILL: Record<Placed['zone'], string> = { power: '#fde2c8', control: '#d6e6fb', relays: '#fff3b0', terminals: '#dcefd8' };

interface Props {
  open: boolean;
  /** Layout to start from (the current one — edited or auto). */
  layout: PanelLayout;
  /** The auto layout, for "Reset to auto". */
  autoLayout: PanelLayout;
  onCancel: () => void;
  /** null = go back to the auto layout. */
  onDone: (layout: PanelLayout | null) => void;
}

interface Drag { ref: ItemRef; grabDx: number; grabDy: number; x: number; y: number; moved: boolean }

export default function PanelLayoutEditor({ open, layout: initial, autoLayout, onCancel, onDone }: Props) {
  const [layout, setLayout] = useState<PanelLayout>(() => restack(cloneLayout(initial)));
  const [history, setHistory] = useState<PanelLayout[]>([]);
  const [isAuto, setIsAuto] = useState(false);
  const [sel, setSel] = useState<ItemRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [splitAt, setSplitAt] = useState('');
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Canvas size, so zoom 1 = the whole panel fits. A callback ref — the
  // dialog's portal mounts its content after this component's effects run.
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxEl;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const t = window.setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', measure); ro?.disconnect(); };
  }, [boxEl]);

  // Start over from the layout passed in each time the editor opens.
  useEffect(() => {
    if (open) { setLayout(restack(cloneLayout(initial))); setHistory([]); setSel(null); setError(null); setIsAuto(false); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const plate = layout.bays[0]?.plate ?? { w: 0, h: 0 };
  const totalW = layout.bays.length * plate.w + (layout.bays.length - 1) * BAY_GAP;
  const bayX = (b: number) => b * (plate.w + BAY_GAP);
  const selected = sel ? layout.bays[sel.bay]?.rows[sel.row]?.items[sel.item] : undefined;

  // Row numbers across the panel (as on the drawings).
  const rowNo = useMemo(() => {
    const m: number[][] = [];
    let n = 0;
    layout.bays.forEach((b, bi) => { m[bi] = b.rows.map(() => ++n); });
    return m;
  }, [layout]);

  const apply = (res: EditResult, keepSel?: ItemRef | null) => {
    if (res.error) { setError(res.error); return false; }
    setHistory((h) => [...h.slice(-49), layout]);
    setLayout(res.layout);
    setIsAuto(false);
    setError(null);
    if (keepSel !== undefined) setSel(keepSel);
    return true;
  };
  const undo = () => {
    if (!history.length) return;
    setLayout(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSel(null);
    setError(null);
  };
  const resetAuto = () => {
    setHistory((h) => [...h.slice(-49), layout]);
    setLayout(restack(cloneLayout(autoLayout)));
    setSel(null);
    setError(null);
    setIsAuto(true);
  };

  // Find an item again after an edit re-sorted its row (by tag + x).
  const locate = (l: PanelLayout, bay: number, tag: string, x: number): ItemRef | null => {
    for (let r = 0; r < l.bays[bay].rows.length; r++) {
      const i = l.bays[bay].rows[r].items.findIndex((it) => it.tag === tag && Math.abs(it.x - x) < 0.5);
      if (i >= 0) return { bay, row: r, item: i };
    }
    return null;
  };

  const nudge = (dx: number) => {
    if (!sel || !selected) return;
    const res = nudgeItem(layout, sel, dx);
    if (res.error) { setError(res.error); return; }
    const moved = res.layout.bays[sel.bay].rows[sel.row].items.find((it) => it.tag === selected.tag && it.count === selected.count && it.label === selected.label
      && Math.abs(it.x - (selected.x + dx)) <= Math.abs(dx) + 0.5);
    apply(res, moved ? locate(res.layout, sel.bay, moved.tag, moved.x) : null);
  };

  // Keyboard: ←/→ nudge 1 mm (Shift: 10 mm), Ctrl/⌘+Z undo, Esc deselect.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape' && sel) { e.stopPropagation(); setSel(null); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!sel) return;
        e.preventDefault();
        nudge((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pointer → plate millimetres.
  const toMm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const bayAt = (x: number) => {
    const b = Math.floor((x + BAY_GAP / 2) / (plate.w + BAY_GAP));
    return Math.min(layout.bays.length - 1, Math.max(0, b));
  };

  const onItemDown = (e: ReactPointerEvent, ref: ItemRef, it: Placed) => {
    e.stopPropagation();
    const p = toMm(e.clientX, e.clientY);
    setSel(ref);
    setSplitAt(it.count > 1 ? String(Math.floor(it.count / 2)) : '');
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ ref, grabDx: p.x - (bayX(ref.bay) + it.x), grabDy: p.y - it.y, x: p.x, y: p.y, moved: false });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toMm(e.clientX, e.clientY);
    if (!p) return;
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 3;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
  };
  const target = (() => {
    if (!drag?.moved) return null;
    const bay = bayAt(drag.x);
    const it = layout.bays[drag.ref.bay].rows[drag.ref.row].items[drag.ref.item];
    const row = rowAt(layout, bay, drag.y - drag.grabDy + it.h / 2);
    return row >= 0 ? { bay, row, x: drag.x - drag.grabDx - bayX(bay) } : null;
  })();
  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    if (!target) { setError('Drop it on a rail row'); return; }
    const it = layout.bays[d.ref.bay].rows[d.ref.row].items[d.ref.item];
    const res = moveItem(layout, d.ref, { bay: target.bay, row: target.row }, target.x);
    if (res.error) { setError(res.error); return; }
    const r = res.layout.bays[target.bay].rows[target.row];
    const idx = r.items.findIndex((x) => x.tag === it.tag && x.label === it.label && x.count === it.count && Math.abs(x.x - target.x) < it.w + 1);
    apply(res, idx >= 0 ? { bay: target.bay, row: target.row, item: idx } : null);
  };

  const split = () => {
    if (!sel || !selected) return;
    const n = Number(splitAt);
    apply(splitItem(layout, sel, n), { ...sel });
  };
  const join = () => { if (sel) apply(joinWithNext(layout, sel), { ...sel }); };

  const draggedItem = drag?.moved ? layout.bays[drag.ref.bay].rows[drag.ref.row].items[drag.ref.item] : null;
  const pad = 30;
  const vbW = totalW + 2 * pad;
  const vbH = plate.h + 2 * pad + 40;
  const vb = `${-pad} ${-pad - 30} ${vbW} ${vbH}`;
  // Zoom 1 fits the whole panel in the canvas; zooming in scrolls.
  const fit = box.w && box.h ? Math.min((box.w - 12) / vbW, (box.h - 12) / vbH) : 0.42;
  const pxPerMm = Math.max(0.05, fit) * zoom;

  return (
    <Dialog open={open} onClose={onCancel} fullScreen>
      <DialogTitle sx={{ pb: 1 }}>
        Edit mounting-plate layout
        <Typography variant="body2" color="text.secondary">
          Drag a device or a terminal / relay run onto another rail row or bay. Click one to select it — nudge it with ← → (Shift = 10 mm),
          split a run to spread it over rows. Ctrl+Z undoes.
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" startIcon={<UndoIcon />} onClick={undo} disabled={!history.length}>Undo</Button>
          <Button size="small" onClick={resetAuto}>Reset to auto layout</Button>
          {layout.bays.map((_, bi) => (
            <Button key={bi} size="small" startIcon={<AddIcon />} onClick={() => apply(addRow(layout, bi))}>
              Rail row{layout.bays.length > 1 ? ` (bay ${bi + 1})` : ''}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">Zoom</Typography>
          <Slider size="small" value={zoom} min={1} max={6} step={0.5} onChange={(_, v) => setZoom(v as number)} sx={{ width: 120 }} aria-label="Zoom" />
          <Chip size="small" label={layout.fits ? 'Fits' : 'Check layout'} color={layout.fits ? 'success' : 'warning'} />
        </Stack>
        {error && <Alert severity="warning" onClose={() => setError(null)} sx={{ py: 0 }}>{error}</Alert>}
        {!layout.fits && layout.unplaced.length > 0 && <Alert severity="warning" sx={{ py: 0 }}>{layout.unplaced.join(' · ')}</Alert>}

        {/* Selected item */}
        <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 0.5, borderRadius: 1, bgcolor: selected ? 'action.hover' : 'transparent' }}>
          {selected && sel ? (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>-{selected.tag}</Typography>
              <Typography variant="body2">{selected.label}{selected.count > 1 ? ` × ${selected.count}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round(selected.w * 10) / 10} × {selected.h} mm · row {rowNo[sel.bay][sel.row]}{layout.bays.length > 1 ? `, bay ${sel.bay + 1}` : ''} · x = {Math.round(selected.x)} mm
              </Typography>
              <Tooltip title="Nudge left (←)"><IconButton size="small" onClick={() => nudge(-5)} aria-label="Nudge left"><ChevronLeftIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Nudge right (→)"><IconButton size="small" onClick={() => nudge(5)} aria-label="Nudge right"><ChevronRightIcon fontSize="small" /></IconButton></Tooltip>
              {selected.count > 1 && (
                <>
                  <TextField size="small" label="Split after" value={splitAt} onChange={(e) => setSplitAt(e.target.value.replace(/[^0-9]/g, ''))}
                    sx={{ width: 110 }} inputProps={{ inputMode: 'numeric' }} />
                  <Button size="small" startIcon={<CallSplitIcon />} onClick={split}>Split run</Button>
                </>
              )}
              <Button size="small" startIcon={<MergeIcon />} onClick={join}>Join with next</Button>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">Click a device to select it.</Typography>
          )}
        </Box>

        <Box ref={setBoxEl} sx={{ flex: '1 1 0px', minHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', bgcolor: '#fafafa' }}>
          <svg
            ref={svgRef} viewBox={vb}
            width={vbW * pxPerMm} height={vbH * pxPerMm}
            style={{ display: 'block', touchAction: drag ? 'none' : 'auto', userSelect: 'none' }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
            onPointerDown={() => setSel(null)}
            role="img" aria-label="Mounting plate layout editor"
          >
            {layout.bays.map((b, bi) => {
              const ox = bayX(bi);
              return (
                <g key={bi} transform={`translate(${ox} 0)`}>
                  {layout.bays.length > 1 && <text x={b.plate.w / 2} y={-12} fontSize={22} textAnchor="middle" fill="#555">BAY {bi + 1}</text>}
                  <rect x={0} y={0} width={b.plate.w} height={b.plate.h} fill="#fff" stroke="#333" strokeWidth={2} />
                  <rect x={0} y={0} width={DUCT_V_W} height={b.plate.h} fill="#eee" stroke="#aaa" />
                  <rect x={b.plate.w - DUCT_V_W} y={0} width={DUCT_V_W} height={b.plate.h} fill="#eee" stroke="#aaa" />
                  {b.rows.map((r, ri) => {
                    const isTarget = target && target.bay === bi && target.row === ri;
                    return (
                      <g key={ri}>
                        <rect x={DUCT_V_W} y={r.y - DUCT_H_H} width={b.plate.w - 2 * DUCT_V_W} height={DUCT_H_H} fill="#eee" stroke="#ccc" />
                        <rect x={DUCT_V_W} y={r.y} width={b.plate.w - 2 * DUCT_V_W} height={r.h} fill={isTarget ? '#e3f2fd' : 'transparent'} stroke={isTarget ? '#1976d2' : 'none'} strokeDasharray="8 6" strokeWidth={2} />
                        <rect x={DUCT_V_W} y={r.y + r.h / 2 - 17.5} width={b.plate.w - 2 * DUCT_V_W} height={35} fill="#f3f3f3" stroke="#bbb" />
                        <text x={DUCT_V_W / 2} y={r.y + r.h / 2 + 7} fontSize={20} textAnchor="middle" fill="#777">{rowNo[bi][ri]}</text>
                        {r.items.length === 0 && (
                          <text x={b.plate.w / 2} y={r.y + r.h / 2 + 7} fontSize={18} textAnchor="middle" fill="#999">empty rail row</text>
                        )}
                        {r.items.map((it, ii) => {
                          const isSel = sel?.bay === bi && sel.row === ri && sel.item === ii;
                          const unit = it.w / it.count;
                          const step = Math.max(1, Math.ceil(10 / unit));
                          return (
                            <g key={ii} style={{ cursor: 'grab', opacity: drag?.moved && drag.ref.bay === bi && drag.ref.row === ri && drag.ref.item === ii ? 0.35 : 1 }}
                              onPointerDown={(e) => onItemDown(e, { bay: bi, row: ri, item: ii }, it)}
                              data-testid={`item-${it.tag}-${bi}-${ri}-${ii}`}>
                              <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={ZONE_FILL[it.zone]} stroke={isSel ? '#1565c0' : '#444'} strokeWidth={isSel ? 4 : 1.2} />
                              {it.count > 1 && Array.from({ length: Math.floor((it.count - 1) / step) }, (_, k) => (k + 1) * step).map((k) => (
                                <line key={k} x1={it.x + k * unit} y1={it.y} x2={it.x + k * unit} y2={it.y + it.h} stroke="#777" strokeWidth={0.6} />
                              ))}
                              <text x={it.x + it.w / 2} y={it.w >= 30 ? it.y - 5 : it.y + it.h / 2} fontSize={it.w >= 30 ? 16 : 13} textAnchor="middle" fill="#222"
                                transform={it.w >= 30 ? undefined : `rotate(-90 ${it.x + it.w / 2} ${it.y + it.h / 2})`}>
                                -{it.tag}{it.count > 1 ? ` (${it.count})` : ''}
                              </text>
                            </g>
                          );
                        })}
                        {r.items.length === 0 && (
                          <g style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); apply(removeRow(layout, bi, ri)); }}>
                            <rect x={b.plate.w - DUCT_V_W - 46} y={r.y + r.h / 2 - 18} width={36} height={36} rx={6} fill="#fff" stroke="#c62828" />
                            <text x={b.plate.w - DUCT_V_W - 28} y={r.y + r.h / 2 + 7} fontSize={22} textAnchor="middle" fill="#c62828">×</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  {b.rows.length > 0 && (
                    <rect x={DUCT_V_W} y={b.rows[b.rows.length - 1].y + b.rows[b.rows.length - 1].h} width={b.plate.w - 2 * DUCT_V_W} height={DUCT_H_H} fill="#eee" stroke="#ccc" />
                  )}
                </g>
              );
            })}
            {draggedItem && drag && (
              <rect x={drag.x - drag.grabDx} y={drag.y - drag.grabDy} width={draggedItem.w} height={draggedItem.h}
                fill={ZONE_FILL[draggedItem.zone]} stroke={target ? '#1565c0' : '#c62828'} strokeWidth={3} opacity={0.85} pointerEvents="none" />
            )}
          </svg>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {layout.rowCount} rail row{layout.rowCount === 1 ? '' : 's'} · rail {(layout.railMm / 1000).toFixed(1)} m · horizontal duct {(layout.ductHMm / 1000).toFixed(1)} m.
          Removing an empty row: the × at its right end.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => onDone(isAuto ? null : layout)}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
