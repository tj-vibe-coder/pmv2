import type { Client, SalesContact } from '../types/Quotation';
import { nanoid } from 'nanoid';

// Fallback seed used only when the unified /api/clients endpoint is unavailable
// (offline / local dev without server). Real customer data lives in Firestore
// under the `clients` collection and is loaded at runtime by the store. Names,
// emails, phones, and personal positions are intentionally omitted here so the
// public source tree does not contain customer PII.
const PT_STANDARD = '30% downpayment, 70% progress billing based on mutually agreed project milestones.';

const placeholderContact = () => [
  { id: nanoid(8), name: '', position: '', email: '', phone: '', gender: '' as const, isPrimary: true },
];

export const seedClients = (): Client[] => [
  { id: nanoid(8), code: 'ADI', name: 'Analog Devices Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'ICI', name: 'Innovative Controls, Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'EBC', name: 'Ebecor Corporation', address: '', paymentTerms: '60 days upon project Completion', am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'LBI', name: 'LBI Philippines Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'REP', name: 'Ryonan Electric Philippines Corporation', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'TPI', name: 'Tann Philippines Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'BLI', name: 'Belmont Laboratories Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'BBP', name: 'Barghest Building Performance', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'ACT', name: 'Advance Controle Technologie Inc', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'NEX', name: 'Next-Serve Maintenance Management, Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'CEI', name: 'Controltrade Enterprises Inc.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'IST', name: 'Industrial Solutions & Technical Services Corp.', address: '', paymentTerms: PT_STANDARD, am: '', contacts: placeholderContact() },
  { id: nanoid(8), code: 'SLC', name: 'Smartech LE Control Inc.', address: '', paymentTerms: '100% upon completion.', am: '', contacts: placeholderContact() },
];

export const seedSalesContacts = (): SalesContact[] => [
  // Real names are loaded from Firestore at runtime; this is a placeholder set
  // for offline / no-server mode.
  { id: nanoid(8), name: '', position: 'Sales' },
  { id: nanoid(8), name: '', position: 'Admin Ops' },
  { id: nanoid(8), name: '', position: 'Engineering' },
  { id: nanoid(8), name: '', position: 'Admin/Compliance' },
];
