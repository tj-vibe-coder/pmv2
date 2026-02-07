export interface Project {
  id: number;
  project_no?: string;
  item_no: number;
  year: number;
  am: string;
  ovp_number: string;
  po_number: string;
  po_date: number | null;
  client_status: string;
  account_name: string;
  project_name: string;
  project_category: string;
  project_location: string;
  scope_of_work: string;
  qtn_no: string;
  ovp_category: string;
  contract_amount: number;
  updated_contract_amount: number;
  down_payment_percent: number;
  retention_percent: number;
  start_date: number | null;
  duration_days: number;
  completion_date: number | null;
  payment_schedule: string;
  payment_terms: string;
  bonds_requirement: string;
  project_director: string;
  client_approver: string;
  progress_billing_schedule: string;
  mobilization_date: number | null;
  updated_completion_date: number | null;
  project_status: string;
  actual_site_progress_percent: number;
  actual_progress: number;
  evaluated_progress_percent: number;
  evaluated_progress: number;
  for_rfb_percent: number;
  for_rfb_amount: number;
  rfb_date: number | null;
  type_of_rfb: string;
  work_in_progress_ap: number;
  work_in_progress_ep: number;
  updated_contract_balance_percent: number;
  total_contract_balance: number;
  updated_contract_balance_net_percent: number;
  updated_contract_balance_net: number;
  remarks: string;
  contract_billed_gross_percent: number;
  contract_billed: number;
  contract_billed_net_percent: number;
  amount_contract_billed_net: number;
  for_retention_billing_percent: number;
  amount_for_retention_billing: number;
  retention_status: string;
  unevaluated_progress: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'OPEN' | 'CLOSED' | 'FOR_CLOSEOUT' | 'PENDING' | 'CANCELLED';

export interface ProjectSummary {
  totalContractAmount: number;
  totalBilledAmount: number;
  totalOutstandingBalance: number;
  projectCount: number;
}

export interface ProjectDirectorSummary {
  directorName: string;
  projectCount: number;
  totalContractAmount: number;
  totalBilledAmount: number;
  totalOutstandingBalance: number;
}

export interface YearSummary {
  year: number;
  projectCount: number;
  totalContractAmount: number;
  totalBilledAmount: number;
  totalOutstandingBalance: number;
}

export interface ProjectDirector {
  id: number;
  name: string;
  created_at: string;
}

export interface BillingStatus {
  id: number;
  year: number;
  total_updated_contract_amount: number;
  total_billed: number;
  balance: number;
  status: string;
  for_rfb_amount: number;
  rfb_date: number | null;
  remarks: string;
  created_at: string;
}

export interface ProjectFilters {
  year?: number;
  status?: string;
  client?: string;
  projectCategory?: string;
  projectLocation?: string;
  searchTerm?: string;
}