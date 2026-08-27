import { create } from 'zustand';
import type { StatementOfAccount, SoaStatus, SoaItem } from '../types/StatementOfAccount';
import * as soaService from '../services/soaService';

interface SoaState {
  soas: StatementOfAccount[];
  activeSoa: StatementOfAccount | null;
  loading: boolean;
  error: string | null;
  filterStatus: string;
  searchQuery: string;

  fetchSoas: () => Promise<void>;
  selectSoa: (id: string) => Promise<StatementOfAccount | null>;
  fetchSoaById: (id: string) => Promise<StatementOfAccount | null>;
  saveSoa: (payload: Partial<StatementOfAccount>) => Promise<StatementOfAccount>;
  changeStatus: (id: string, status: SoaStatus, settlementDate?: string) => Promise<void>;
  modifyItem: (soaId: string, itemId: string, updates: Partial<SoaItem>) => Promise<void>;
  recordPayment: (id: string, payment: { amount: number; paymentDate?: string; reference?: string; invoiceId?: string; notes?: string }) => Promise<StatementOfAccount>;
  archiveToOneDrive: (id: string, pdfBase64: string) => Promise<{ success: boolean; itemId: string; webUrl: string; folderPath: string }>;
  createRevision: (id: string) => Promise<StatementOfAccount>;
  removeSoa: (id: string) => Promise<void>;
  setFilterStatus: (status: string) => void;
  setSearchQuery: (q: string) => void;
  clearActive: () => void;
}

export const useSoaStore = create<SoaState>((set, get) => ({
  soas: [],
  activeSoa: null,
  loading: false,
  error: null,
  filterStatus: 'all',
  searchQuery: '',

  fetchSoas: async () => {
    set({ loading: true, error: null });
    try {
      const { filterStatus, searchQuery } = get();
      const list = await soaService.listSoas({
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery || undefined,
      });
      set({ soas: list, loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load SOAs', loading: false });
    }
  },

  selectSoa: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const soa = await soaService.getSoa(id);
      set({ activeSoa: soa, loading: false });
      return soa;
    } catch (err: any) {
      set({ error: err.message || 'Failed to load SOA', loading: false });
      return null;
    }
  },

  fetchSoaById: async (id: string) => {
    return get().selectSoa(id);
  },

  saveSoa: async (payload: Partial<StatementOfAccount>) => {
    set({ loading: true, error: null });
    try {
      let saved: StatementOfAccount;
      if (payload.id) {
        saved = await soaService.updateSoa(payload.id, payload);
      } else {
        saved = await soaService.createSoa(payload);
      }
      // Refresh list and active SOA
      await get().fetchSoas();
      set({ activeSoa: saved, loading: false });
      return saved;
    } catch (err: any) {
      set({ error: err.message || 'Failed to save SOA', loading: false });
      throw err;
    }
  },

  changeStatus: async (id: string, status: SoaStatus, settlementDate?: string) => {
    try {
      const updated = await soaService.updateSoaStatus(id, status, settlementDate);
      set((state) => ({
        soas: state.soas.map((s) => (s.id === id ? updated : s)),
        activeSoa: state.activeSoa?.id === id ? updated : state.activeSoa,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to change status' });
      throw err;
    }
  },

  modifyItem: async (soaId: string, itemId: string, updates: Partial<SoaItem>) => {
    try {
      const updated = await soaService.updateSoaItem(soaId, itemId, updates);
      set((state) => ({
        soas: state.soas.map((s) => (s.id === soaId ? updated : s)),
        activeSoa: state.activeSoa?.id === soaId ? updated : state.activeSoa,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to update line item' });
      throw err;
    }
  },

  createRevision: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const revised = await soaService.reviseSoa(id);
      await get().fetchSoas();
      set({ activeSoa: revised, loading: false });
      return revised;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create revision', loading: false });
      throw err;
    }
  },

  recordPayment: async (id: string, payment: { amount: number; paymentDate?: string; reference?: string; invoiceId?: string; notes?: string }) => {
    try {
      const updated = await soaService.recordSoaPayment(id, payment);
      set((state) => ({
        soas: state.soas.map((s) => (s.id === id ? updated : s)),
        activeSoa: state.activeSoa?.id === id ? updated : state.activeSoa,
      }));
      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to record payment' });
      throw err;
    }
  },

  archiveToOneDrive: async (id: string, pdfBase64: string) => {
    try {
      const result = await soaService.uploadSoaToOneDrive(id, pdfBase64);
      await get().fetchSoaById(id);
      return result;
    } catch (err: any) {
      set({ error: err.message || 'Failed to archive to OneDrive' });
      throw err;
    }
  },

  removeSoa: async (id: string) => {
    try {
      await soaService.deleteSoa(id);
      set((state) => ({
        soas: state.soas.filter((s) => s.id !== id),
        activeSoa: state.activeSoa?.id === id ? null : state.activeSoa,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete SOA' });
      throw err;
    }
  },

  setFilterStatus: (status: string) => {
    set({ filterStatus: status });
    void get().fetchSoas();
  },

  setSearchQuery: (q: string) => {
    set({ searchQuery: q });
    void get().fetchSoas();
  },

  clearActive: () => {
    set({ activeSoa: null });
  },
}));
