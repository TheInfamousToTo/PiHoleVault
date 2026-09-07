const axios = require('axios');
const https = require('https');
const { isValidHost } = require('../utils/validate');

class PiHoleWebService {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Split a configured host into a hostname and, when it carries one, a scheme.
   *
   * Only a bare hostname or IP address is accepted, optionally prefixed with
   * http:// or https://. A path, query, fragment, credentials or anything
   * outside the hostname character set is refused: the value reaches an axios
   * baseURL, so accepting a full URL let a stored configuration point this
   * client at any host the server can reach.
   *
   * The scheme is preserved rather than discarded, so an existing
   * "https://pihole.example.com" configuration keeps using HTTPS instead of
   * being silently downgraded to plaintext.
   */
  parseHost(host) {
    if (typeof host !== 'string') {
      throw new Error('Invalid host: host must be a string');
    }

    let hostname = host.trim();
    let scheme = null;

    if (hostname.startsWith('http://')) {
      scheme = 'http';
      hostname = hostname.slice('http://'.length);
    } else if (hostname.startsWith('https://')) {
      scheme = 'https';
      hostname = hostname.slice('https://'.length);
    }

    // A trailing slash is the one piece of path notation worth tolerating,
    // because the setup wizard's own example used to include it.
    if (hostname.endsWith('/')) {
      hostname = hostname.slice(0, -1);
    }

    if (!isValidHost(hostname)) {
      throw new Error('Invalid host: expected a hostname or IP address without a path, port or credentials');
    }

    // isValidHost() is the real check and is stricter than this: it enforces
    // RFC 1123 label structure or a parseable IP address. The character class is
    // repeated inline because it is the only form static analysis recognises as
    // a barrier on the path from the configured host to the request URL; a call
    // into another module is not followed, so without this the value still
    // reads as attacker-controlled at every axios call below.
    if (!/^[A-Za-z0-9.:[\]-]+$/.test(hostname)) {
      throw new Error('Invalid host: contains characters that are not valid in a hostname or IP address');
    }

    return { hostname, scheme };
  }

  /**
   * Build the axios client used for every Pi-hole web API call.
   *
   * TLS certificates are verified by default. The previous unconditional
   * `rejectUnauthorized: false` meant the Pi-hole admin password was sent over a
   * connection that any on-path attacker could impersonate. Pi-hole installs
   * commonly use a self-signed certificate, so verification can still be waived
   * deliberately -- per connection via `allowInsecureTls`, or globally with
   * ALLOW_INSECURE_TLS=true -- but it is now an explicit choice.
   */
  createApiClient(host, port = 80, useHttps = false, options = {}) {
    const { hostname, scheme } = this.parseHost(host);
    // A scheme written into the host wins over the useHttps flag, which is what
    // the user typed most recently for that field.
    const https_ = scheme ? scheme === 'https' : useHttps === true;
    const defaultPort = https_ ? 443 : 80;
    // A host written as "https://pi.hole" while the port field was left at its
    // default 80 means the user set the scheme and not the port, so follow the
    // scheme rather than emitting https://pi.hole:80, which connects nowhere.
    const effectivePort = scheme && port === 80 ? defaultPort : port;
    const baseURL = `${https_ ? 'https' : 'http'}://${hostname}${effectivePort && effectivePort !== defaultPort ? ':' + effectivePort : ''}`;

    const allowInsecureTls =
      options.allowInsecureTls === true || process.env.ALLOW_INSECURE_TLS === 'true';

    if (allowInsecureTls) {
      this.logger.warn('Pi-hole TLS certificate verification is disabled', {
        baseURL,
        hint: 'Set allowInsecureTls to false once the Pi-hole presents a trusted certificate'
      });
    }

    return axios.create({
      baseURL,
      timeout: 30000,
      // Cap the response so a hostile or misbehaving endpoint cannot exhaust
      // memory through the backup download path.
      maxContentLength: 256 * 1024 * 1024,
      maxBodyLength: 16 * 1024 * 1024,
      // A redirect chain is never needed to reach the Pi-hole API and is a way
      // for a compromised host to point this client somewhere else.
      maxRedirects: 2,
      httpsAgent: new https.Agent({
        rejectUnauthorized: !allowInsecureTls
      }),
      headers: {
        'User-Agent': 'PiHoleVault/1.0'
      }
    });
  }

