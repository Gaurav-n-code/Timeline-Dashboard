import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { MachineIntervalsRequest, ParsedMachineIntervals } from './timelineApi';
import {
  buildTimelineChartModel,
  type ChartMarker,
  type ChartMarkerResult,
  type ChartSegment,
  type TimelineChartModel,
} from './timelineChartModel';

type TimelineStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type TimelineChartProps = {
  request: MachineIntervalsRequest | null;
  data: ParsedMachineIntervals | null;
  status: TimelineStatus;
  error: string;
  showIndividualProduces: boolean;
  onRetry: () => void;
};

type ViewRange = {
  startMs: number;
  endMs: number;
};

type HoverState = {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  color: string;
};

type DragState = {
  startX: number;
  currentX: number;
};

type ChartSize = {
  width: number;
  height: number;
};

const IST_TIME_ZONE = 'Asia/Kolkata';
const CHART_HEIGHT = 420;
const PLOT_PADDING = {
  top: 24,
  right: 24,
  bottom: 72,
  left: 128,
};
const BAND_LANES: Array<{ kind: ChartSegment['kind']; label: string; color: string }> = [
  { kind: 'runtime', label: 'Runtime', color: '#0f766e' },
  { kind: 'downtime', label: 'Downtime', color: '#d97706' },
  { kind: 'stoppage', label: 'Stoppage', color: '#dc2626' },
];
const PASS_COLOR = '#16a34a';
const FAIL_COLOR = '#dc2626';
const GRID_COLOR = 'rgba(15, 23, 42, 0.08)';
const AXIS_COLOR = '#475569';

