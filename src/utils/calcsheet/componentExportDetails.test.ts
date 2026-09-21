import { componentExportDetails } from './componentExportDetails';

describe('component PDF export details', () => {
  it('omits the part number when the quotation hides it', () => {
    expect(componentExportDetails(
      { brand: 'Siemens', partNo: '6ES7 214-1AG40-0XB0' },
      true,
    )).toBe('Siemens');
  });

  it('keeps the full component reference by default', () => {
    expect(componentExportDetails(
      { brand: 'Siemens', partNo: '6ES7 214-1AG40-0XB0' },
      false,
    )).toBe('Siemens, 6ES7 214-1AG40-0XB0');
  });
});
