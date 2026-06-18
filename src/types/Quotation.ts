export type ID = string;

export type QuotationKind = 'IOCT' | 'ACTI';

export type ProjectStatus = 'draft' | 'sent' | 'won' | 'lost' | 'inactive';

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

  // Link to the original Project List module after a proposal is won. The
  // main project remains the operations record; Calcsheet only stores the link
  // and sync status so accidental status flips can be recovered without
  // deleting operational data.
  mainProjectId?: string;
  mainProjectNo?: string;
  mainProjectLinkedAt?: string;
  mainProjectLastSyncedAt?: string;
  mainProjectSyncStatus?: 'none' | 'linked' | 'missing' | 'unlinked' | 'error';
  mainProjectSyncError?: string;
  mainProjectUnlinkedAt?: string;
  mainProjectUnlinkReason?: string;
  mainProjectStatus?: string;
  mainProjectProgressPercent?: number;
  mainProjectCompletionDate?: number | string | null;
  mainProjectStatusSyncedAt?: string;
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
  contingencyPctOverridden?: boolean;
  discountPct: number;
  leadTimeDays?: number;
  group?: string;
}

export interface ServiceLine {
  id: ID;
  code: string;
  description: string;
  amount: number;
  days?: number;
  group?: string;
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
  dateSent?: string;          // YYYY-MM-DD. If blank, exports use the generation date.
  validityDays: number;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyMonths: number;
  productMarkupPct: number;
  productContingencyPct?: number;
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
  servicesPerLinePricing?: boolean;
  engineeringServicesQty?: number;
  preparedBy?: string;
  preparedByTitle?: string;       // override the auto-resolved job title in the PDF signature block
  authorizedBy?: string;
  termsOverrides?: {
    scopeOfWork?: string;         // replaces the hardcoded Scope of Work paragraph
    basisOfProposal?: string;     // replaces the hardcoded Basis of Proposal paragraph
    deliveryLines?: string;       // replaces ALL delivery bullet lines (newline-separated, each already starts with "- ")
    warrantyExclusion?: string;   // replaces the hardcoded warranty-exclusion sentence
  };
  notes?: string;
  exportGeneralReqtsAsLot?: boolean;
  generalReqtsExportQty?: number;
  pageBreakBeforeTerms?: boolean;
  formulaVersion?: FormulaVersion;
  generalReqContingencyMode?: 'standard' | 'baked';
  importedFrom?: QuotationImportMeta;
  legacyTotalsSnapshot?: QuotationTotals;
  createdAt: string;
  updatedAt: string;
}

// A snapshot of a quotation's state captured server-side just before a save
// overwrote it. `data` is the full quotation as it existed before that save.
export interface QuotationVersion {
  id: ID;
  quotationId: ID;
  projectId?: ID | null;
  savedAt: string;          // when this state was replaced by a newer save
  savedBy?: string | null;  // who performed the save that replaced this state
  data: Quotation;
}

export interface QuotationTotals {
  generalReqtsCost: number;
  generalReqtsWithContingency: number;
  generalReqtsSubtotal: number;

  componentsCost: number;
  componentsWithContingency?: number;
  componentsSubtotal: number;

  laborCost: number;
  laborWithContingency: number;
  servicesSubtotal: number;

  subtotal: number;
  discount: number;
  vat: number;
  grandTotal: number;
}
