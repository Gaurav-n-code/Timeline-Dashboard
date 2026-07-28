const IST_OFFSET_MINUTES = 5 * 60 + 30;

export type IstShiftWindow = {
  from_ts: string;
  to_ts: string;
};

function parseDateValue(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date value: ${dateValue}`);
  }

  return { year, month, day };
}

function parseTimeValue(timeValue: string) {
  const [hours, minutes] = timeValue.split(':').map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time value: ${timeValue}`);
  }

  return { hours, minutes };
}

function buildUtcDateFromIst(dateValue: string, timeValue: string, addDays = 0) {
  const { year, month, day } = parseDateValue(dateValue);
  const { hours, minutes } = parseTimeValue(timeValue);
  const utcMs =
    Date.UTC(year, month - 1, day + addDays, hours, minutes) - IST_OFFSET_MINUTES * 60_000;

  return new Date(utcMs);
}

export function buildIstShiftWindow(dateValue: string, shiftTimings: [string, string]): IstShiftWindow {
  const fromDate = buildUtcDateFromIst(dateValue, shiftTimings[0]);
  const crossesMidnight = shiftTimings[1] <= shiftTimings[0];
  const toDate = buildUtcDateFromIst(dateValue, shiftTimings[1], crossesMidnight ? 1 : 0);

  return {
    from_ts: fromDate.toISOString(),
    to_ts: toDate.toISOString(),
  };
}
