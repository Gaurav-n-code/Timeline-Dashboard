import { apiClient } from '../../lib/api/client';
import type { AuthUser, LoginCredentials, LoginResponse } from './types';

type Envelope<T> = {
  trace_id: string;
  status_code: number;
  message: string;
  data: T;
};

function unwrap<T>(response: { data: Envelope<T> }) {
  const payload = response.data;

  if (payload.status_code >= 400) {
    const error = new Error(payload.message || 'Request failed');
    (error as Error & { status?: number }).status = payload.status_code;
    throw error;
  }

  return payload.data;
}

export async function loginRequest(credentials: LoginCredentials) {
  const response = await apiClient.post<Envelope<LoginResponse>>('/auth/login', credentials);
  return unwrap(response);
}

export async function getCurrentUserRequest() {
  const response = await apiClient.get<Envelope<AuthUser>>('/auth/me');
  return unwrap(response);
}

export async function logoutRequest() {
  const response = await apiClient.post<Envelope<null>>('/auth/logout');
  return unwrap(response);
}
