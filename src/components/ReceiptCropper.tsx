import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import type { Pt, Quad } from '../utils/receipts/perspectiveCrop';

interface ReceiptCropperProps {
  imageUrl: string;                 // object URL of the photo to crop/preview
  initialQuad: Quad;                // starting corners in fraction coords [TL,TR,BR,BL]
  busy?: boolean;                   // when true: disable both buttons; show a spinner inside "Use photo"
  onConfirm: (quad: Quad) => void;  // called with the CURRENT quad when the user taps "Use photo"
  onRetake: () => void;             // called when the user taps "Retake"
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const clampQuad = (q: Quad): Quad =>
  q.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })) as unknown as Quad;

// Edge index -> the two corner indices it connects (quad is [TL, TR, BR, BL]).
const EDGES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0]];

type DragState =
  | { kind: 'corner'; index: number }
  | { kind: 'edge'; a: number; b: number; startQuad: Quad; startPt: Pt };

export default function ReceiptCropper(props: ReceiptCropperProps): React.ReactElement {
  const { imageUrl, initialQuad, busy, onConfirm, onRetake } = props;

  const [quad, setQuad] = useState<Quad>(() => clampQuad(initialQuad));
  const [imgReady, setImgReady] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const quadRef = useRef<Quad>(quad);

  useEffect(() => { quadRef.current = quad; }, [quad]);

  // Resync when a new photo (new initialQuad identity) arrives.
  useEffect(() => {
    setQuad(clampQuad(initialQuad));
  }, [initialQuad]);

  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLDivElement>): Pt | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  }, []);

  const beginDrag = useCallback((state: DragState, e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = state;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw on some browsers — safe to ignore */
    }
    e.preventDefault();
  }, []);

  // Corners drag absolutely (the handle snaps to the pointer).
  const handleCornerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLDivElement>) => beginDrag({ kind: 'corner', index }, e),
    [beginDrag],
  );

  // Edges drag by delta (both corners of that edge translate together), so the
  // side moves without collapsing into a single point.
  const handleEdgeDown = useCallback(
    (a: number, b: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      const pt = pointFromEvent(e);
      if (!pt) return;
      beginDrag({ kind: 'edge', a, b, startQuad: quadRef.current, startPt: pt }, e);
    },
    [beginDrag, pointFromEvent],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active) return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (active.kind === 'corner') {
      setQuad((prev) => {
        const next = prev.slice() as Quad;
        next[active.index] = pt;
        return next;
      });
    } else {
      const dx = pt.x - active.startPt.x;
      const dy = pt.y - active.startPt.y;
      setQuad((prev) => {
        const next = prev.slice() as Quad;
        next[active.a] = { x: clamp01(active.startQuad[active.a].x + dx), y: clamp01(active.startQuad[active.a].y + dy) };
        next[active.b] = { x: clamp01(active.startQuad[active.b].x + dx), y: clamp01(active.startQuad[active.b].y + dy) };
        return next;
      });
    }
  }, [pointFromEvent]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const ptStr = (p: Pt): string => `${p.x} ${p.y}`;

  // evenodd mask: full unit square MINUS the quad => dims everything outside.
  const maskPath =
    'M0 0 H1 V1 H0 Z ' +
    `M${ptStr(quad[0])} L${ptStr(quad[1])} L${ptStr(quad[2])} L${ptStr(quad[3])} Z`;

  const polygonPoints = quad.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        sx={{
          position: 'relative',
          width: '100%',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <Box
          component="img"
          src={imageUrl}
          alt="receipt to crop"
          draggable={false}
          onLoad={() => setImgReady(true)}
          sx={{ width: '100%', display: 'block', borderRadius: 1 }}
        />

        {imgReady && (
          <>
            <Box
              component="svg"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              <path d={maskPath} fillRule="evenodd" fill="rgba(0,0,0,0.45)" />
              <polygon
                points={polygonPoints}
                fill="none"
                stroke="#1976d2"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </Box>

            {EDGES.map(([a, b], edgeIndex) => {
              const mx = (quad[a].x + quad[b].x) / 2;
              const my = (quad[a].y + quad[b].y) / 2;
              return (
                <Box
                  key={`edge-${edgeIndex}`}
                  onPointerDown={handleEdgeDown(a, b)}
                  style={{ left: `${mx * 100}%`, top: `${my * 100}%` }}
                  sx={{
                    position: 'absolute',
                    width: 20,
                    height: 20,
                    mt: '-10px',
                    ml: '-10px',
                    borderRadius: '50%',
                    bgcolor: 'rgba(25,118,210,0.85)',
                    border: '2px solid #fff',
                    boxShadow: 1,
                    touchAction: 'none',
                    cursor: 'grab',
                  }}
                />
              );
            })}

            {quad.map((corner, index) => (
              <Box
                key={index}
                onPointerDown={handleCornerDown(index)}
                style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                sx={{
                  position: 'absolute',
                  width: 28,
                  height: 28,
                  mt: '-14px',
                  ml: '-14px',
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  border: '3px solid #1976d2',
                  boxShadow: 1,
                  touchAction: 'none',
                  cursor: 'grab',
                }}
              />
            ))}
          </>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Drag the corners or the edges onto the receipt, then tap Use photo.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button variant="outlined" fullWidth disabled={!!busy} onClick={onRetake}>
          Retake
        </Button>
        <Button
          variant="contained"
          color="success"
          fullWidth
          disabled={!!busy}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          onClick={() => onConfirm(quad)}
        >
          {busy ? 'Flattening…' : 'Use photo'}
        </Button>
      </Box>
    </Box>
  );
}
