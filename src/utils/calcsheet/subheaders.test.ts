import { subheaderBefore } from './subheaders';

describe('quotation item subheaders', () => {
  it('renders a heading before the first item in each contiguous labeled block', () => {
    const lines = [
      { id: '1', subheader: 'PLC' },
      { id: '2', subheader: 'PLC' },
      { id: '3', subheader: 'SCADA' },
      { id: '4' },
      { id: '5', subheader: 'PLC' },
    ];

    expect(lines.map((line, index) => subheaderBefore(lines, index))).toEqual([
      'PLC',
      undefined,
      'SCADA',
      undefined,
      'PLC',
    ]);
  });

  it('ignores blank labels so they do not create empty export rows', () => {
    expect(subheaderBefore([{ id: '1', subheader: '   ' }], 0)).toBeUndefined();
  });
});
