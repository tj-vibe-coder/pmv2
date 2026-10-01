import { Box, Typography } from '@mui/material';
import type { Layer, View } from '../../utils/calcsheet/panelLayout';
import { expandView, sheetScale, viewBox } from '../../utils/calcsheet/panelDrawing';

// On-screen preview of one drawing view — the same primitives and scale as the
// PDF / DXF, drawn as SVG in model millimetres.

const STROKE_MM: Record<Layer, number> = { OUTLINE: 0.5, PLATE: 0.35, DUCT: 0.18, RAIL: 0.18, DEVICE: 0.25, DIM: 0.13, TEXT: 0.13, HIDDEN: 0.18 };
const DIM_COLOR = '#c62828';

export default function PanelDrawingPreview({ view, height = 440 }: { view: View; height?: number }) {
  const k = sheetScale([view]);
  const box = viewBox(view, k);
  const prims = expandView(view, k);
  return (
    <Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', bgcolor: '#fff', height, display: 'flex', justifyContent: 'center' }}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} style={{ width: '100%', height: '100%' }} role="img" aria-label={view.title}>
          {prims.map((p, i) => {
            const stroke = p.layer === 'DIM' ? DIM_COLOR : '#222';
            const sw = STROKE_MM[p.layer] * k;
            if (p.t === 'rect') return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ?? 'none'} stroke={stroke} strokeWidth={sw} />;
            if (p.t === 'line') return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={stroke} strokeWidth={sw} strokeDasharray={p.dash ? `${2 * k} ${1 * k}` : undefined} />;
            return (
              <text key={i} x={p.x} y={p.y} fontSize={p.h} fontFamily="Helvetica, Arial, sans-serif" fill={p.layer === 'DIM' ? DIM_COLOR : '#222'}
                textAnchor={p.anchor} transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}>
                {p.text}
              </text>
            );
          })}
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary">{view.title} · scale 1:{k} on A3</Typography>
    </Box>
  );
}