  async testWebConnection(config) {
    const { host, webPort = 80, useHttps = false } = config;
    
    try {
      const api = this.createApiClient(host, webPort, useHttps, {
        allowInsecureTls: config.allowInsecureTls
      });
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
      const api = this.createApiClient(host, webPort, useHttps, {
        allowInsecureTls: config.allowInsecureTls
      });

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
      // The second positional argument is the port, not a credential. This
      // previously passed connection.webPassword, producing a nonsense base URL
      // on the fallback path.
      const api = authResult.api || this.createApiClient(
        connection.host,
        connection.webPort || 80,
        connection.useHttps === true,
        { allowInsecureTls: connection.allowInsecureTls }
      );
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
          
          // IMPORTANT: Use responseType: 'arraybuffer' to prevent binary data corruption
          // Without this, axios treats the response as UTF-8 text which corrupts zip files
          const requestConfig = {
            responseType: 'arraybuffer'
          };
          
          if (session.method === 'modern-api') {
            // For modern API, send a GET or POST request with session cookies
            backupResponse = await api.get(endpoint, requestConfig);
          } else {
            // For legacy, use GET with token
            backupResponse = await api.get(endpoint, requestConfig);
          }

          this.logger.info('Backup endpoint response', {
            endpoint,
            status: backupResponse.status,
            hasData: !!backupResponse.data,
            dataType: Buffer.isBuffer(backupResponse.data) ? 'Buffer' : 
                      (backupResponse.data instanceof ArrayBuffer ? 'ArrayBuffer' : typeof backupResponse.data),
            dataLength: backupResponse.data ? 
              (Buffer.isBuffer(backupResponse.data) ? backupResponse.data.length :
               (backupResponse.data instanceof ArrayBuffer ? backupResponse.data.byteLength :
               (typeof backupResponse.data === 'string' ? backupResponse.data.length : 
               JSON.stringify(backupResponse.data).length))) : 0,
            contentType: backupResponse.headers?.['content-type']
          });

          // Convert ArrayBuffer to Buffer if needed
          let responseData = backupResponse.data;
          if (responseData instanceof ArrayBuffer || 
              (responseData && responseData.buffer instanceof ArrayBuffer && !(responseData instanceof Buffer))) {
            responseData = Buffer.from(responseData);
          }

          if (backupResponse.status === 200 && responseData) {
            // Check if we got actual backup data
            const isBackupData = this.isValidBackupData(responseData);
            
            this.logger.info('Backup data validation', {
              endpoint,
              isValid: isBackupData,
              dataType: Buffer.isBuffer(responseData) ? 'Buffer' : typeof responseData,
              dataPreview: Buffer.isBuffer(responseData) ? 
                `[Buffer: ${responseData.length} bytes, starts with: ${responseData.slice(0, 4).toString('hex')}]` :
                (typeof responseData === 'string' ? responseData.substring(0, 100) + '...' : `[${typeof responseData}]`)
            });
            
            if (isBackupData) {
              this.logger.info('Backup retrieved successfully', { 
                host: connection.host?.substring(0, 50),
                endpoint,
                dataSize: Buffer.isBuffer(responseData) ? responseData.length : 
                  (typeof responseData === 'string' ? responseData.length : JSON.stringify(responseData).length)
              });
              
              // Save backup data to file
              if (!backupDir) {
                throw new Error('Backup directory not provided');
              }
              
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `pi-hole_backup_${timestamp}.zip`;
              const filePath = path.join(backupDir, filename);
              
              // Write the backup data to file - use the converted responseData (Buffer)
              if (Buffer.isBuffer(responseData)) {
                await fs.writeFile(filePath, responseData);
              } else if (typeof responseData === 'string') {
                // Fallback for string data (shouldn't happen with arraybuffer responseType)
                await fs.writeFile(filePath, responseData, 'binary');
              } else {
                await fs.writeFile(filePath, JSON.stringify(responseData, null, 2));
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

    // For buffer/binary data (preferred - using arraybuffer responseType)
    if (Buffer.isBuffer(data)) {
      // Check minimum size
      if (data.length < 100) {
        this.logger.debug('Buffer too small to be valid backup');
        return false;
      }
      
      // Check for common archive magic numbers
      const zipMagic = data.slice(0, 2).toString('hex') === '504b'; // PK
      const gzipMagic = data.slice(0, 2).toString('hex') === '1f8b';
      const tarMagic = data.slice(257, 262).toString() === 'ustar'; // tar has magic at offset 257
      
      // Check for HTML error page (starts with < character)
      const startsWithHtml = data[0] === 0x3c; // '<' character
      if (startsWithHtml) {
        const preview = data.slice(0, 100).toString('utf-8').toLowerCase();
        if (preview.includes('<!doctype') || preview.includes('<html')) {
          this.logger.debug('Received HTML response instead of backup data');
          return false;
        }
      }
      
      if (zipMagic || gzipMagic || tarMagic) {
        this.logger.debug('Valid archive format detected', { 
          zipMagic, gzipMagic, tarMagic,
          size: data.length 
        });
        return true;
      }
      
      // If no magic number but substantial size, might still be valid
      return data.length > 1000;
    }

    // For string data (legacy fallback)
    if (typeof data === 'string') {
      // Check if it's a compressed file (starts with common archive magic numbers)
      const binaryMarkers = [
        '\x1f\x8b', // gzip
        'PK',        // zip
        'BZ',        // bzip2
        '\x75\x73\x74\x61\x72', // tar
      ];
      
      // If it contains HTML tags, it's probably an error page
      if (data.includes('<!DOCTYPE') || data.includes('<html')) {
        this.logger.debug('Received HTML response instead of backup data');
        return false;
      }
      
      // Check for binary markers or reasonable size
      const hasBinaryMarker = binaryMarkers.some(marker => data.startsWith(marker));
      
      // Valid if it has binary markers or is substantial size
      return hasBinaryMarker || data.length > 1000;
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
