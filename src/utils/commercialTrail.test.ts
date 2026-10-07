import { buildActiExpectedQueue, isActiInvolved } from './commercialTrail';
import type { Project } from '../types/Project';

describe('isActiInvolved', () => {
  it('flags with_acti and partner_name matches', () => {
    expect(isActiInvolved({ with_acti: true })).toBe(true);
    expect(isActiInvolved({ partner_name: 'Advance Controle Technologie Inc' })).toBe(true);
  });

  it('flags a project whose customer (account_name) is ACTI', () => {
    expect(isActiInvolved({ with_acti: false, partner_name: '', account_name: 'Advance Controle Technologie Inc' })).toBe(true);
  });

  it('does not flag unrelated customers or empty projects', () => {
    expect(isActiInvolved({ with_acti: false, partner_name: '', account_name: 'Analog Devices Inc' })).toBe(false);
    expect(isActiInvolved({ account_name: 'Practical Industries' })).toBe(false);
    expect(isActiInvolved(null)).toBe(false);
  });

  it('puts an ACTI-customer project with no flag into the expected queue', () => {
    const project = {
      id: 'p1',
      with_acti: false,
      partner_name: '',
      account_name: 'Advance Controle Technologie Inc',
      contract_amount: 100000,
      updated_contract_amount: 100000,
    } as unknown as Project;
    expect(buildActiExpectedQueue([project], [])).toHaveLength(1);
  });
});