function formatIstDateTime(value: number, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

function formatIstTick(value: number) {
  return formatIstDateTime(value, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatIstTooltip(value: number) {
  return formatIstDateTime(value, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getLaneY(index: number) {
  const startY = 86;
  const laneHeight = 26;
  const gap = 18;
  return startY + index * (laneHeight + gap);
}

function getMarkerLaneY(result: ChartMarkerResult) {
  return result === 'PASS' ? 274 : 324;
}

function getMarkerColor(result: ChartMarkerResult) {
  return result === 'PASS' ? PASS_COLOR : FAIL_COLOR;
}

function getTickInterval(spanMs: number) {
  const minute = 60_000;
  const hour = 60 * minute;

  if (spanMs > 18 * hour) return 2 * hour;
  if (spanMs > 10 * hour) return hour;
  if (spanMs > 4 * hour) return 30 * minute;
  if (spanMs > 2 * hour) return 15 * minute;
  if (spanMs > hour) return 5 * minute;
  if (spanMs > 30 * minute) return 1 * minute;
  if (spanMs > 10 * minute) return 30 * 1000;
  return 15 * 1000;
}

function getSizeStyle(): CSSProperties {
  return {
    width: '100%',
    height: CHART_HEIGHT,
  };
}

function binarySearchClosest(items: ChartMarker[], tsMs: number) {
  let low = 0;
  let high = items.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = items[mid];

    if (current.tsMs === tsMs) {
      return mid;
    }

    if (current.tsMs < tsMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return clamp(low, 0, Math.max(items.length - 1, 0));
}

function getMarkerHit(
  markers: ChartMarker[],
  x: number,
  y: number,
  plotWidth: number,
  range: ViewRange,
  laneY: number,
) {
  if (markers.length === 0) {
    return null;
  }

  const spanMs = range.endMs - range.startMs;
  const timeAtX = range.startMs + (x / plotWidth) * spanMs;
  const approxIndex = binarySearchClosest(markers, timeAtX);
  const maxPixelDistance = 10;
  const msPerPixel = spanMs / Math.max(plotWidth, 1);
  const maxTimeDistance = msPerPixel * maxPixelDistance;

  let best: {
    marker: ChartMarker;
    x: number;
    y: number;
    distance: number;
  } | null = null;

  for (let offset = -8; offset <= 8; offset += 1) {
    const index = approxIndex + offset;

    if (index < 0 || index >= markers.length) {
      continue;
    }

    const marker = markers[index];
    const markerX = ((marker.tsMs - range.startMs) / spanMs) * plotWidth;
    const distanceX = Math.abs(markerX - x);
    const distanceY = Math.abs(laneY - y);
    const combinedDistance = Math.hypot(distanceX, distanceY);

    if (distanceX <= maxPixelDistance && Math.abs(marker.tsMs - timeAtX) <= maxTimeDistance) {
      if (!best || combinedDistance < best.distance) {
        best = {
          marker,
          x: markerX,
          y: laneY,
          distance: combinedDistance,
        };
      }
    }
  }

  return best;
}

function chooseNearestTickSpan(spanMs: number) {
  return getTickInterval(spanMs);
}

function drawChart(
  canvas: HTMLCanvasElement,
  model: TimelineChartModel,
  range: ViewRange,
  size: ChartSize,
  hover: HoverState | null,
  drag: DragState | null,
) {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(size.width * devicePixelRatio);
  canvas.height = Math.floor(size.height * devicePixelRatio);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);

  const { left, right, top, bottom } = PLOT_PADDING;
  const plotLeft = left;
  const plotTop = top;
  const plotRight = size.width - right;
  const plotBottom = size.height - bottom;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const spanMs = range.endMs - range.startMs;

  context.fillStyle = '#0f172a';
  context.font = '600 12px Inter, system-ui, sans-serif';
  context.fillText('Runtime', 20, getLaneY(0) + 17);
  context.fillText('Downtime', 20, getLaneY(1) + 17);
  context.fillText('Stoppage', 20, getLaneY(2) + 17);
  context.fillText('Produces', 20, getMarkerLaneY('PASS') - 6);

  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;

  for (const lane of BAND_LANES) {
    const y = getLaneY(BAND_LANES.findIndex((entry) => entry.kind === lane.kind));
    context.fillStyle = 'rgba(148, 163, 184, 0.12)';
    context.fillRect(plotLeft, y, plotWidth, 26);
    context.fillStyle = lane.color;
    context.fillRect(plotLeft, y, 4, 26);
  }

  context.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(plotLeft, plotTop - 8);
  context.lineTo(plotLeft, plotBottom);
  context.stroke();

  const tickInterval = chooseNearestTickSpan(spanMs);
  const tickStart = Math.ceil(range.startMs / tickInterval) * tickInterval;

  context.fillStyle = AXIS_COLOR;
  context.strokeStyle = GRID_COLOR;
  context.font = '11px Inter, system-ui, sans-serif';

  for (let tick = tickStart; tick <= range.endMs; tick += tickInterval) {
    const x = plotLeft + ((tick - range.startMs) / spanMs) * plotWidth;
    context.beginPath();
    context.moveTo(x, plotTop - 4);
    context.lineTo(x, plotBottom);
    context.stroke();
    context.fillText(formatIstTick(tick), x - 18, size.height - 24);
  }

  const drawSegments = (segments: ChartSegment[], laneIndex: number, color: string) => {
    const laneY = getLaneY(laneIndex);

    for (const segment of segments) {
      const clampedStart = Math.max(segment.startMs, range.startMs);
      const clampedEnd = Math.min(segment.endMs, range.endMs);

      if (clampedEnd <= clampedStart) {
        continue;
      }

      const x = plotLeft + ((clampedStart - range.startMs) / spanMs) * plotWidth;
      const width = ((clampedEnd - clampedStart) / spanMs) * plotWidth;

      context.fillStyle = color;
      context.globalAlpha = 0.85;
      context.fillRect(x, laneY, Math.max(1, width), 26);
      context.globalAlpha = 1;
    }
  };

  drawSegments(
    model.segments.filter((segment) => segment.kind === 'runtime'),
    0,
    '#0f766e',
  );
  drawSegments(
    model.segments.filter((segment) => segment.kind === 'downtime'),
    1,
    '#d97706',
  );
  drawSegments(
    model.segments.filter((segment) => segment.kind === 'stoppage'),
    2,
    '#dc2626',
  );

  const drawMarkers = (markers: ChartMarker[], result: ChartMarkerResult) => {
    const laneY = getMarkerLaneY(result);
    const markerColor = getMarkerColor(result);

    for (const marker of markers) {
      const x = plotLeft + ((marker.tsMs - range.startMs) / spanMs) * plotWidth;
      const size = marker.mode === 'aggregate' ? 4 + Math.min(6, Math.log2(marker.count + 1)) : 3;
      const radius = size;

      context.beginPath();
      context.fillStyle = markerColor;
      context.arc(x, laneY, radius, 0, Math.PI * 2);
      context.fill();

      if (marker.mode === 'aggregate') {
        context.font = '600 10px Inter, system-ui, sans-serif';
        context.fillStyle = '#0f172a';
        context.fillText(String(marker.count), x + 8, laneY + 3);
      }
    }
  };

  drawMarkers(model.passMarkers, 'PASS');
  drawMarkers(model.failMarkers, 'FAIL');

  if (hover) {
    context.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(hover.x, plotTop - 8);
    context.lineTo(hover.x, plotBottom);
    context.stroke();

    context.fillStyle = hover.color;
    context.beginPath();
    context.arc(hover.x, hover.y, 6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(hover.x, hover.y, 3, 0, Math.PI * 2);
    context.fill();
  }

  if (drag) {
    const leftEdge = Math.min(drag.startX, drag.currentX);
    const width = Math.abs(drag.currentX - drag.startX);

    context.fillStyle = 'rgba(37, 99, 235, 0.12)';
    context.fillRect(leftEdge, plotTop - 8, width, plotHeight + 8);
    context.strokeStyle = 'rgba(37, 99, 235, 0.55)';
    context.strokeRect(leftEdge, plotTop - 8, width, plotHeight + 8);
  }
}

export function TimelineChart({
  request,
  data,
  status,
  error,
  showIndividualProduces,
  onRetry,
}: TimelineChartProps) {
  const model = useMemo(
    () => buildTimelineChartModel(request, data, showIndividualProduces),
    [data, request, showIndividualProduces],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [viewRange, setViewRange] = useState<ViewRange | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useLayoutEffect(() => {
    const element = wrapperRef.current;

    if (!element) {
      return undefined;
    }

    const measure = () => {
      const nextWidth = Math.floor(
        element.getBoundingClientRect().width ||
          element.clientWidth ||
          element.parentElement?.clientWidth ||
          0,
      );
      if (nextWidth > 0) {
        setWidth(nextWidth);
      }
    };

    measure();

    const animationFrame = window.requestAnimationFrame(measure);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measure();
          })
        : null;

    resizeObserver?.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!model) {
      setViewRange(null);
      setHover(null);
      setDrag(null);
      setIsInteracting(false);
      return;
    }

    setViewRange({
      startMs: model.fullStartMs,
      endMs: model.fullEndMs,
    });
    setHover(null);
    setDrag(null);
    setIsInteracting(false);
  }, [model]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !model || !viewRange || width === 0) {
      return;
    }

    drawChart(
      canvas,
      model,
      viewRange,
      {
        width,
        height: CHART_HEIGHT,
      },
      hover,
      drag,
    );
  }, [drag, hover, model, viewRange, width]);

  function resetZoom() {
    if (!model) {
      return;
    }

    setViewRange({
      startMs: model.fullStartMs,
      endMs: model.fullEndMs,
    });
  }

  function screenXToTime(x: number) {
    if (!viewRange) {
      return 0;
    }

    const { left, right } = PLOT_PADDING;
    const plotWidth = Math.max(1, width - left - right);
    const clampedX = clamp(x, left, width - right);
    const ratio = (clampedX - left) / plotWidth;

    return viewRange.startMs + ratio * (viewRange.endMs - viewRange.startMs);
  }

  function updateHover(nextX: number, nextY: number) {
    if (!model || !viewRange || width === 0) {
      setHover(null);
      return;
    }

    const { left, right } = PLOT_PADDING;
    const plotWidth = Math.max(1, width - left - right);
    const plotLeft = left;
    const plotRight = width - right;
    const withinPlotX = nextX >= plotLeft && nextX <= plotRight;
    const withinPlotY = nextY >= PLOT_PADDING.top && nextY <= CHART_HEIGHT - PLOT_PADDING.bottom;

    if (!withinPlotX || !withinPlotY || drag) {
      setHover(null);
      return;
    }

    const passHit = getMarkerHit(
      model.passMarkers,
      nextX - plotLeft,
      nextY,
      plotWidth,
      viewRange,
      getMarkerLaneY('PASS'),
    );
    const failHit = getMarkerHit(
      model.failMarkers,
      nextX - plotLeft,
      nextY,
      plotWidth,
      viewRange,
      getMarkerLaneY('FAIL'),
    );

    const best = [passHit, failHit]
      .filter(Boolean)
      .sort((leftCandidate, rightCandidate) => {
        const leftDistance = (leftCandidate as NonNullable<typeof leftCandidate>).distance;
        const rightDistance = (rightCandidate as NonNullable<typeof rightCandidate>).distance;
        return leftDistance - rightDistance;
      })[0] as
      | {
          marker: ChartMarker;
          x: number;
          y: number;
          distance: number;
        }
      | undefined;

    if (!best) {
      setHover(null);
      return;
    }

    setHover({
      x: best.x + plotLeft,
      y: best.y,
      title: best.marker.mode === 'individual'
        ? `${formatIstTooltip(best.marker.tsMs)} · ${best.marker.result}`
        : `${formatIstTooltip(best.marker.tsMs)} · ${best.marker.result} · ${best.marker.count}`,
      subtitle:
        best.marker.mode === 'individual'
          ? 'Individual produce'
          : 'Hourly aggregated bucket',
      color: getMarkerColor(best.marker.result),
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!model || !viewRange || width === 0 || status !== 'ready') {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < PLOT_PADDING.left || x > width - PLOT_PADDING.right) {
      return;
    }

    setIsInteracting(true);
    setDrag({
      startX: x,
      currentX: x,
    });
    setHover(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    updateHover(x, y);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (drag) {
      setDrag((current) =>
        current
          ? {
              ...current,
              currentX: x,
            }
          : current,
      );
      return;
    }

    updateHover(x, y);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!model || !viewRange || !drag) {
      setDrag(null);
      setIsInteracting(false);
      return;
    }

    const selectionWidth = Math.abs(drag.currentX - drag.startX);

    if (selectionWidth >= 10) {
      const nextStart = screenXToTime(Math.min(drag.startX, drag.currentX));
      const nextEnd = screenXToTime(Math.max(drag.startX, drag.currentX));

      if (nextEnd - nextStart > 1_000) {
        setViewRange({
          startMs: Math.min(nextStart, nextEnd),
          endMs: Math.max(nextStart, nextEnd),
        });
      }
    }

    setDrag(null);
    setIsInteracting(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePointerLeave() {
    if (drag) {
      return;
    }

    setHover(null);
  }

  const canResetZoom =
    Boolean(model && viewRange) &&
    (viewRange?.startMs !== model?.fullStartMs || viewRange?.endMs !== model?.fullEndMs);

  const hoverStyle: CSSProperties | undefined = hover
    ? {
        left: clamp(hover.x + 16, 16, Math.max(width - 220, 16)),
        top: clamp(hover.y - 8, 16, CHART_HEIGHT - 96),
      }
    : undefined;

  const canvasReady = width > 0 && status === 'ready' && Boolean(model);

  if (status === 'loading') {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Loading machine intervals...
        </Typography>
      </Stack>
    );
  }

  if (status === 'error') {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{error}</Alert>
        <Box>
          <Button variant="outlined" onClick={onRetry}>
            Retry
          </Button>
        </Box>
      </Stack>
    );
  }

  if (status === 'idle') {
    return (
      <Alert severity="info">
        Select a machine, shift, and date to load the machine intervals response.
      </Alert>
    );
  }

  if (status === 'empty') {
    return (
      <Alert severity="info">
        No timeline data was returned for the selected filter combination.
      </Alert>
    );
  }

  if (!model) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Interactive Timeline
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Drag across the chart to zoom. Double-click the chart or use reset to return to the
            full shift window.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Chip
            label={model.markerMode === 'individual' ? 'Individual markers' : 'Hourly markers'}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Button variant="outlined" onClick={resetZoom} disabled={!canResetZoom}>
            Reset zoom
          </Button>
        </Stack>
      </Stack>

      <Divider />

      <Box
        ref={wrapperRef}
        sx={{
          position: 'relative',
          width: '100%',
          height: CHART_HEIGHT,
          minHeight: CHART_HEIGHT,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          cursor: isInteracting ? 'grabbing' : 'crosshair',
          userSelect: 'none',
        }}
      >
        {canvasReady ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={CHART_HEIGHT}
            style={getSizeStyle()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onDoubleClick={resetZoom}
          />
        ) : (
          <Stack
            sx={{
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              px: 3,
              textAlign: 'center',
            }}
            spacing={1}
          >
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">
              Preparing chart...
            </Typography>
          </Stack>
        )}

        {hover && hoverStyle ? (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              ...hoverStyle,
              px: 1.5,
              py: 1,
              maxWidth: 220,
              pointerEvents: 'none',
            }}
          >
            <Stack spacing={0.25}>
              <Typography variant="caption" color="text.secondary">
                {hover.subtitle}
              </Typography>
              <Typography variant="body2" fontWeight={700} sx={{ color: hover.color }}>
                {hover.title}
              </Typography>
            </Stack>
          </Paper>
        ) : null}
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        useFlexGap
        flexWrap="wrap"
        alignItems="center"
      >
        <Chip label="Runtime" size="small" sx={{ bgcolor: 'rgba(15, 118, 110, 0.12)' }} />
        <Chip label="Downtime" size="small" sx={{ bgcolor: 'rgba(217, 119, 6, 0.12)' }} />
        <Chip label="Stoppage" size="small" sx={{ bgcolor: 'rgba(220, 38, 38, 0.12)' }} />
        <Chip label="PASS markers" size="small" sx={{ bgcolor: 'rgba(22, 163, 74, 0.12)' }} />
        <Chip label="FAIL markers" size="small" sx={{ bgcolor: 'rgba(220, 38, 38, 0.12)' }} />
      </Stack>
    </Stack>
  );
}
