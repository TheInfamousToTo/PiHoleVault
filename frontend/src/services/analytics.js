// Community statistics from the optional PiHoleVault analytics service.
//
// The browser only ever reads the public totals. Reporting backups is done by
// the backend, and only when the user has opted in under Settings -> Privacy;
// it sends the backup size and duration and nothing that identifies the
// Pi-hole.

const ANALYTICS_API_BASE = 'https://PiHoleVault.satrawi.com';

export const fetchGlobalAnalytics = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/analytics`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};
