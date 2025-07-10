import axios from 'axios';

// In production (Docker), use relative URLs so nginx can proxy
// In development, use the explicit backend URL
const API_URL = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:3001');

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Error:', {
      message: error.message,
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Better error messages for common issues
    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      error.message = 'Cannot connect to backend service. Please check if the backend is running.';
    } else if (error.code === 'ECONNREFUSED') {
      error.message = 'Connection refused. Backend service is not accessible.';
    } else if (error.code === 'TIMEOUT') {
      error.message = 'Request timeout. The backend service is taking too long to respond.';
    }
    
    return Promise.reject(error);
  }
);

export default api;
