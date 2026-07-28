export function getApiBaseUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL is missing. Set it in .env.local.');
  }

  return baseUrl;
}
