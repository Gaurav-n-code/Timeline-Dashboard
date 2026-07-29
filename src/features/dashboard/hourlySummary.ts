import type { MachineIntervalsRequest, ParsedMachineIntervals, ParsedTimelineSegment } from './timelineApi';
import type { ParsedHourlyCycleMetricsBucket } from './cycleMetricsApi';

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const minuteFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const istTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export type HourlySummaryRow = {
  hourStartMs: number;
  hourEndMs: number;
  label: string;
  runtimeMinutes: number;
  unplannedProductionMinutes: number;
  unknownDowntimeMinutes: number;
  stoppageMinutes: number;
  passCount: number;
  failCount: number;
  totalCount: number;
  idealCycleTimeSeconds: number | null;
  actualCycleTimeSeconds: number | null;
};

function toLocalMs(utcMs: number) {
  return utcMs + IST_OFFSET_MS;
}

function toUtcMs(localMs: number) {
  return localMs - IST_OFFSET_MS;
}

function formatIstTime(utcMs: number) {
  return istTimeFormatter.format(new Date(utcMs));
}

function formatIstHourRange(hourStartUtcMs: number) {
  return `${formatIstTime(hourStartUtcMs)} - ${formatIstTime(hourStartUtcMs + HOUR_MS)}`;
}

function floorToLocalHourMs(utcMs: number) {
  return Math.floor(toLocalMs(utcMs) / HOUR_MS) * HOUR_MS;
}

function ceilToLocalHourMs(utcMs: number) {
  return Math.ceil(toLocalMs(utcMs) / HOUR_MS) * HOUR_MS;
}

function clampToRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampSegmentToEnd(segment: ParsedTimelineSegment, endUtcMs: number) {
  const segmentStartUtcMs = segment.startAt.getTime();
  const segmentEndUtcMs = segment.endAt.getTime();

  if (segmentStartUtcMs >= endUtcMs) {
    return null;
  }

  return {
    ...segment,
    startAt: segment.startAt,
    endAt: new Date(Math.min(segmentEndUtcMs, endUtcMs)),
  };
}

function createHourRows(startUtcMs: number, endUtcMs: number) {
  const rowsByStart = new Map<number, HourlySummaryRow>();
  const firstHourStartLocalMs = floorToLocalHourMs(startUtcMs);
  const lastHourEndLocalMs = ceilToLocalHourMs(endUtcMs);

  for (
    let hourStartLocalMs = firstHourStartLocalMs;
    hourStartLocalMs < lastHourEndLocalMs;
    hourStartLocalMs += HOUR_MS
  ) {
    const hourStartUtcMs = toUtcMs(hourStartLocalMs);
    const row: HourlySummaryRow = {
      hourStartMs: hourStartUtcMs,
      hourEndMs: hourStartUtcMs + HOUR_MS,
      label: formatIstHourRange(hourStartUtcMs),
      runtimeMinutes: 0,
      unplannedProductionMinutes: 0,
      unknownDowntimeMinutes: 0,
      stoppageMinutes: 0,
      passCount: 0,
      failCount: 0,
      totalCount: 0,
      idealCycleTimeSeconds: null,
      actualCycleTimeSeconds: null,
    };

    rowsByStart.set(hourStartLocalMs, row);
  }

  return rowsByStart;
}

function addMinutesToRows(
  rowsByStart: Map<number, HourlySummaryRow>,
  segment: ParsedTimelineSegment,
  field: keyof Pick<
    HourlySummaryRow,
    'runtimeMinutes' | 'unplannedProductionMinutes' | 'unknownDowntimeMinutes' | 'stoppageMinutes'
  >,
) {
  const segmentStartLocalMs = toLocalMs(segment.startAt.getTime());
  const segmentEndLocalMs = toLocalMs(segment.endAt.getTime());

  for (const [hourStartLocalMs, row] of rowsByStart.entries()) {
    const hourEndLocalMs = hourStartLocalMs + HOUR_MS;
    const overlapStart = Math.max(segmentStartLocalMs, hourStartLocalMs);
    const overlapEnd = Math.min(segmentEndLocalMs, hourEndLocalMs);
    const overlapMs = overlapEnd - overlapStart;

    if (overlapMs <= 0) {
      continue;
    }

    row[field] += overlapMs / MINUTE_MS;
  }
}

function isUnknownDowntime(segment: ParsedTimelineSegment) {
  const label = segment.label?.trim().toLowerCase();
  const rawType = segment.rawType.trim().toLowerCase();

  return label === 'unknown' || rawType === 'unknown';
}

