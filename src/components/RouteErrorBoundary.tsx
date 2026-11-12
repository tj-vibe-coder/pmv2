import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface Props {
  children: React.ReactNode;
  /** Changing this (e.g. the current path) clears a previous error so the next page gets a fresh start. */
  resetKey?: string;
}

// Catches a page that failed to load or crashed while rendering, so the rest of the app (header, menu)
// stays usable and the user gets a way forward instead of a blank screen.
export default class RouteErrorBoundary extends React.Component<Props, { failed: boolean; detail: string }> {
  state = { failed: false, detail: '' };

  static getDerivedStateFromError(error: unknown) {
    // Keep the technical reason (short) so it can be read off the screen and reported — a phone has no console.
    const e = error as { name?: string; message?: string } | null;
    return { failed: true, detail: [e?.name, e?.message].filter(Boolean).join(': ').slice(0, 240) };
  }

  componentDidCatch(error: unknown) {
    console.error('[RouteErrorBoundary]', error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, detail: '' });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box sx={{ textAlign: 'center', py: 8, px: 2 }} role="alert">
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>This page couldn’t load</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check your connection, then try again. If the app was just updated, reloading picks up the new version.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>Reload</Button>
        {this.state.detail && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, fontFamily: 'monospace', overflowWrap: 'anywhere' }} data-testid="route-error-detail">
            Details: {this.state.detail}
          </Typography>
        )}
      </Box>
    );
  }
}
