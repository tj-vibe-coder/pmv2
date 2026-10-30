import { parseClientApprover } from './clientApprover';

describe('parseClientApprover', () => {
  it('splits name and position on the spaced dash the server writes', () => {
    expect(parseClientApprover('Juan Dela Cruz – Plant Manager')).toEqual({ name: 'Juan Dela Cruz', designation: 'Plant Manager' });
  });
  it('keeps hyphenated names intact', () => {
    expect(parseClientApprover('Jean-Paul Reyes')).toEqual({ name: 'Jean-Paul Reyes', designation: '' });
    expect(parseClientApprover('Jean-Paul Reyes - Engineer')).toEqual({ name: 'Jean-Paul Reyes', designation: 'Engineer' });
  });
  it('keeps extra segments in the designation and handles empty input', () => {
    expect(parseClientApprover('A B – Head – Operations').designation).toBe('Head – Operations');
    expect(parseClientApprover('')).toEqual({ name: '', designation: '' });
    expect(parseClientApprover(undefined)).toEqual({ name: '', designation: '' });
  });
});
