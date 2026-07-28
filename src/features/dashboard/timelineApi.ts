import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/api/client';
import { buildIstShiftWindow } from './timelineTime';

export type MachineIntervalEntityScope = {
  type: 'asset';
  asset: {
    asset_id: string;
    asset_level_id: number;
  };
};

export type MachineIntervalsRequest = {
  entity_scope: MachineIntervalEntityScope;
  time_range: {
    from_ts: string;
    to_ts: string;
  };
  produce_counts: boolean;
  exact_produces: boolean;
  group_produce_counts_by_part_model: boolean;
};

export type MachineIntervalSegmentRaw = {
  start_at: string;
  end_at: string;
  type: string;
  runtime_name?: string | null;
  downtime_name?: string | null;
  stoppage_name?: string | null;
  [key: string]: unknown;
};

export type ProduceCountBucketRaw = {
  bucket_start: string;
  part_model_id: string;
  ok_count: number;
  ng_count: number;
};

export type ProduceRowRaw = {
  produce_id: string;
  first_seen_ts: string;
  result: 'PASS' | 'FAIL';
  produce_type: string;
  part_model_id: string;
};

export type ProducesBucketRaw = {
  bucket_start: string;
  part_model_id: string;
  produces: ProduceRowRaw[];
};

export type MachineIntervalsResponseRaw = {
  machine_ids: number[];
  runtimes: MachineIntervalSegmentRaw[];
  downtimes: MachineIntervalSegmentRaw[];
  stoppages: MachineIntervalSegmentRaw[];
  produce_counts: ProduceCountBucketRaw[];
  produces?: ProducesBucketRaw[];
};

export type ParsedTimelineSegment = {
  kind: 'runtime' | 'downtime' | 'stoppage';
  startAt: Date;
  endAt: Date;
  rawType: string;
  label: string | null;
  durationMinutes: number;
};

export type ParsedProduceRow = {
  produceId: string;
  firstSeenAt: Date;
  result: 'PASS' | 'FAIL';
  partModelId: string;
  produceType: string;
};

export type ParsedMachineIntervals = {
  machineIds: number[];
  runtimes: ParsedTimelineSegment[];
  downtimes: ParsedTimelineSegment[];
  stoppages: ParsedTimelineSegment[];
  produceCounts: ProduceCountBucketRaw[];
  produces: ParsedProduceRow[];
};

type Envelope<T> = {
  trace_id: string;
  status_code: number;
  message: string;
  data: T;
};

type MachineIntervalsQueryParams = {
  assetId: string;
  assetLevelId: number;
  date: string;
  shiftTimings: [string, string];
  exactProduces: boolean;
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

function toDate(value: string) {
  return new Date(value);
}

function mapSegment(
  segment: MachineIntervalSegmentRaw,
  kind: ParsedTimelineSegment['kind'],
): ParsedTimelineSegment {
  const startAt = toDate(segment.start_at);
  const endAt = toDate(segment.end_at);
  const durationMinutes = Math.max(0, (endAt.getTime() - startAt.getTime()) / 60_000);

  return {
    kind,
    startAt,
    endAt,
    rawType: segment.type,
    label:
      segment.runtime_name ??
      segment.downtime_name ??
      segment.stoppage_name ??
      segment.type ??
      null,
    durationMinutes,
  };
}

function flattenProduces(producesBuckets: ProducesBucketRaw[] | undefined) {
  const flattened: ParsedProduceRow[] = [];

  for (const bucket of producesBuckets ?? []) {
    for (const produce of bucket.produces ?? []) {
      flattened.push({
        produceId: produce.produce_id,
        firstSeenAt: toDate(produce.first_seen_ts),
        result: produce.result,
        partModelId: produce.part_model_id,
        produceType: produce.produce_type,
      });
    }
  }

  return flattened.sort((left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime());
}

export function buildMachineIntervalsRequest({
  assetId,
  assetLevelId,
  date,
  shiftTimings,
  exactProduces,
}: MachineIntervalsQueryParams): MachineIntervalsRequest {
  const timeRange = buildIstShiftWindow(date, shiftTimings);

  return {
    entity_scope: {
      type: 'asset',
      asset: {
        asset_id: assetId,
        asset_level_id: assetLevelId,
      },
    },
    time_range: timeRange,
    produce_counts: true,
    exact_produces: exactProduces,
    group_produce_counts_by_part_model: true,
  };
}

export function parseMachineIntervalsResponse(
  response: MachineIntervalsResponseRaw,
): ParsedMachineIntervals {
  return {
    machineIds: response.machine_ids ?? [],
    runtimes: (response.runtimes ?? []).map((segment) => mapSegment(segment, 'runtime')),
    downtimes: (response.downtimes ?? []).map((segment) => mapSegment(segment, 'downtime')),
    stoppages: (response.stoppages ?? []).map((segment) => mapSegment(segment, 'stoppage')),
    produceCounts: response.produce_counts ?? [],
    produces: flattenProduces(response.produces),
  };
}

export function isMachineIntervalsEmpty(data: ParsedMachineIntervals) {
  return (
    data.machineIds.length === 0 &&
    data.runtimes.length === 0 &&
    data.downtimes.length === 0 &&
    data.stoppages.length === 0 &&
    data.produceCounts.length === 0 &&
    data.produces.length === 0
  );
}

function shouldRetryRequest(error: unknown) {
  if (!isAxiosError(error)) {
    return false;
  }

  return error.response?.status === 500;
}

async function fetchMachineIntervalsOnce(request: MachineIntervalsRequest) {
  const response = await apiClient.post<Envelope<MachineIntervalsResponseRaw>>(
    '/analytics-query/machine-intervals',
    request,
  );

  return unwrap(response);
}

export async function getMachineIntervalsRequest(
  request: MachineIntervalsRequest,
  { retries = 2, baseDelayMs = 400 }: RetryOptions = {},
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchMachineIntervalsOnce(request);
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
