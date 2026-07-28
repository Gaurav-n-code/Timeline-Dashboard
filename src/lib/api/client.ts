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
