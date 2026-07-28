import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { ChangeEvent } from 'react';
import { getAssetsTreeRequest, getShiftsRequest } from '../features/dashboard/dashboardApi';
import { getTodayDateValue } from '../features/dashboard/dateUtils';
import { flattenAssetTree } from '../features/dashboard/dashboardUtils';
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

function getDefaultShiftId(shifts: ShiftDefinition[]) {
  return shifts.find((shift) => shift.is_active)?.id ?? shifts[0]?.id ?? '';
}

function getDefaultAssetId(options: DashboardFilterOption[]) {
  return options[0]?.id ?? '';
}

export function DashboardPage() {
  const [assets, setAssets] = useState<AssetTreeNode[]>([]);
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({
    assetId: '',
    shiftId: '',
    date: getTodayDateValue(),
    showIndividualProduces: false,
  });

  const assetOptions = useMemo(() => flattenAssetTree(assets), [assets]);
  const selectedAsset = assetOptions.find((option) => option.id === filterState.assetId) ?? null;
  const selectedShift = shifts.find((shift) => shift.id === filterState.shiftId) ?? null;

  const loadFilterData = useCallback(async ({ isManualRefresh = false } = {}) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError('');

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
      const message = requestError instanceof Error ? requestError.message : 'Failed to load filters.';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFilterData();
  }, [loadFilterData]);

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

  const selectedShiftLabel = selectedShift
    ? `${selectedShift.name} (${selectedShift.shift_timings[0]} - ${selectedShift.shift_timings[1]})`
    : '';

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
              Filter metadata is loaded. Timeline data will be connected in the next phase.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            onClick={() => loadFilterData({ isManualRefresh: true })}
            disabled={isLoading || isRefreshing}
          >
            {isLoading || isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack spacing={2.5}>
          <Autocomplete
            options={assetOptions}
            value={selectedAsset}
            onChange={handleAssetChange}
            loading={isLoading && assetOptions.length === 0}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Machine / Line"
                placeholder={isLoading ? 'Loading assets...' : 'Select a machine or line'}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoading && assetOptions.length === 0 ? (
                        <CircularProgress color="inherit" size={18} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            disabled={isLoading || assetOptions.length === 0}
          />

          <TextField
            select
            label="Shift"
            value={filterState.shiftId}
            onChange={handleShiftChange}
            SelectProps={{ native: true }}
            disabled={isLoading || shifts.length === 0}
          >
            <option value="" disabled>
              {isLoading ? 'Loading shifts...' : 'Select a shift'}
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
            disabled={isLoading}
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
    </Stack>
  );
}
