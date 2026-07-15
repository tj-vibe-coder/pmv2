import {
  FounderFundingEntryType,
  FounderFundingSource,
  FounderFundingSourceKind,
} from '../types/FounderFunding';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCentavos(centavos: number): string {
  return pesoFormatter.format((Number.isFinite(centavos) ? centavos : 0) / 100);
}

export function remainingAdvanceCentavos(advanceCentavos: number, settlements: number[]): number {
  return advanceCentavos - settlements.reduce((total, amount) => total + amount, 0);
}

const entryLabels: Record<FounderFundingEntryType, string> = {
  founder_advance: 'Founder advance',
  capital_contribution: 'Capital contribution',
  repayment: 'Repayment',
  capitalization: 'Capitalization',
  opening_balance_adjustment: 'Opening balance adjustment',
};

export function entryTypeLabel(type: FounderFundingEntryType): string {
  return entryLabels[type];
}

const sourceLabels: Record<FounderFundingSourceKind, string> = {
  liquidation: 'Liquidation',
  cash_deposit: 'Cash deposit',
  legacy_reconciliation: 'Legacy reconciliation',
};

export function sourceLabel(source: FounderFundingSource): string {
  const reference = source.kind === 'liquidation'
    ? source.liquidationFormNo
    : source.kind === 'cash_deposit'
      ? source.depositReference
      : source.reconciliationId;
  return reference ? `${sourceLabels[source.kind]}${source.kind === 'liquidation' ? ' ' : ' · '}${reference}` : sourceLabels[source.kind];
}

export function parseProofRefs(value: string): string[] {
  return value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
}
