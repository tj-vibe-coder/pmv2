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

export default function ReceiptCropper(props: ReceiptCropperProps): React.ReactElement {
  const { imageUrl, initialQuad, busy, onConfirm, onRetake } = props;

  const [quad, setQuad] = useState<Quad>(() => clampQuad(initialQuad));
  const [imgReady, setImgReady] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<number | null>(null);

  // Resync when a new photo (new initialQuad identity) arrives.
  useEffect(() => {
    setQuad(clampQuad(initialQuad));
  }, [initialQuad]);

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      activeRef.current = index;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture can throw on some browsers — safe to ignore */
      }
      e.preventDefault();
    },
    [],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const active = activeRef.current;
    if (active === null) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = clamp01((e.clientX - rect.left) / rect.width);
    const fy = clamp01((e.clientY - rect.top) / rect.height);
    setQuad((prev) => {
      const next = prev.slice() as Quad;
      next[active] = { x: fx, y: fy };
      return next;
    });
  }, []);

  const endDrag = useCallback(() => {
    activeRef.current = null;
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

            {quad.map((corner, index) => (
              <Box
                key={index}
                onPointerDown={handlePointerDown(index)}
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
        Drag the 4 corners onto the receipt, then tap Use photo.
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
