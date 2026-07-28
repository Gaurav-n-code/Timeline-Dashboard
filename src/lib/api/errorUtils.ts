import { isAxiosError } from 'axios';

type ApiErrorPayload = {
  message?: unknown;
  detail?: unknown;
  errors?: unknown;
  error?: unknown;
  status_code?: unknown;
};

function getStatusCode(error: unknown) {
  if (isAxiosError(error)) {
    return error.response?.status;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === 'number') {
      return status;
    }
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: unknown; data?: unknown } }).response;
    if (typeof response?.status === 'number') {
      return response.status;
    }
  }

  if (error && typeof error === 'object' && 'status_code' in error) {
    const statusCode = (error as { status_code?: unknown }).status_code;
    if (typeof statusCode === 'number') {
      return statusCode;
    }
  }

  return undefined;
}

function flattenMessages(value: unknown, messages: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      messages.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenMessages(item, messages);
    }
    return;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['message', 'msg', 'detail', 'error', 'errors']) {
      if (key in record) {
        flattenMessages(record[key], messages);
      }
    }

    for (const nestedValue of Object.values(record)) {
      if (
        typeof nestedValue === 'string' ||
        Array.isArray(nestedValue) ||
        (nestedValue && typeof nestedValue === 'object')
      ) {
        flattenMessages(nestedValue, messages);
      }
    }
  }
}

export function getApiErrorStatus(error: unknown) {
  return getStatusCode(error);
}

export function getApiErrorMessage(error: unknown, fallback = 'Request failed.') {
  const status = getStatusCode(error);

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (status === 403) {
    return 'Access denied.';
  }

  if (status === 422) {
    const messages: string[] = [];

    if (isAxiosError(error)) {
      flattenMessages(error.response?.data as ApiErrorPayload | undefined, messages);
    } else if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { data?: unknown } }).response;
      flattenMessages(response?.data, messages);
    } else {
      flattenMessages(error, messages);
    }

    const uniqueMessages = [...new Set(messages)].filter(Boolean);

    if (uniqueMessages.length > 0) {
      return uniqueMessages.join(' ');
    }

    return 'Validation error. Please check the submitted values.';
  }

  if (status === 500) {
    return 'The server encountered an error. Please retry.';
  }

  if (isAxiosError(error)) {
    const responseData = error.response?.data as ApiErrorPayload | undefined;
    const messages: string[] = [];
    flattenMessages(responseData, messages);

    const uniqueMessages = [...new Set(messages)].filter(Boolean);
    if (uniqueMessages.length > 0) {
      return uniqueMessages.join(' ');
    }
  }

  if (error instanceof Error && error.message && error.message !== 'Request failed') {
    return error.message;
  }

  return fallback;
}

export function isRetryableApiError(error: unknown) {
  return getStatusCode(error) === 500;
}
