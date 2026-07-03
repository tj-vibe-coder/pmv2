import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { PHP } from '../../utils/calcsheet/calc';
import type { Quotation, QuotationTotals } from '../../types/Quotation';

const POSITION_KEY = 'calcsheet:floatingTotalsPos';
const WIDGET_WIDTH = 260;

type Pos = { x: number; y: number };

function loadPosition(): Pos {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
    }
  } catch { /* ignore malformed/unavailable storage */ }
  return { x: Math.max(16, window.innerWidth - WIDGET_WIDTH - 32), y: 96 };
}

function clamp(pos: Pos): Pos {
  const maxX = Math.max(0, window.innerWidth - WIDGET_WIDTH);
  const maxY = Math.max(0, window.innerHeight - 80);
  return { x: Math.min(Math.max(0, pos.x), maxX), y: Math.min(Math.max(0, pos.y), maxY) };
}

interface MarginSummary {
  value: number;
  pct: number;
  contingency: number;
  contingencyPct: number;
}

export function FloatingTotalsWidget({
  totals, marginSummary, quotation, onClose,
}: {
  totals: QuotationTotals;
  marginSummary: MarginSummary | null;
  quotation: Quotation;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<Pos>(() => clamp(loadPosition()));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    setPos(clamp({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    setPos((p) => {
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      return p;
    });
  }, [onPointerMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: WIDGET_WIDTH,
        zIndex: 1200,
        borderRadius: 2,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        onPointerDown={onPointerDown}
        sx={{ px: 1, py: 0.5, bgcolor: 'grey.900', color: 'white', cursor: 'grab', touchAction: 'none' }}
      >
        <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.6, mr: 0.5 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>Live Totals</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Stack>
      <Box sx={{ p: 1.5 }}>
        <Stack spacing={0.5} sx={{ mb: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Subtotal (VAT-EX)</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{PHP(totals.subtotal)}</Typography>
          </Stack>
          {quotation.discountPct > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Discount ({quotation.discountPct}%)</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'error.main' }}>− {PHP(totals.discount)}</Typography>
            </Stack>
          )}
          {quotation.vatPct > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">VAT ({quotation.vatPct}%)</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{PHP(totals.vat)}</Typography>
            </Stack>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
          {([
            ['GenReq', totals.generalReqtsSubtotal],
            ['Product', totals.componentsSubtotal],
            ['Labor', totals.servicesSubtotal],
          ] as const).map(([label, value]) => (
            <Box key={label} sx={{ flex: 1, textAlign: 'center', p: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>{label}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {totals.subtotal > 0 ? `${((value / totals.subtotal) * 100).toFixed(1)}%` : '—'}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Box sx={{ p: 1, mb: 1, border: '1px solid', borderColor: 'success.light', borderRadius: 1, bgcolor: 'rgba(46,125,50,0.05)' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Margin (markup only)</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'success.dark', fontWeight: 700 }}>
            {PHP(marginSummary?.value ?? 0)} <Typography component="span" variant="caption" sx={{ color: 'success.dark' }}>({(marginSummary?.pct ?? 0).toFixed(1)}%)</Typography>
          </Typography>
        </Box>
        <Box sx={{ p: 1, bgcolor: 'primary.main', borderRadius: 1, textAlign: 'right' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', display: 'block' }}>GRAND TOTAL</Typography>
          <Typography variant="h6" sx={{ fontFamily: 'monospace', color: 'white', fontWeight: 700 }}>
            {PHP(totals.grandTotal)}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
