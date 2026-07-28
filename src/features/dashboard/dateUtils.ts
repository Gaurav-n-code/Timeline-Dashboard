const IST_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_TIMELINE_DATE = '2026-06-23';

export function formatDateForInputInTimeZone(date: Date, timeZone = IST_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getTodayDateValue() {
  return formatDateForInputInTimeZone(new Date());
}

export function getDefaultTimelineDateValue() {
  return DEFAULT_TIMELINE_DATE;
}
