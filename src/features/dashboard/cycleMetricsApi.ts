import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/api/client';
import type { MachineIntervalsRequest } from './timelineApi';

type Envelope<T> = {
  trace_id: string;
  status_code: number;
  message: string;
  data: T;
};

export type HourlyCycleMetricsRequest = {
  entity_scope: MachineIntervalsRequest['entity_scope'];
  time_range: MachineIntervalsRequest['time_range'];
  metrics: Array<'ideal_cycle_time_seconds' | 'actual_cycle_time_seconds'>;
  distribution: 'hourly';
};

export type HourlyCycleMetricsBucketRaw = {
  entity_id: string;
  bucket_start: string;
  ideal_cycle_time_seconds: number | null;
  actual_cycle_time_seconds: number | null;
};

export type ParsedHourlyCycleMetricsBucket = {
  bucketStartMs: number;
  idealCycleTimeSeconds: number | null;
  actualCycleTimeSeconds: number | null;
};

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function unwrap<T>(response: { data: Envelope<T> }) {
  const payload = response.data;

  if (payload.status_code >= 400) {
    const error = new Error(payload.message || 'Request failed');
    (error as Error & { status?: number }).status = payload.status_code;
    throw error;
  }

  return payload.data;
}

function shouldRetryRequest(error: unknown) {
  if (!isAxiosError(error)) {
    return false;
  }

  return error.response?.status === 500;
}

export function buildHourlyCycleMetricsRequest(
  request: MachineIntervalsRequest,
): HourlyCycleMetricsRequest {
  return {
    entity_scope: request.entity_scope,
    time_range: request.time_range,
    metrics: ['ideal_cycle_time_seconds', 'actual_cycle_time_seconds'],
    distribution: 'hourly',
  };
}

function parseHourlyCycleMetricsResponse(
  response: HourlyCycleMetricsBucketRaw[],
): ParsedHourlyCycleMetricsBucket[] {
  return response
    .map((bucket) => ({
      bucketStartMs: new Date(bucket.bucket_start).getTime(),
      idealCycleTimeSeconds: bucket.ideal_cycle_time_seconds ?? null,
      actualCycleTimeSeconds: bucket.actual_cycle_time_seconds ?? null,
    }))
    .sort((left, right) => left.bucketStartMs - right.bucketStartMs);
}

async function fetchHourlyCycleMetricsOnce(request: HourlyCycleMetricsRequest) {
  const response = await apiClient.post<Envelope<HourlyCycleMetricsBucketRaw[]>>(
    '/analytics-query',
    request,
  );

  return unwrap(response);
}

export async function getHourlyCycleMetricsRequest(
  request: HourlyCycleMetricsRequest,
  { retries = 2, baseDelayMs = 400 }: RetryOptions = {},
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchHourlyCycleMetricsOnce(request);
      return parseHourlyCycleMetricsResponse(response);
    } catch (error) {
      lastError = error;

      if (!shouldRetryRequest(error) || attempt === retries) {
        break;
      }

      await delay(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}
