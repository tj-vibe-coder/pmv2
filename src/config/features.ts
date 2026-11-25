// Feature switches for modules that are built but not in use yet.
// Flip a flag to `true` to bring the module back; nothing else needs to change.

// Projects / Sales / Finance Analytics (Analytics Studio). Hidden 2026-11-25:
// not needed yet, planned for later. Hides the sidebar entries, the Finance Home
// card and the AI assistant's "open in studio" buttons; the routes redirect home.
export const ANALYTICS_ENABLED = false;
