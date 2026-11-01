/** Split the legacy free-text `project.client_approver` ("Name – Position") into name and designation.
 * Splits only on a spaced dash, so hyphenated names ("Jean-Paul Reyes") stay intact. */
export function parseClientApprover(raw: string | null | undefined): { name: string; designation: string } {
  const [name = '', ...rest] = (raw || '').split(/\s+[–-]\s+/);
  return { name: name.trim(), designation: rest.join(' – ').trim() };
}
