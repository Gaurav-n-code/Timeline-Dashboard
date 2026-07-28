import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { getAssetsTreeRequest, getShiftsRequest } from '../features/dashboard/dashboardApi';
import { HourlySummaryTable } from '../features/dashboard/HourlySummaryTable';
import {
  buildHourlyCycleMetricsRequest,
  getHourlyCycleMetricsRequest,
  type ParsedHourlyCycleMetricsBucket,
} from '../features/dashboard/cycleMetricsApi';
import { getDefaultTimelineDateValue } from '../features/dashboard/dateUtils';
import { flattenAssetTree } from '../features/dashboard/dashboardUtils';
import { TimelineChart } from '../features/dashboard/TimelineChart';
import {
  buildMachineIntervalsRequest,
  getMachineIntervalsRequest,
  parseMachineIntervalsResponse,
  type ParsedMachineIntervals,
} from '../features/dashboard/timelineApi';
import type {
  AssetTreeNode,
  DashboardFilterOption,
  ShiftDefinition,
} from '../features/dashboard/types';

type FilterState = {
  assetId: string;
  shiftId: string;
  date: string;
  showIndividualProduces: boolean;
};

type TimelineStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

function getDefaultShiftId(shifts: ShiftDefinition[]) {
  return shifts.find((shift) => shift.is_active)?.id ?? shifts[0]?.id ?? '';
}

function getDefaultAssetId(options: DashboardFilterOption[]) {
  return options[0]?.id ?? '';
}

function getTimelineErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Failed to load timeline data.';
}

