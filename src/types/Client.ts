export interface Client {
  id: number;
  client_name: string;
  address: string;
  payment_terms: string;
  contact_person: string;
  designation: string;
  email_address: string;
  created_at?: string;
  updated_at?: string;
}

export interface ClientFormData {
  client_name: string;
  address: string;
  payment_terms: string;
  contact_person: string;
  designation: string;
  email_address: string;
}
