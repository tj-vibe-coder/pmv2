// Unified Client type — used by both the main pmv2 module and Calcsheet.
// Migrated from snake_case to camelCase with embedded multi-contact support.

export type Gender = 'M' | 'F' | '';

export interface ClientContact {
  id: string;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  isPrimary?: boolean;
  notes?: string;
}

export interface Client {
  id: string;
  code: string;              // 3-char code (e.g. "ADI"). Empty allowed for legacy docs.
  name: string;
  address?: string;
  paymentTerms?: string;
  am?: string;               // IOCT-side Account Manager
  contacts: ClientContact[];
  createdAt?: string;
  updatedAt?: string;
}

// Convenience accessor: pick the primary contact (or first if none flagged).
export function primaryContact(c: Client | null | undefined): ClientContact | null {
  if (!c || !c.contacts || c.contacts.length === 0) return null;
  return c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
}

// Resolve which contact a quotation should address, given an optional explicit contactId.
export function resolveContact(client: Client | null | undefined, contactId?: string | null): ClientContact | null {
  if (!client) return null;
  if (contactId) {
    const found = client.contacts.find((c) => c.id === contactId);
    if (found) return found;
  }
  return primaryContact(client);
}
