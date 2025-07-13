// Global Analytics Service for PiHoleVault
// Handles tracking backup jobs and fetching global statistics

const ANALYTICS_API_BASE = 'https://PiHoleVault.satrawi.cc';

// Generate or retrieve unique instance ID
export const getInstanceId = () => {
  let instanceId = localStorage.getItem('piholevault_instance_id');
  
  if (!instanceId) {
    // Generate unique ID: piholevault-{random-string}
    instanceId = 'piholevault-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('piholevault_instance_id', instanceId);
  }
  
  return instanceId;
};

// Record backup job start
export const recordBackupStart = async (piholeServer) => {
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/backup-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: getInstanceId(),
        job_status: 'started',
        pihole_server: piholeServer
      }),
      timeout: 5000 // 5 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('Analytics: Backup start recorded');
  } catch (error) {
    console.log('Analytics tracking failed (non-critical):', error.message);
  }
};

// Record backup job success
export const recordBackupSuccess = async (backupData) => {
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/backup-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: getInstanceId(),
        job_status: 'success',
        backup_filename: backupData.filename,
        backup_size: backupData.size || 0, // in bytes
        pihole_server: backupData.piholeServer,
        job_duration: backupData.duration || 0 // in seconds
      }),
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('Analytics: Backup success recorded');
  } catch (error) {
    console.log('Analytics tracking failed (non-critical):', error.message);
  }
};

// Record backup job failure
export const recordBackupFailure = async (errorData) => {
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/backup-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: getInstanceId(),
        job_status: 'failure',
        error_message: errorData.message || 'Unknown error',
        pihole_server: errorData.piholeServer,
        job_duration: errorData.duration || 0 // in seconds
      }),
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('Analytics: Backup failure recorded');
  } catch (error) {
    console.log('Analytics tracking failed (non-critical):', error.message);
  }
};

// Fetch global analytics
export const fetchGlobalAnalytics = async () => {
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/analytics`, {
      method: 'GET',
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Analytics: Global stats fetched successfully');
    return data;
  } catch (error) {
    console.error('Failed to fetch global analytics:', error.message);
    throw error;
  }
};

// Fetch instance-specific analytics
export const fetchInstanceAnalytics = async (instanceId = null) => {
  try {
    const id = instanceId || getInstanceId();
    const response = await fetch(`${ANALYTICS_API_BASE}/analytics/${id}`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Analytics: Instance stats fetched successfully');
    return data;
  } catch (error) {
    console.error('Failed to fetch instance analytics:', error.message);
    throw error;
  }
};

// Health check for analytics service
export const checkAnalyticsHealth = async () => {
  try {
    const response = await fetch(`${ANALYTICS_API_BASE}/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.log('Analytics service health check failed:', error.message);
    return false;
  }
};
