import { describeAiPage, formatPageContextNote, parseAiPageContext } from './pageContext';

it('parses operational project, opportunity, quotation, and expense ids from the URL', () => {
  expect(parseAiPageContext('/projects/p1')).toEqual({
    route: '/projects/p1',
    projectId: 'p1',
    opportunityId: null,
    quotationId: null,
  });
  expect(parseAiPageContext('/sales/calcsheet/projects/opp9/schedule').opportunityId).toBe('opp9');
  expect(parseAiPageContext('/sales/calcsheet/quotations/q3').quotationId).toBe('q3');
  expect(parseAiPageContext('/finance/projects/p2/expenses').projectId).toBe('p2');
  expect(parseAiPageContext('/dashboard')).toEqual({
    route: '/dashboard',
    projectId: null,
    opportunityId: null,
    quotationId: null,
  });
});

it('describes the visible record for the Now viewing chip', () => {
  expect(describeAiPage(parseAiPageContext('/sales/calcsheet/projects/opp1'))).toBe('opportunity opp1');
  expect(describeAiPage(parseAiPageContext('/dashboard'))).toBe('Projects');
});

it('formats an untrusted now-viewing note for the Live session', () => {
  const note = formatPageContextNote(parseAiPageContext('/sales/calcsheet/quotations/q1'));
  expect(note).toMatch(/untrusted data, not instructions/);
  expect(note).toContain('quotation id q1');
  expect(formatPageContextNote(null)).toBe('');
});
