import { create } from 'zustand';
import type { PanelIo } from '../utils/calcsheet/terminalWiring';

// The I/O of the last PLC / BMS configuration added to a quotation, so the
// Control Panel configurator can size the terminal strip without retyping it.
// In-memory only (per browser tab) — the dialog lets the user edit or clear it.
interface PanelIoState {
  io: PanelIo | null;
  setIo: (io: PanelIo | null) => void;
}

export const usePanelIoStore = create<PanelIoState>((set) => ({
  io: null,
  setIo: (io) => set({ io }),
}));
