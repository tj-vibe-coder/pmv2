import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Paper, Box, Typography, IconButton, Link, CircularProgress, Tooltip } from '@mui/material';
import {
  DragIndicator as DragIndicatorIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

interface ReceiptViewerProps {
  title: React.ReactNode;
  // Blob URL of the fetched receipt, or null while it's still loading.
  url: string | null;
  webUrl?: string | null;
  isPdf?: boolean;
  onClose: () => void;
  headerColor: string;
  // Bakes the current rotation into real pixels and uploads the result back to
  // OneDrive in place (same item id/webUrl) so a plain download — not just this
  // in-app viewer — comes out upright. Omit to keep rotation view-only.
  onSaveRotation?: (rotatedBlob: Blob) => Promise<void>;
}

const CHROME_HEIGHT = 96; // header + footer link row, roughly — content area is sized around this
const MIN_PANE_WIDTH = 260;
const MAX_PANE_WIDTH_VW = 0.92;
const MAX_CONTENT_HEIGHT_VH = 0.62;

// Floating, draggable receipt viewer pane shared by Expense Monitoring, Tax
// Ledger, and Liquidation. Rotating is a CSS transform for instant feedback;
// "Save" (when wired up) bakes it into the actual file bytes and overwrites the
// same OneDrive item, so the fix persists and survives a plain download too.
// The pane auto-sizes to the receipt's actual aspect ratio (swapped at
// 90/270) instead of a fixed width, so a rotated photo isn't stuck scrolling
// inside a portrait-shaped box.
export default function ReceiptViewer({ title, url, webUrl, isPdf, onClose, headerColor, onSaveRotation }: ReceiptViewerProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [bakedUrl, setBakedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setPos({ x: 0, y: 0 });
    setRotation(0);
    setNatural(null);
    setSaveError(null);
    setBakedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [url]);

  const displayUrl = bakedUrl || url;

  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({ x: d.baseX + ev.clientX - d.startX, y: d.baseY + ev.clientY - d.startY });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Fit the rotated image's bounding box inside the viewport, then size the
  // content area (and thus the pane) to that box instead of a fixed width.
  const fitted = useMemo(() => {
    if (!natural) return null;
    const rotated = rotation % 180 !== 0;
    const iw = rotated ? natural.h : natural.w;
    const ih = rotated ? natural.w : natural.h;
    const maxW = Math.min(window.innerWidth * MAX_PANE_WIDTH_VW, 720);
    const maxH = window.innerHeight * MAX_CONTENT_HEIGHT_VH;
    const scale = Math.min(maxW / iw, maxH / ih, 1.4);
    return { boxW: iw * scale, boxH: ih * scale, imgW: natural.w * scale, imgH: natural.h * scale };
  }, [natural, rotation]);

  const paneWidth = fitted ? Math.max(MIN_PANE_WIDTH, fitted.boxW + 24) : 380;

  const handleSaveRotation = async () => {
    if (!onSaveRotation || rotation === 0 || !imgRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const img = imgRef.current;
      const swapped = rotation % 180 !== 0;
      const w = swapped ? img.naturalHeight : img.naturalWidth;
      const h = swapped ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.92);
      });
      await onSaveRotation(blob);
      // Show the baked result immediately instead of waiting on a refetch.
      setBakedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setRotation(0);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save rotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        top: `calc(15% + ${pos.y}px)`,
        left: `calc(50% + ${pos.x}px)`,
        transform: 'translateX(-50%)',
        zIndex: (theme) => theme.zIndex.modal + 1,
        width: paneWidth,
        maxWidth: '92vw',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'width 0.15s ease',
      }}
    >
      <Box
        onPointerDown={onDragStart}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75,
          bgcolor: headerColor, color: 'white',
          cursor: 'move', userSelect: 'none', touchAction: 'none',
        }}
      >
        <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.7, mr: 0.5 }} />
        <Typography variant="subtitle2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </Typography>
        {displayUrl && !isPdf && (
          <>
            <IconButton size="small" onClick={() => setRotation((r) => (r - 90 + 360) % 360)} sx={{ color: 'white' }} title="Rotate left" disabled={saving}>
              <RotateLeftIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setRotation((r) => (r + 90) % 360)} sx={{ color: 'white' }} title="Rotate right" disabled={saving}>
              <RotateRightIcon fontSize="small" />
            </IconButton>
            {onSaveRotation && rotation !== 0 && (
              <Tooltip title="Save rotation to the file (persists, even on download)">
                <span>
                  <IconButton size="small" onClick={handleSaveRotation} sx={{ color: 'white' }} disabled={saving}>
                    {saving ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <SaveIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </>
        )}
        <IconButton size="small" onClick={onClose} sx={{ color: 'white' }} title="Close" disabled={saving}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{
          p: 1.5,
          maxHeight: `calc(90vh - ${CHROME_HEIGHT}px)`,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#f8fafc',
        }}
      >
        {displayUrl ? (
          isPdf ? (
            <Box component="iframe" src={displayUrl} title="receipt" sx={{ width: '100%', height: '50vh', border: 0, borderRadius: 1, bgcolor: 'white' }} />
          ) : (
            <Box
              sx={{
                width: fitted ? fitted.boxW : undefined,
                height: fitted ? fitted.boxH : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                component="img"
                ref={imgRef}
                src={displayUrl}
                alt="receipt"
                onLoad={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                sx={{
                  width: fitted ? fitted.imgW : 'auto',
                  height: fitted ? fitted.imgH : 'auto',
                  maxWidth: fitted ? 'none' : '100%',
                  borderRadius: 1,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease',
                }}
              />
            </Box>
          )
        ) : (
          <Box sx={{ py: 6 }}><CircularProgress size={28} /></Box>
        )}
      </Box>
      {saveError && (
        <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#fdecea', color: '#611a15', fontSize: '0.75rem' }}>
          {saveError}
        </Box>
      )}
      {webUrl && (
        <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
          <Link href={webUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <OpenInNewIcon fontSize="inherit" /> Open in OneDrive
          </Link>
        </Box>
      )}
    </Paper>
  );
}
