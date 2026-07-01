import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, IconButton, Modal, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { makeThumb } from '../utils/receipts/imageUtils';

interface Shot {
  id: string;
  blob: Blob;
  thumbUrl: string;
}

interface LiveCameraCaptureProps {
  onDone: (files: File[]) => void;
  onCancel: () => void;
  onFallbackToPicker: () => void;
  maxPhotos?: number;
}

type Status = 'initializing' | 'ready' | 'error';

const errorMessageFor = (err: unknown): string => {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera permission denied. Allow camera access in your browser settings to take photos.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera found on this device.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'Camera is already in use by another app.';
  return 'Could not access the camera.';
};

const LiveCameraCapture: React.FC<LiveCameraCaptureProps> = ({ onDone, onCancel, onFallbackToPicker, maxPhotos = 25 }) => {
  const [status, setStatus] = useState<Status>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('initializing');
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('This browser does not support camera capture.');
      setStatus('error');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus('ready');
    }).catch((err) => {
      if (cancelled) return;
      setErrorMessage(errorMessageFor(err));
      setStatus('error');
    });

    return () => { cancelled = true; stopStream(); };
  }, [retryTick, stopStream]);

  useEffect(() => () => {
    shots.forEach((s) => URL.revokeObjectURL(s.thumbUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!video || status !== 'ready' || capturing || shots.length >= maxPhotos) return;
    setCapturing(true);
    try {
      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) return;
      const thumbUrl = await makeThumb(blob);
      setShots((prev) => [...prev, { id: `shot-${Date.now()}-${prev.length}`, blob, thumbUrl }]);
    } finally {
      setCapturing(false);
    }
  };

  const removeShot = (id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.thumbUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const handleDone = () => {
    stopStream();
    const files = shots.map((s, i) => new File([s.blob], `camera-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' }));
    onDone(files);
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  const handleFallback = () => {
    stopStream();
    onFallbackToPicker();
  };

  return (
    <Modal open onClose={handleCancel}>
      <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#000', display: 'flex', flexDirection: 'column', outline: 'none' }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, pt: 'max(16px, env(safe-area-inset-top))', pb: 1,
        }}>
          <IconButton onClick={handleCancel} aria-label="close" sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
          <Typography variant="body2" sx={{ color: '#fff' }}>{shots.length} photo{shots.length === 1 ? '' : 's'}</Typography>
        </Box>

        {status === 'error' ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, gap: 2 }}>
            <Alert severity="warning" sx={{ maxWidth: 360 }}>{errorMessage}</Alert>
            <Button variant="contained" fullWidth sx={{ maxWidth: 320 }} onClick={() => setRetryTick((t) => t + 1)}>Try Again</Button>
            <Button variant="outlined" fullWidth sx={{ maxWidth: 320, color: '#fff', borderColor: '#fff' }} onClick={handleFallback}>Choose from Library</Button>
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </Box>
        )}

        {status !== 'error' && (
          <Box sx={{ pb: 'max(16px, env(safe-area-inset-bottom))', pt: 1.5 }}>
            {shots.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', px: 2, mb: 1.5 }}>
                {shots.map((s) => (
                  <Box key={s.id} sx={{ position: 'relative', flex: '0 0 auto' }}>
                    <Box component="img" src={s.thumbUrl} alt="" sx={{ width: 56, height: 56, borderRadius: 1, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)' }} />
                    <IconButton size="small" onClick={() => removeShot(s.id)} aria-label="remove photo"
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', p: 0.3, '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' } }}>
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, px: 2 }}>
              <IconButton onClick={handleShutter} disabled={status !== 'ready' || capturing || shots.length >= maxPhotos}
                aria-label="take photo"
                sx={{
                  width: 72, height: 72, bgcolor: '#fff', border: '4px solid rgba(255,255,255,0.4)',
                  '&:hover': { bgcolor: '#eee' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.4)' },
                }}>
                <CameraAltIcon sx={{ fontSize: 32, color: '#000' }} />
              </IconButton>
            </Box>
            <Box sx={{ px: 2, mt: 1.5 }}>
              <Button variant="contained" color="success" fullWidth size="large" disabled={shots.length === 0} onClick={handleDone}>
                Done{shots.length > 0 ? ` (${shots.length})` : ''}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default LiveCameraCapture;
