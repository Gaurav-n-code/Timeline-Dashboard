import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { MachineIntervalsRequest, ParsedMachineIntervals } from './timelineApi';
import type { ParsedHourlyCycleMetricsBucket } from './cycleMetricsApi';
import { buildHourlySummaryRows, formatMinutes, formatSeconds } from './hourlySummary';

type TimelineStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type HourlySummaryTableProps = {
  request: MachineIntervalsRequest | null;
  data: ParsedMachineIntervals | null;
  cycleMetrics: ParsedHourlyCycleMetricsBucket[] | null;
  cycleMetricsStatus: TimelineStatus;
  cycleMetricsError: string;
  status: TimelineStatus;
  error: string;
  onRetry: () => void;
};

function formatRowValue(value: number | null, kind: 'minutes' | 'seconds') {
  if (kind === 'minutes') {
    return formatMinutes(value ?? 0);
  }

  return formatSeconds(value);
}

function getColumnMinWidth(columnCount: number) {
  return Math.max(900, columnCount * 132);
}

export function HourlySummaryTable({
  request,
  data,
  cycleMetrics,
  cycleMetricsStatus,
  cycleMetricsError,
  status,
  error,
  onRetry,
}: HourlySummaryTableProps) {
  const rows = buildHourlySummaryRows(request, data, cycleMetrics);

  if (status === 'loading') {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Building hourly summary...
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
        Select a machine, shift, and date to load the hourly summary.
      </Alert>
    );
  }

  if (status === 'empty') {
    return (
      <Alert severity="info">
        No hourly summary data was returned for the selected filter combination.
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <Alert severity="info">
        No hourly summary rows are available for the selected time window.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={700}>
          Hourly Production &amp; Downtime Summary
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All timestamps are shown in IST. Runtime, downtime, and stoppage minutes are split
          across hourly boundaries.
        </Typography>
      </Box>

      <Divider />

      {cycleMetricsStatus === 'error' ? (
        <Alert severity="warning" action={<Button onClick={onRetry}>Retry</Button>}>
          {cycleMetricsError || 'Cycle-time metrics could not be loaded.'}
        </Alert>
      ) : null}

      <TableContainer
        sx={{
          overflowX: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Table stickyHeader size="small" sx={{ minWidth: getColumnMinWidth(rows.length + 1) }}>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 180,
                  fontWeight: 700,
                }}
              >
                Metric
              </TableCell>
              {rows.map((row) => (
                <TableCell key={row.hourStartMs} align="center" sx={{ minWidth: 132 }}>
                  <Stack spacing={0.25} alignItems="center">
                    <Typography variant="body2" fontWeight={700} noWrap>
                      {row.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      IST
                    </Typography>
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {[
              {
                label: 'Total',
                getValue: (row: (typeof rows)[number]) => row.totalCount,
                emphasize: false,
              },
              {
                label: 'Pass',
                getValue: (row: (typeof rows)[number]) => row.passCount,
                emphasize: false,
              },
              {
                label: 'Fail',
                getValue: (row: (typeof rows)[number]) => row.failCount,
                emphasize: false,
              },
              {
                label: 'Runtime (min)',
                getValue: (row: (typeof rows)[number]) => row.runtimeMinutes,
                emphasize: false,
              },
              {
                label: 'Unknown downtime (min)',
                getValue: (row: (typeof rows)[number]) => row.unknownDowntimeMinutes,
                emphasize: false,
              },
              {
                label: 'Stoppage (min)',
                getValue: (row: (typeof rows)[number]) => row.stoppageMinutes,
                emphasize: false,
              },
              {
                label: 'Ideal Cycle Time (s)',
                getValue: (row: (typeof rows)[number]) => row.idealCycleTimeSeconds,
                emphasize: false,
              },
              {
                label: 'Actual Cycle Time (s)',
                getValue: (row: (typeof rows)[number]) => row.actualCycleTimeSeconds,
                emphasize: false,
              },
            ].map((metric) => (
              <TableRow key={metric.label} sx={metric.emphasize ? { bgcolor: 'action.hover' } : undefined}>
                <TableCell
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    bgcolor: metric.emphasize ? 'action.hover' : 'background.paper',
                    fontWeight: metric.emphasize ? 700 : 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {metric.label}
                </TableCell>
                {rows.map((row) => (
                  <TableCell
                    key={`${metric.label}-${row.hourStartMs}`}
                    align="center"
                    sx={{
                      fontWeight: metric.emphasize ? 700 : 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatRowValue(
                      metric.getValue(row),
                      metric.label.includes('(s)') ? 'seconds' : 'minutes',
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
