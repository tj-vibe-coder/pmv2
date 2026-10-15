/** GET /api/projects-monitor/spend — see server/projectSpendMonitor.js. */
export interface ProjectSpend {
  total: number;
  liquidation: number;
  po: number;
  labor: number;
  manual: number;
  /** Lines in unsubmitted liquidations tagged to this project — not in Finance yet. */
  draftLiquidation: number;
  draftLines: number;
  count: number;
}

export type UntaggedKind = 'liquidation' | 'manual' | 'draft';

export interface UntaggedExpense {
  kind: UntaggedKind;
  collection: 'overhead_expenses' | null;
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string | null;
  supplier: string | null;
  filedBy: string | null;
  liquidationId?: string | null;
  liquidationRowId?: string | null;
  formNo?: string;
  receiptUrl: string | null;
}

export interface NotInFinanceLine {
  id: string;
  liquidationId: string;
  liquidationRowId: string;
  formNo: string;
  employee: string;
  description: string;
  category: string;
  amount: number;
  date: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface ProjectSpendMonitor {
  scope: 'all' | 'own';
  byProject: Record<string, ProjectSpend>;
  untagged: {
    totals: { liquidation: number; manual: number; draft: number; all: number };
    count: number;
    items: UntaggedExpense[];
  };
  notInFinance: { total: number; count: number; items: NotInFinanceLine[] } | null;
}