function isUnplannedProductionRuntime(segment: ParsedTimelineSegment) {
  const rawType = segment.rawType.trim().toLowerCase();
  const label = segment.label?.trim().toLowerCase() ?? '';

  return rawType.includes('unplanned production') || label.includes('unplanned production');
}

function addProduceCounts(
  rowsByStart: Map<number, HourlySummaryRow>,
  data: ParsedMachineIntervals,
  maxUtcMs: number,
) {
  for (const bucket of data.produceCounts) {
    const bucketStartUtcMs = new Date(bucket.bucket_start).getTime();
    if (bucketStartUtcMs >= maxUtcMs) {
      continue;
    }

    const bucketStartLocalMs = floorToLocalHourMs(bucketStartUtcMs);
    const row = rowsByStart.get(bucketStartLocalMs);

    if (!row) {
      continue;
    }

    row.passCount += bucket.ok_count;
    row.failCount += bucket.ng_count;
    row.totalCount += bucket.ok_count + bucket.ng_count;
  }
}

function addProduceFallback(
  rowsByStart: Map<number, HourlySummaryRow>,
  data: ParsedMachineIntervals,
  maxUtcMs: number,
) {
  if (data.produceCounts.length > 0) {
    return;
  }

  for (const produce of data.produces) {
    if (produce.firstSeenAt.getTime() >= maxUtcMs) {
      continue;
    }

    const hourStartLocalMs = floorToLocalHourMs(produce.firstSeenAt.getTime());
    const row = rowsByStart.get(hourStartLocalMs);

    if (!row) {
      continue;
    }

    if (produce.result === 'PASS') {
      row.passCount += 1;
    } else {
      row.failCount += 1;
    }

    row.totalCount += 1;
  }
}

function addCycleMetrics(
  rowsByStart: Map<number, HourlySummaryRow>,
  cycleMetrics: ParsedHourlyCycleMetricsBucket[] | null | undefined,
  maxUtcMs: number,
) {
  for (const metric of cycleMetrics ?? []) {
    if (metric.bucketStartMs >= maxUtcMs) {
      continue;
    }

    const rowStartLocalMs = floorToLocalHourMs(metric.bucketStartMs);
    const row = rowsByStart.get(rowStartLocalMs);

    if (!row) {
      continue;
    }

    row.idealCycleTimeSeconds = metric.idealCycleTimeSeconds;
    row.actualCycleTimeSeconds = metric.actualCycleTimeSeconds;
  }
}

export function buildHourlySummaryRows(
  request: MachineIntervalsRequest | null,
  data: ParsedMachineIntervals | null,
  cycleMetrics: ParsedHourlyCycleMetricsBucket[] | null | undefined = null,
) {
  if (!request || !data) {
    return [];
  }

  const requestStartUtcMs = new Date(request.time_range.from_ts).getTime();
  const requestEndUtcMs = new Date(request.time_range.to_ts).getTime();
  const effectiveEndUtcMs = clampToRange(Date.now(), requestStartUtcMs, requestEndUtcMs);

  if (effectiveEndUtcMs <= requestStartUtcMs) {
    return [];
  }

  const rowsByStart = createHourRows(requestStartUtcMs, requestEndUtcMs);

  for (const segment of data.runtimes) {
    const boundedSegment = clampSegmentToEnd(segment, effectiveEndUtcMs);

    if (!boundedSegment) {
      continue;
    }

    if (isUnplannedProductionRuntime(segment)) {
      addMinutesToRows(rowsByStart, boundedSegment, 'unplannedProductionMinutes');
    } else {
      addMinutesToRows(rowsByStart, boundedSegment, 'runtimeMinutes');
    }
  }

  for (const segment of data.downtimes) {
    if (isUnknownDowntime(segment)) {
      const boundedSegment = clampSegmentToEnd(segment, effectiveEndUtcMs);

      if (!boundedSegment) {
        continue;
      }

      addMinutesToRows(rowsByStart, boundedSegment, 'unknownDowntimeMinutes');
    }
  }

  for (const segment of data.stoppages) {
    const boundedSegment = clampSegmentToEnd(segment, effectiveEndUtcMs);

    if (!boundedSegment) {
      continue;
    }

    addMinutesToRows(rowsByStart, boundedSegment, 'stoppageMinutes');
  }

  addProduceCounts(rowsByStart, data, effectiveEndUtcMs);
  addProduceFallback(rowsByStart, data, effectiveEndUtcMs);
  addCycleMetrics(rowsByStart, cycleMetrics, effectiveEndUtcMs);

  return [...rowsByStart.values()].sort((left, right) => left.hourStartMs - right.hourStartMs);
}

export function formatMinutes(value: number) {
  return minuteFormatter.format(Math.max(0, value));
}

export function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }

  return minuteFormatter.format(Math.max(0, value));
}
