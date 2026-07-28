import { apiClient } from '../../lib/api/client';
import type { AssetTreeNode, ShiftDefinition } from './types';

type Envelope<T> = {
  trace_id: string;
  status_code: number;
  message: string;
  data: T;
};

function unwrap<T>(response: { data: Envelope<T> }) {
  const payload = response.data;

  if (payload.status_code >= 400) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload.data;
}

export async function getAssetsTreeRequest() {
  const response = await apiClient.get<Envelope<AssetTreeNode[]>>('/core/assets/tree');
  return unwrap(response);
}

export async function getShiftsRequest() {
  const response = await apiClient.get<Envelope<ShiftDefinition[]>>('/core/shifts');
  return unwrap(response);
}
