export type AuthUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
  customer_id?: string;
  customer_name?: string;
  status?: string;
};

export type LoginCredentials = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: 'bearer' | string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isHydrating: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthUser | null>;
  clearSession: () => void;
};
