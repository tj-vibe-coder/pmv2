import type { LaborRolePreset, GeneralReqLine } from '../types/Quotation';
import { nanoid } from 'nanoid';

// Defaults sourced from the Labor and Gen Reqt sheet of the IOCT/ACTI template.
// Daily rate + allowance are pre-contingency baseline numbers — adjust freely.
export const seedLaborPresets = (): LaborRolePreset[] => [
  // Engineering / Automation
  { id: nanoid(8), role: 'PLC Engineer — Offsite', group: 'engineering', dailyRate: 2000, allowance: 350 },
  { id: nanoid(8), role: 'PLC Engineer — Onsite',  group: 'engineering', dailyRate: 2500, allowance: 350 },
  { id: nanoid(8), role: 'HMI Engineer — Offsite', group: 'engineering', dailyRate: 2000, allowance: 350 },
  { id: nanoid(8), role: 'HMI Engineer — Onsite',  group: 'engineering', dailyRate: 2500, allowance: 350 },
  { id: nanoid(8), role: 'Project Manager',        group: 'engineering', dailyRate: 3500, allowance: 1000 },
  // Laborers
  { id: nanoid(8), role: 'Foreman',            group: 'labor', dailyRate: 1500, allowance: 250 },
  { id: nanoid(8), role: 'Technician',         group: 'labor', dailyRate: 1200, allowance: 250 },
  { id: nanoid(8), role: 'Electrician',        group: 'labor', dailyRate: 1200, allowance: 250 },
  { id: nanoid(8), role: 'Safety Officer',     group: 'labor', dailyRate: 1200, allowance: 250 },
  { id: nanoid(8), role: 'Autocad Operator',   group: 'labor', dailyRate: 1000, allowance: 250 },
  { id: nanoid(8), role: 'Welder',             group: 'labor', dailyRate: 1000, allowance: 250 },
  { id: nanoid(8), role: 'Scaffolder',         group: 'labor', dailyRate: 1000, allowance: 250 },
  { id: nanoid(8), role: 'Helper',             group: 'labor', dailyRate: 800,  allowance: 250 },
  { id: nanoid(8), role: 'Driver',             group: 'labor', dailyRate: 1000, allowance: 250 },
  { id: nanoid(8), role: 'Document Controller',group: 'labor', dailyRate: 1000, allowance: 250 },
];

export const starterGeneralReqts = (): GeneralReqLine[] => [
  { id: nanoid(6), code: 'A-0010', description: 'Mobilization / Demobilization',     unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0020', description: 'Accommodation',                     unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0030', description: 'Tools & Equipment',                 unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0040', description: 'PPE and other Safety Requirements', unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0050', description: 'Documentation and As-built Drawing',unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0060', description: 'General Contingency',                unitPrice: 0, qty: 1, uom: 'lot' },
  { id: nanoid(6), code: 'A-0070', description: 'Project Management',                unitPrice: 0, qty: 1, uom: 'lot' },
];
