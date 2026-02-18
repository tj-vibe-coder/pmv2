export interface User {
  id: number;
  username: string;
  email: string;
  role: 'superadmin' | 'admin' | 'user' | 'viewer';
  approved?: number;
  full_name?: string | null;
  created_at: number;
  updated_at: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}