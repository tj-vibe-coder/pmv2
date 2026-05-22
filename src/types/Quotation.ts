export type ID = string;

export type QuotationKind = 'IOCT' | 'ACTI';

export type ProjectStatus = 'draft' | 'sent' | 'won' | 'lost';

// Re-export the unified Client + ClientContact types so calcsheet code that imports
// from `types/Quotation` keeps working without a path change.
export type { Client, ClientContact, Gender } from './Client';
export { primaryContact, resolveContact } from './Client';

export interface SalesContact {
  id: ID;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
}

export interface Project {
  id: ID;
  code: string;
  name: string;
  location?: string;
  date: string;
  customerId: ID | null;
  partnerId: ID | null;
  salesContactId: ID | null;
  status: ProjectStatus;
  ongoing?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;

  // OneDrive corporate-shared-library folder links. Populated best-effort when a
  // project is created (proposal folder) or transitions to 'won' (execution folder).
  // Absence is normal for older projects or when OneDrive is offline/unconfigured.
  proposalFolderId?: string;
  proposalFolderUrl?: string;
  executionFolderId?: string;
  executionFolderUrl?: string;
}

export type FormulaVersion = 'legacy' | 'current';

export interface QuotationImportMeta {
  sourceFile: string;
  importedAt: string;
  originalCode?: string;
  pdfFilename?: string;
}

export interface GeneralReqLine {
  id: ID;
  code: string;
  description: string;
  unitPrice: number;
  qty: number;
  uom: string;
}

export interface ComponentLine {
  id: ID;
  code: string;
  description: string;
  brand?: string;
  partNo?: string;
  qty: number;
  uom: string;
  unitCost: number;
  forex: number;
  contingencyPct: number;
  discountPct: number;
}

export interface ServiceLine {
  id: ID;
  code: string;
  description: string;
  amount: number;
}

export interface ManpowerEntry {
  id: ID;
  role: string;
  group: 'engineering' | 'labor';
  headcount: number;
  mandays: number;
  dailyRate: number;
  allowance: number;
  presetId?: ID | null;
}

export interface LaborRolePreset {
  id: ID;
  role: string;
  group: 'engineering' | 'labor';
  dailyRate: number;
  allowance: number;
}

export interface Quotation {
  id: ID;
  projectId: ID;
  kind: QuotationKind;
  revision: string;
  recipientId: ID | null;
  contactId?: ID;            // Which contact at the recipient client this quotation addresses
  validityDays: number;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyMonths: number;
  productMarkupPct: number;
  laborMarkupPct: number;
  generalReqMarkupPct: number;
  globalContingencyPct: number;
  discountPct: number;
  vatPct: number;
  generalReqts: GeneralReqLine[];
  components: ComponentLine[];
  services: ServiceLine[];
  manpower: ManpowerEntry[];
  servicesFromManpower: boolean;
  preparedBy?: string;
  authorizedBy?: string;
  notes?: string;
  formulaVersion?: FormulaVersion;
  generalReqContingencyMode?: 'standard' | 'baked';
  importedFrom?: QuotationImportMeta;
  legacyTotalsSnapshot?: QuotationTotals;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationTotals {
  generalReqtsCost: number;
  generalReqtsWithContingency: number;
  generalReqtsSubtotal: number;

  componentsCost: number;
  componentsSubtotal: number;

  laborCost: number;
  laborWithContingency: number;
  servicesSubtotal: number;

  subtotal: number;
  discount: number;
  vat: number;
  grandTotal: number;
}
