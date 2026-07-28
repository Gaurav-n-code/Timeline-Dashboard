import type { MachineIntervalsRequest, ParsedMachineIntervals } from './timelineApi';

export type ChartSegmentKind = 'runtime' | 'unplannedProduction' | 'downtime' | 'stoppage';

export type ChartSegment = {
  kind: ChartSegmentKind;
  startMs: number;
  endMs: number;
  label: string | null;
  rawType: string;
};

export type ChartMarkerResult = 'PASS' | 'FAIL';

export type ChartMarkerMode = 'individual' | 'aggregate';

export type ChartMarker = {
  tsMs: number;
  result: ChartMarkerResult;
  count: number;
  label: string;
  mode: ChartMarkerMode;
};

export type TimelineChartModel = {
  fullStartMs: number;
  fullEndMs: number;
  segments: ChartSegment[];
  passMarkers: ChartMarker[];
  failMarkers: ChartMarker[];
  markerMode: ChartMarkerMode;
};

function toMs(value: string) {
  return new Date(value).getTime();
}

function getDataExtentMs(data: ParsedMachineIntervals) {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  const consider = (value: number) => {
    if (Number.isNaN(value)) {
      return;
    }

    minMs = Math.min(minMs, value);
    maxMs = Math.max(maxMs, value);
  };

  for (const segment of data.runtimes) {
    consider(segment.startAt.getTime());
    consider(segment.endAt.getTime());
  }

  for (const segment of data.downtimes) {
    consider(segment.startAt.getTime());
    consider(segment.endAt.getTime());
  }

  for (const segment of data.stoppages) {
    consider(segment.startAt.getTime());
    consider(segment.endAt.getTime());
  }

  for (const bucket of data.produceCounts) {
    consider(toMs(bucket.bucket_start));
  }

  for (const produce of data.produces) {
    consider(produce.firstSeenAt.getTime());
  }

  if (minMs === Number.POSITIVE_INFINITY || maxMs === Number.NEGATIVE_INFINITY) {
    return null;
  }

  return {
    startMs: minMs,
    endMs: maxMs,
  };
}

function buildSegments(
  items: ParsedMachineIntervals['runtimes'],
) {
  return items.map((segment) => ({
    kind:
      segment.rawType.trim().toLowerCase().includes('unplanned production')
        ? ('unplannedProduction' as const)
        : ('runtime' as const),
    startMs: segment.startAt.getTime(),
    endMs: segment.endAt.getTime(),
    label: segment.label,
    rawType: segment.rawType,
  }));
}

function buildAggregateMarkers(data: ParsedMachineIntervals) {
  const grouped = new Map<number, { pass: number; fail: number }>();

  for (const bucket of data.produceCounts) {
    const bucketMs = toMs(bucket.bucket_start);
    const current = grouped.get(bucketMs) ?? { pass: 0, fail: 0 };
    current.pass += bucket.ok_count;
    current.fail += bucket.ng_count;
    grouped.set(bucketMs, current);
  }

  const passMarkers: ChartMarker[] = [];
  const failMarkers: ChartMarker[] = [];

  for (const [bucketMs, counts] of grouped.entries()) {
    if (counts.pass > 0) {
      passMarkers.push({
        tsMs: bucketMs,
        result: 'PASS',
        count: counts.pass,
        label: `PASS · ${counts.pass}`,
        mode: 'aggregate',
      });
    }

    if (counts.fail > 0) {
      failMarkers.push({
        tsMs: bucketMs,
        result: 'FAIL',
        count: counts.fail,
        label: `FAIL · ${counts.fail}`,
        mode: 'aggregate',
      });
    }
  }

  passMarkers.sort((left, right) => left.tsMs - right.tsMs);
  failMarkers.sort((left, right) => left.tsMs - right.tsMs);

  return { passMarkers, failMarkers };
}

function buildIndividualMarkers(data: ParsedMachineIntervals) {
  const passMarkers: ChartMarker[] = [];
  const failMarkers: ChartMarker[] = [];

  for (const produce of data.produces) {
    const marker = {
      tsMs: produce.firstSeenAt.getTime(),
      result: produce.result,
      count: 1,
      label: produce.result,
      mode: 'individual' as const,
    };

    if (produce.result === 'PASS') {
      passMarkers.push(marker);
    } else {
      failMarkers.push(marker);
    }
  }

  return { passMarkers, failMarkers };
}

export function buildTimelineChartModel(
  request: MachineIntervalsRequest | null,
  data: ParsedMachineIntervals | null,
  showIndividualProduces: boolean,
): TimelineChartModel | null {
  if (!request || !data) {
    return null;
  }

  const requestedStartMs = toMs(request.time_range.from_ts);
  const requestedEndMs = toMs(request.time_range.to_ts);
  const dataExtent = getDataExtentMs(data);
  const fullStartMs = dataExtent ? Math.min(requestedStartMs, dataExtent.startMs) : requestedStartMs;
  const fullEndMs = dataExtent ? Math.max(requestedEndMs, dataExtent.endMs) : requestedEndMs;
  const segments = [
    ...buildSegments(data.runtimes),
    ...data.downtimes.map((segment) => ({
      kind: 'downtime' as const,
      startMs: segment.startAt.getTime(),
      endMs: segment.endAt.getTime(),
      label: segment.label,
      rawType: segment.rawType,
    })),
    ...data.stoppages.map((segment) => ({
      kind: 'stoppage' as const,
      startMs: segment.startAt.getTime(),
      endMs: segment.endAt.getTime(),
      label: segment.label,
      rawType: segment.rawType,
    })),
  ].sort((left, right) => left.startMs - right.startMs);

  const safeFullStartMs = Number.isFinite(fullStartMs) ? fullStartMs : requestedStartMs;
  const safeFullEndMs = Number.isFinite(fullEndMs) ? fullEndMs : requestedEndMs;
  const normalizedEndMs =
    safeFullEndMs > safeFullStartMs ? safeFullEndMs : safeFullStartMs + 60 * 60 * 1000;

  const markerMode: ChartMarkerMode = showIndividualProduces ? 'individual' : 'aggregate';
  const markers = showIndividualProduces
    ? buildIndividualMarkers(data)
    : buildAggregateMarkers(data);

  return {
    fullStartMs: safeFullStartMs,
    fullEndMs: normalizedEndMs,
    segments,
    passMarkers: markers.passMarkers,
    failMarkers: markers.failMarkers,
    markerMode,
  };
}