export function DashboardPage() {
  const [assets, setAssets] = useState<AssetTreeNode[]>([]);
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [isRefreshingFilters, setIsRefreshingFilters] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({
    assetId: '',
    shiftId: '',
    date: getDefaultTimelineDateValue(),
    showIndividualProduces: false,
  });

  const [timelineData, setTimelineData] = useState<ParsedMachineIntervals | null>(null);
  const [timelineStatus, setTimelineStatus] = useState<TimelineStatus>('idle');
  const [timelineError, setTimelineError] = useState('');
  const [timelineRetryCount, setTimelineRetryCount] = useState(0);
  const [cycleMetricsData, setCycleMetricsData] = useState<ParsedHourlyCycleMetricsBucket[] | null>(
    null,
  );
  const [cycleMetricsStatus, setCycleMetricsStatus] = useState<TimelineStatus>('idle');

  const requestSequenceRef = useRef(0);

  const assetOptions = useMemo(() => flattenAssetTree(assets), [assets]);
  const selectedAsset = assetOptions.find((option) => option.id === filterState.assetId) ?? null;
  const selectedShift = shifts.find((shift) => shift.id === filterState.shiftId) ?? null;

  const timelineRequest = useMemo(() => {
    if (!selectedAsset || !selectedShift || !filterState.date) {
      return null;
    }

    return buildMachineIntervalsRequest({
      assetId: selectedAsset.id,
      assetLevelId: selectedAsset.assetLevelId,
      date: filterState.date,
      shiftTimings: selectedShift.shift_timings,
      exactProduces: filterState.showIndividualProduces,
    });
  }, [filterState.date, filterState.showIndividualProduces, selectedAsset, selectedShift]);

  const selectedShiftLabel = selectedShift
    ? `${selectedShift.name} (${selectedShift.shift_timings[0]} - ${selectedShift.shift_timings[1]})`
    : '';

  const loadFilterData = useCallback(async ({ isManualRefresh = false } = {}) => {
    if (isManualRefresh) {
      setIsRefreshingFilters(true);
    } else {
      setIsLoadingFilters(true);
    }

    setFilterError('');

    try {
      const [nextAssets, nextShifts] = await Promise.all([
        getAssetsTreeRequest(),
        getShiftsRequest(),
      ]);
      const nextAssetOptions = flattenAssetTree(nextAssets);

      setAssets(nextAssets);
      setShifts(nextShifts);

      setFilterState((current) => {
        const nextAssetId =
          current.assetId && nextAssetOptions.some((option) => option.id === current.assetId)
            ? current.assetId
            : getDefaultAssetId(nextAssetOptions);

        const nextShiftId =
          current.shiftId && nextShifts.some((shift) => shift.id === current.shiftId)
            ? current.shiftId
            : getDefaultShiftId(nextShifts);

        return {
          ...current,
          assetId: nextAssetId,
          shiftId: nextShiftId,
        };
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to load filters.';
      setFilterError(message);
    } finally {
      setIsLoadingFilters(false);
      setIsRefreshingFilters(false);
    }
  }, []);

  useEffect(() => {
    void loadFilterData();
  }, [loadFilterData]);

  useEffect(() => {
    if (!timelineRequest) {
      setTimelineStatus('idle');
      setTimelineData(null);
      setTimelineError('');
      setCycleMetricsStatus('idle');
      setCycleMetricsData(null);
      return;
    }

    let isActive = true;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const request = timelineRequest;

    setTimelineStatus('loading');
    setTimelineError('');
    setTimelineData(null);
    setCycleMetricsStatus('loading');
    setCycleMetricsData(null);

    async function loadTimelineData() {
      try {
        const response = await getMachineIntervalsRequest(request);

        if (!isActive || requestSequenceRef.current !== sequence) {
          return;
        }

        const parsed = parseMachineIntervalsResponse(response);

        if (
          parsed.machineIds.length === 0 &&
          parsed.runtimes.length === 0 &&
          parsed.downtimes.length === 0 &&
          parsed.stoppages.length === 0 &&
          parsed.produceCounts.length === 0 &&
          parsed.produces.length === 0
        ) {
          setTimelineData(parsed);
          setTimelineStatus('empty');
          return;
        }

        setTimelineData(parsed);
        setTimelineStatus('ready');
      } catch (error) {
        if (!isActive || requestSequenceRef.current !== sequence) {
          return;
        }

        setTimelineError(getTimelineErrorMessage(error));
        setTimelineStatus('error');
      }
    }

    void loadTimelineData();

    async function loadCycleMetricsData() {
      try {
        const response = await getHourlyCycleMetricsRequest(
          buildHourlyCycleMetricsRequest(request),
        );

        if (!isActive || requestSequenceRef.current !== sequence) {
          return;
        }

        setCycleMetricsData(response);
        setCycleMetricsStatus('ready');
      } catch {
        if (!isActive || requestSequenceRef.current !== sequence) {
          return;
        }

        setCycleMetricsData(null);
        setCycleMetricsStatus('ready');
      }
    }

    void loadCycleMetricsData();

    return () => {
      isActive = false;
    };
  }, [timelineRequest, timelineRetryCount]);

  function handleAssetChange(_: unknown, value: DashboardFilterOption | null) {
    setFilterState((current) => ({
      ...current,
      assetId: value?.id ?? '',
    }));
  }

  function handleShiftChange(event: ChangeEvent<HTMLInputElement>) {
    setFilterState((current) => ({
      ...current,
      shiftId: event.target.value,
    }));
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setFilterState((current) => ({
      ...current,
      date: event.target.value,
    }));
  }

  function handleToggleChange(event: ChangeEvent<HTMLInputElement>) {
    setFilterState((current) => ({
      ...current,
      showIndividualProduces: event.target.checked,
    }));
  }

  function handleRetryTimeline() {
    setTimelineRetryCount((current) => current + 1);
  }

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={1.5}
        >
          <Box>
            <Typography variant="h5" component="h1" fontWeight={700}>
              Dashboard Filters
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Filter metadata is loaded. Timeline data is fetched in the background.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            onClick={() => loadFilterData({ isManualRefresh: true })}
            disabled={isLoadingFilters || isRefreshingFilters}
          >
            {isLoadingFilters || isRefreshingFilters ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>

        {filterError ? <Alert severity="error">{filterError}</Alert> : null}

        <Stack spacing={2.5}>
          <Autocomplete
            options={assetOptions}
            value={selectedAsset}
            onChange={handleAssetChange}
            loading={isLoadingFilters && assetOptions.length === 0}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Machine / Line"
                placeholder={isLoadingFilters ? 'Loading assets...' : 'Select a machine or line'}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoadingFilters && assetOptions.length === 0 ? (
                        <CircularProgress color="inherit" size={18} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            disabled={isLoadingFilters || assetOptions.length === 0}
          />

          <TextField
            select
            label="Shift"
            value={filterState.shiftId}
            onChange={handleShiftChange}
            SelectProps={{ native: true }}
            disabled={isLoadingFilters || shifts.length === 0}
          >
            <option value="" disabled>
              {isLoadingFilters ? 'Loading shifts...' : 'Select a shift'}
            </option>
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name} ({shift.shift_timings[0]} - {shift.shift_timings[1]})
              </option>
            ))}
          </TextField>

          <TextField
            label="Date"
            type="date"
            value={filterState.date}
            onChange={handleDateChange}
            InputLabelProps={{ shrink: true }}
            disabled={isLoadingFilters}
          />

          <FormControlLabel
            control={
              <Switch
                checked={filterState.showIndividualProduces}
                onChange={handleToggleChange}
              />
            }
            label="Show individual produces"
          />
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Selected filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Machine / Line: {selectedAsset?.label ?? 'Not selected'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Shift: {selectedShiftLabel || 'Not selected'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Date: {filterState.date || 'Not selected'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Individual produces: {filterState.showIndividualProduces ? 'On' : 'Off'}
          </Typography>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={2}>
          <TimelineChart
            request={timelineRequest}
            data={timelineData}
            status={timelineStatus}
            error={timelineError}
            showIndividualProduces={filterState.showIndividualProduces}
            onRetry={handleRetryTimeline}
          />
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
          <HourlySummaryTable
            request={timelineRequest}
            data={timelineData}
            cycleMetrics={cycleMetricsData}
            status={timelineStatus === 'loading' || cycleMetricsStatus === 'loading' ? 'loading' : timelineStatus}
            error={timelineError}
            onRetry={handleRetryTimeline}
          />
      </Paper>
    </Stack>
  );
}
