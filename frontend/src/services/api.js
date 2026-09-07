import axios from 'axios';

// In production (Docker), use relative URLs so nginx can proxy
// In development, use the explicit backend URL
// In production the UI is served from the same origin as the API, so relative
// URLs let nginx do the routing. In development Vite proxies /api and /health
// to the backend, so relative URLs work there too.
const API_URL = '';

const TOKEN_STORAGE_KEY = 'piholevault_api_token';

/**
 * The API token, when the server was started with AUTH_TOKEN set.
 *
 * It is held in localStorage rather than a cookie so that it is never attached
 * to a request the user did not initiate, which is what makes a cross-site
 * request forgery possible in the first place.
 */
export const getApiToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch (error) {
    // Storage can be unavailable in private browsing modes.
    return '';
  }
};

export const setApiToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore: the token still applies to this page's in-memory requests.
  }
};

export const clearApiToken = () => setApiToken('');

/**
 * Ask the server whether it requires a token. `/health` stays unauthenticated
 * precisely so the UI can find this out before its first real API call.
 */
export const checkAuthRequired = async () => {
  const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
  return response.data?.authRequired === true;
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Endpoints that reach out to the Pi-hole rather than answering from local
// state. The server allows up to 30s for the web API probe and 15s for an SSH
// handshake, so a 10s client timeout would always fire first and report the
// backend as unresponsive when the real problem is an unreachable Pi-hole.
const PROBE_ENDPOINTS = [
  '/pihole/test-connection',
  '/ssh/test',
  '/ssh/test-key',
  '/ssh/debug',
  '/ssh/setup-key',
  '/discord/test',
  '/discord/test-notification',
  '/backup/run'
];

const DEFAULT_TIMEOUT = 10000;
const PROBE_TIMEOUT = 45000;

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getApiToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const url = config.url || '';
    const isProbe = PROBE_ENDPOINTS.some((endpoint) => url.startsWith(endpoint));

    if (isProbe) {
      config.isProbe = true;
      // axios has already merged the instance default in by this point, so an
      // explicit per-call timeout is respected and only the default is raised.
      if (config.timeout === DEFAULT_TIMEOUT) {
        config.timeout = PROBE_TIMEOUT;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Notified when the server rejects the stored token, so the app can prompt again
// instead of silently failing every request.
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      clearApiToken();

      if (onUnauthorized) {
        onUnauthorized();
      }

      error.message = 'This PiHoleVault requires an API token, or the saved token is no longer valid.';
      return Promise.reject(error);
    }

    if (status === 429) {
      error.message = 'Too many requests. Please wait a moment and try again.';
      return Promise.reject(error);
    }

    // Better error messages for common issues
    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      error.message = 'Cannot connect to backend service. Please check if the backend is running.';
    } else if (error.code === 'ECONNREFUSED') {
      error.message = 'Connection refused. Backend service is not accessible.';
    } else if (error.code === 'TIMEOUT' || error.code === 'ECONNABORTED') {
      // Blaming the backend is wrong for the endpoints that reach out to the
      // Pi-hole: those time out because the Pi-hole did not answer, which is
      // what the user needs to hear when they mistype its address.
      error.message = error.config && error.config.isProbe
        ? 'Timed out waiting for the Pi-hole to respond. Check the address, port and that it is reachable from this machine.'
        : 'Request timeout. The backend service is taking too long to respond.';
    }

    return Promise.reject(error);
  }
);

export default api;
