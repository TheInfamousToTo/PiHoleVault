const axios = require('axios');
const https = require('https');

class PiHoleWebService {
  constructor(logger = console) {
    this.logger = logger;
  }

  createApiClient(host, port = 80, useHttps = false) {
    // Handle full URLs (e.g., "https://your-pihole-domain.com/admin")
    let baseURL;
    if (host.startsWith('http://') || host.startsWith('https://')) {
      baseURL = host;
    } else {
      baseURL = `${useHttps ? 'https' : 'http'}://${host}${port !== (useHttps ? 443 : 80) ? ':' + port : ''}`;
    }
    
    return axios.create({
      baseURL,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      headers: {
        'User-Agent': 'PiHoleVault/1.0'
      }
    });
  }

  async testWebConnection(config) {
    const { host, webPort = 80, useHttps = false } = config;
    
    try {
      const api = this.createApiClient(host, webPort, useHttps);
      const response = await api.get('/admin/');

      if (response && response.status === 200) {
        return {
          success: true,
          message: 'Pi-hole web interface is accessible'
        };
      }

      throw new Error('No accessible endpoints found');
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async authenticateWeb(config) {
    const { host, webPort = 80, useHttps = false, webPassword } = config;
    
    if (!webPassword) {
      return {
        success: false,
        error: 'Web password is required for authentication'
      };
    }

    try {
      const api = this.createApiClient(host, webPort, useHttps);
      
      // Try different authentication methods for different Pi-hole versions
      const authEndpoints = [
        // Modern Pi-hole API (v6.0+) - try first since error message indicates this
        { url: '/api/auth', method: 'post', data: { password: webPassword }, headers: { 'Content-Type': 'application/json' } },
        // Legacy endpoints for older versions
        { url: '/admin/api/auth', method: 'post', data: { password: webPassword }, headers: { 'Content-Type': 'application/json' } },
        // Legacy token auth with proper params
        { url: '/admin/api.php', method: 'get', params: { auth: webPassword, summary: '' } },
        { url: '/api.php', method: 'get', params: { auth: webPassword, summary: '' } },
        // Legacy with different format
        { url: '/admin/api.php', method: 'get', params: { auth: webPassword, topItems: '10' } },
        { url: '/api.php', method: 'get', params: { auth: webPassword, topItems: '10' } }
      ];

      for (const endpoint of authEndpoints) {
        try {
          let testResponse;
          if (endpoint.method === 'post') {
            testResponse = await api.post(endpoint.url, endpoint.data, {
              headers: endpoint.headers || { 'Content-Type': 'application/json' }
            });
          } else {
            testResponse = await api.get(endpoint.url, { params: endpoint.params });
          }
          
          if (testResponse.status === 200) {
            // For modern API, extract session info from response
            let sessionInfo = {
              valid: true,
              token: webPassword,
              method: endpoint.method === 'post' ? 'modern-api' : 'token',
              endpoint: endpoint.url,
              baseUrl: api.defaults.baseURL
            };

            // If this is a modern API response, extract session details
            if (endpoint.method === 'post' && testResponse.data && testResponse.data.session) {
              const session = testResponse.data.session;
              sessionInfo = {
                ...sessionInfo,
                sid: session.sid,
                csrf: session.csrf,
                validity: session.validity,
                totp: session.totp,
                cookies: testResponse.headers['set-cookie'] || []
              };
              
              // Update API client to use session cookies
              if (session.sid) {
                api.defaults.headers.Cookie = `sid=${session.sid}`;
                if (session.csrf) {
                  api.defaults.headers['X-CSRF-TOKEN'] = session.csrf;
                }
              }
              
              this.logger.debug('Session extracted from response body', {
                sid: session.sid ? 'present' : 'missing',
                csrf: session.csrf ? 'present' : 'missing',
                cookieString: `sid=${session.sid}`
              });
            } else if (endpoint.method === 'post') {
              // Fallback: Extract session info from cookies if not in response body
              const setCookies = testResponse.headers['set-cookie'] || [];
              let sid = null;
              let csrf = null;
              
              // Parse cookies to find session ID and CSRF token  
              setCookies.forEach(cookie => {
                if (cookie.includes('sid=')) {
                  const sidMatch = cookie.match(/sid=([^;]+)/);
                  if (sidMatch) {
                    sid = sidMatch[1];
                  }
                }
                if (cookie.includes('csrf=')) {
                  const csrfMatch = cookie.match(/csrf=([^;]+)/);
                  if (csrfMatch) {
                    csrf = csrfMatch[1];
                  }
                }
              });

              if (sid) {
                sessionInfo = {
                  ...sessionInfo,
                  sid: sid,
                  csrf: csrf,
                  cookies: setCookies
                };
                
                // Update API client to use session cookies
                let cookieString = `sid=${sid}`;
                if (csrf) {
                  cookieString += `; csrf=${csrf}`;
                }
                api.defaults.headers.Cookie = cookieString;
                if (csrf) {
                  api.defaults.headers['X-CSRF-TOKEN'] = csrf;
                }
                
                this.logger.debug('Session extracted from cookies', {
                  sid: sid ? 'present' : 'missing',
                  csrf: csrf ? 'present' : 'missing',
                  cookieString: cookieString
                });
              }
            }

            this.logger.info('Pi-hole authentication successful', { 
              host: host.substring(0, 50),
              endpoint: endpoint.url,
              method: endpoint.method,
              sessionValid: sessionInfo.sid ? true : false
            });
            
            return {
              success: true,
              session: sessionInfo,
              message: 'Authentication successful',
              api: api // Return the configured API client
            };
          }
        } catch (error) {
          // Continue to next endpoint
          this.logger.debug('Auth endpoint failed', { 
            url: endpoint.url, 
            error: error.message,
            status: error.response?.status
          });
          continue;
        }
      }

      throw new Error('All authentication methods failed');

    } catch (error) {
      this.logger.error('Pi-hole web authentication failed', { 
        host: host.substring(0, 50), 
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  async performWebOnlyBackup(connection, backupDir) {
    const fs = require('fs-extra');
    const path = require('path');
    
    try {
      this.logger.info('Starting web-only backup', { 
        host: connection.host?.substring(0, 50), // Truncate for logging
        backupDir: backupDir
      });

      // Authenticate first and get configured API client
      const authResult = await this.authenticateWeb(connection);
      if (!authResult.success) {
        return authResult; // Return the authentication error
      }

      // Use the authenticated API client and session
      const api = authResult.api || this.createApiClient(connection.host, connection.webPassword);
      const session = authResult.session;
      
      // Try different backup endpoints based on authentication method
      let backupEndpoints = [];
      
      if (session.method === 'modern-api') {
        // Modern Pi-hole API endpoints (v6.0+)
        backupEndpoints = [
          '/api/teleporter',
          '/admin/api/teleporter',
          '/api/scripts/pi-hole/php/teleporter.php',
          '/admin/scripts/pi-hole/php/teleporter.php'
        ];
      } else {
        // Legacy token-based endpoints
        backupEndpoints = [
          `/admin/scripts/pi-hole/php/teleporter.php?token=${session.token}`,
          `/scripts/pi-hole/php/teleporter.php?token=${session.token}`,
          `/admin/api.php?auth=${session.token}&action=teleporter`,
          `/api.php?auth=${session.token}&action=teleporter`
        ];
      }

      this.logger.info('Attempting backup retrieval with endpoints', {
        sessionMethod: session.method,
        endpointCount: backupEndpoints.length,
        endpoints: backupEndpoints.slice(0, 3) // Show first 3 endpoints
      });

      for (const endpoint of backupEndpoints) {
        try {
          this.logger.info('Trying backup endpoint', { endpoint, sessionMethod: session.method });
          
          let backupResponse;
          
          if (session.method === 'modern-api') {
            // For modern API, send a GET or POST request with session cookies
            backupResponse = await api.get(endpoint);
          } else {
            // For legacy, use GET with token
            backupResponse = await api.get(endpoint);
          }

          this.logger.info('Backup endpoint response', {
            endpoint,
            status: backupResponse.status,
            hasData: !!backupResponse.data,
            dataType: typeof backupResponse.data,
            dataLength: backupResponse.data ? 
              (typeof backupResponse.data === 'string' ? backupResponse.data.length : 
               Buffer.isBuffer(backupResponse.data) ? backupResponse.data.length :
               JSON.stringify(backupResponse.data).length) : 0,
            contentType: backupResponse.headers?.['content-type']
          });

          if (backupResponse.status === 200 && backupResponse.data) {
            // Check if we got actual backup data
            const isBackupData = this.isValidBackupData(backupResponse.data);
            
            this.logger.info('Backup data validation', {
              endpoint,
              isValid: isBackupData,
              dataPreview: typeof backupResponse.data === 'string' ? 
                backupResponse.data.substring(0, 100) + '...' : 
                `[${typeof backupResponse.data}]`
            });
            
            if (isBackupData) {
              this.logger.info('Backup retrieved successfully', { 
                host: connection.host?.substring(0, 50),
                endpoint,
                dataSize: typeof backupResponse.data === 'string' ? backupResponse.data.length : JSON.stringify(backupResponse.data).length
              });
              
              // Save backup data to file
              if (!backupDir) {
                throw new Error('Backup directory not provided');
              }
              
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `pi-hole_backup_${timestamp}.zip`;
              const filePath = path.join(backupDir, filename);
              
              // Write the backup data to file
              if (Buffer.isBuffer(backupResponse.data)) {
                await fs.writeFile(filePath, backupResponse.data);
              } else if (typeof backupResponse.data === 'string') {
                await fs.writeFile(filePath, backupResponse.data, 'binary');
              } else {
                await fs.writeFile(filePath, JSON.stringify(backupResponse.data, null, 2));
              }
              
              const stats = await fs.stat(filePath);
              
              this.logger.info('Backup file saved', {
                filename,
                size: stats.size,
                path: filePath
              });
              
              return {
                success: true,
                filename: filename,
                size: stats.size,
                format: 'zip'
              };
            }
          }
        } catch (error) {
          this.logger.info('Backup endpoint failed', { 
            endpoint, 
            error: error.message,
            status: error.response?.status,
            details: error.response?.data ? String(error.response.data).substring(0, 200) : 'No response data'
          });
          continue;
        }
      }

      return {
        success: false,
        error: 'Failed to retrieve backup from Pi-hole API',
        details: 'All backup endpoints failed or returned invalid data'
      };

    } catch (error) {
      this.logger.error('Web-only backup failed', error);
      return {
        success: false,
        error: 'Backup operation failed',
        details: error.message
      };
    }
  }

  /**
   * Check if the response data is valid backup data
   */
  isValidBackupData(data) {
    if (!data) {
      return false;
    }

    // For binary/compressed data (like tar files), check for binary content
    if (typeof data === 'string') {
      // Check if it's a compressed file (starts with common archive magic numbers)
      const binaryMarkers = [
        '\x1f\x8b', // gzip
        'PK',        // zip
        'BZ',        // bzip2
        '\x75\x73\x74\x61\x72', // tar
        '<!DOCTYPE', // HTML error page
        '<html',     // HTML error page
      ];
      
      // If it contains HTML tags, it's probably an error page
      if (data.includes('<!DOCTYPE') || data.includes('<html')) {
        this.logger.debug('Received HTML response instead of backup data');
        return false;
      }
      
      // Check for binary markers or reasonable size
      const hasBinaryMarker = binaryMarkers.some(marker => 
        marker !== '<!DOCTYPE' && marker !== '<html' && data.startsWith(marker)
      );
      
      // Valid if it has binary markers or is substantial size
      return hasBinaryMarker || data.length > 1000;
    }
    
    // For buffer/binary data
    if (Buffer.isBuffer(data)) {
      return data.length > 100; // Reasonable minimum size for backup
    }
    
    // For objects, check if it looks like backup data structure
    if (typeof data === 'object') {
      // Sometimes Pi-hole returns structured data
      return data.hasOwnProperty('data') || data.hasOwnProperty('content') || data.hasOwnProperty('backup');
    }
    
    return false;
  }
}

module.exports = PiHoleWebService;
