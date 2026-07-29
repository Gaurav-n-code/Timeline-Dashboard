import axios from 'axios';
import { getApiBaseUrl } from '../env';
import { getStoredToken } from '../../features/auth/tokenStorage';

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token && config.url !== '/auth/login') {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use((response) => {
  const payload = response.data as
    | {
        status_code?: number;
        message?: string;
      }
    | undefined;
  const requestUrl = response.config.url ?? '';

  if (requestUrl !== '/auth/login' && payload?.status_code === 401) {
    const error = new Error(payload.message || 'Request failed');
    (error as Error & { status?: number; response?: { status: number; data: unknown } }).status =
      401;
    (error as Error & { status?: number; response?: { status: number; data: unknown } }).response =
      {
        status: 401,
        data: payload,
      };
    return Promise.reject(error);
  }

  return response;
});
