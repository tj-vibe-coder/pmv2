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

// Internal IOCT team identities used to populate "Prepared by" / "Authorized
// by" dropdowns in the quotation editor and to render the signature block on
// PDFs. `position` here is the **formal title** that appears under the
// signatory's name on the quotation (e.g. "Solutions Manager"), not the
// internal team role. Phone + email fall through to the PDF's signature
// block when this name is selected as the authorizer.
//
// These are internal team identities, not customer PII — they're already
// documented in CLAUDE.md. Add new IOCT staff here when they need signing
// authority on quotations.
export const seedSalesContacts = (): SalesContact[] => [
  {
    id: nanoid(8),
    name: 'Tyrone James Caballero',
    position: 'General Manager',
    email: '',
    phone: '+63 969 162 2660',
  },
  {
    id: nanoid(8),
    name: 'Reuel Joshua Rivera',
    position: 'Solutions Manager',
    email: 'reuel.rivera@iocontroltech.com',
    phone: '+63 919 082 5434',
  },
  {
    id: nanoid(8),
    name: 'Renzel Punongbayan',
    position: 'Engineering Supervisor',
    email: 'renzel.punongbayan@iocontroltech.com',
    phone: '+63 999 557 0678',
  },
  {
    id: nanoid(8),
    name: 'Nylle Harold Managa',
    position: 'Admin & Compliance',
    email: '',
    phone: '',
  },
];
