# Changelog

All notable changes to PiHoleVault will be documented in this file.

## [Unreleased]

### 🎨 Interface

- **Reskinned around a single accent.** The dashboard opened with a full-width gradient banner and four stat cards each tinted a different hue, none of which carried meaning. The palette is now a blue-slate ground with one accent: blue marks what you can act on and what is live, and the state colours only ever report state.
- **The four readings sit in one panel divided by hairlines** rather than four separate cards, so they read as one instrument. The banner is gone, so the page opens with the numbers that answer "am I backed up".
- **Inter and JetBrains Mono are now bundled with the app.** The theme previously asked for Inter without ever loading it, so the interface had been falling back to the system font. Machine values -- addresses, ports, cron expressions, paths, filenames, sizes -- are set in the monospace face, so columns line up. Neither font is fetched from a CDN: the Content-Security-Policy allows fonts from this origin only, and a Pi-hole often has no route to the internet.
- **The community stats panel renders nothing when its service is unreachable**, instead of a full-width slab announcing its own absence.
- Theme moved out of `App.jsx` into `frontend/src/theme.js`.

No functional change: same components, props, handlers, API calls, routes and validation.


### 🔒 Security

- **Optional API authentication**: setting `AUTH_TOKEN` now requires a bearer token on every `/api` request. The UI prompts for it and stores it in the browser. Without it the API stays open, and the server logs a warning at startup.
- **SSH host key verification**: SSH connections now verify the Pi-hole's host key. The default `tofu` policy pins the key on first connection and refuses it if it later changes; `SSH_HOST_KEY_POLICY=strict` requires a pre-pinned host, and `insecure` restores the old behaviour. Pins live in `data/known_hosts.json`. The Docker images no longer write `StrictHostKeyChecking no`.
- **TLS verification for the Pi-hole web API**: certificates are verified by default instead of unconditionally accepted. Self-signed setups can waive it per connection or with `ALLOW_INSECURE_TLS=true`.
- **CORS closed by default**: the API no longer sends `Access-Control-Allow-Origin: *`. Cross-origin access is opt-in through `CORS_ALLOWED_ORIGINS`.
- **Rate limiting**: 600 requests per 15 minutes per IP across `/api`, and 30 for the endpoints that open outbound connections (`RATE_LIMIT_MAX`, `RATE_LIMIT_SENSITIVE_MAX`).
- **Secrets redacted in API responses**: `GET /api/config` returns `***REDACTED***` for credential fields, and saving that placeholder back keeps the stored value. The debug endpoint reports an allowlist of environment variables and only whether the credential-bearing ones are set.
- **Input validation**: hosts, usernames, ports and backup filenames are validated at both the config-save and connection paths; download paths are resolved inside the backup directory.
- **Security headers**: nginx sends CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`, hides its version, and marks API responses `no-store`. Helmet covers the API. No web fonts are loaded from third-party origins.
- **Dependency updates**: the frontend moved from `react-scripts` to Vite and `react-router-dom` to 7.x, and the backend pins `qs`, `uuid`, `tar`, `semver`, `brace-expansion`, `path-to-regexp` and `picomatch` through npm overrides. `npm audit` reports 0 vulnerabilities in both packages.

### 🔧 Technical Changes

- Frontend build switched from Create React App to Vite; `.js` component files renamed to `.jsx`.
- New `backend/middleware/auth.js`, `backend/utils/validate.js` and `backend/utils/sshSecurity.js`.

---

## [1.7.2] - 2025-12-12

### 🐛 Bug Fixes

- **Fixed corrupted backup files**: Resolved critical issue where Pi-hole backup files were being corrupted during download. The axios HTTP client was treating binary data as UTF-8 text, causing ~40% of bytes to be replaced with invalid characters (0xFD). Fixed by adding `responseType: 'arraybuffer'` to properly handle binary data streams.

- **Improved backup validation**: Enhanced `isValidBackupData()` function to properly validate Buffer data by checking for valid archive magic numbers (ZIP, GZIP, TAR).

### 🔧 Technical Changes

- Updated `PiHoleWebService.js` to use `arraybuffer` response type for backup downloads
- Proper ArrayBuffer to Buffer conversion for file writing
- Improved npm install output visibility in Dockerfile for better build debugging

---

## [1.6.0] - 2025-08-03

### 🐛 Comprehensive Debug Features

#### ✨ New Features

- **Debug Mode Environment Control**:
  - `DEBUG_MODE` environment variable for easy enable/disable
  - `LOG_LEVEL` and `DEBUG_LEVEL` for granular logging control
  - Debug configuration in docker-compose.yml and docker-compose.local.yml

- **Enhanced Logging System**:
  - Structured Winston-based logging with JSON format
  - Separate debug log files in `/app/data/debug/`
  - Automatic log rotation with size limits and retention policies
  - Full error stack traces and request context in debug mode

- **Debug API Endpoints** (9 new endpoints when DEBUG_MODE=true):
  - `/api/debug/status` - Debug status and basic information
  - `/api/debug/system-info` - Comprehensive system diagnostics
  - `/api/debug/health-check` - Detailed component health checks
  - `/api/debug/logs` - Retrieve and filter log entries
  - `/api/debug/test-ssh` - SSH connectivity testing with detailed diagnostics
  - `/api/debug/report` - Generate comprehensive debug reports
  - `/api/debug/files` - List and download debug files
  - `/api/debug/environment` - Environment variables and configuration
  - `/api/debug/log-analysis` - Analyze logs for patterns and issues

- **Debug Tools & Scripts**:
  - `debug.sh` - Comprehensive debug management script with 10+ commands
  - `verify-debug.sh` - Automated testing of all debug features
  - Enhanced error handling with unique error IDs for tracking

- **System Diagnostics**:
  - Hardware information collection (CPU, memory, disk)
  - Environment analysis with sensitive data sanitization
  - Directory structure and permissions analysis
  - Multi-step SSH connectivity testing with detailed failure analysis

- **Log Analysis & Reporting**:
  - Automatic pattern detection for common errors
  - Error frequency analysis and categorization
  - Comprehensive debug reports with system snapshots
  - Debug file management with automatic cleanup

#### 🔧 Technical Improvements

- **DebugService**: New comprehensive debugging service class
- **Enhanced Error Middleware**: Detailed error tracking with context
- **Request/Response Logging**: Performance monitoring with response times
- **Security Features**: Automatic sanitization of sensitive data in logs
- **Path Traversal Protection**: Secure debug file access restrictions

#### 📚 Documentation

- **DEBUG.md**: Comprehensive debug documentation with usage examples
- **Updated README.md**: Debug features section with quick start guide
- **Enhanced .env.example**: Detailed debug configuration examples

## [1.2.0] - 2025-07-11

### 🎨 Major UI/UX Overhaul

#### ✨ New Features

- **Advanced Animation System**: Comprehensive Material-UI animation framework
  - Staggered Grow animations for stats cards with custom timing delays
  - Slide, Zoom, and Fade transitions for hero section elements
  - Shimmer effects and gradient backgrounds for premium visual experience
  - Enhanced hover states with transform animations and glassmorphism effects

- **Icon-Only AppBar Redesign**:
  - Clean, minimalist design with color-coded icon buttons
  - Enhanced tooltips for improved user guidance
  - Glassmorphism effects with backdrop blur and enhanced shadows
  - Settings dropdown menu with integrated Reconfigure option
  - Proper z-index layering for notification compatibility

- **Local Build Environment**:
  - Complete Docker Compose setup for local development
  - `build-local.sh` helper script with comprehensive command set
  - Separate development (`docker-compose.dev.yml`) and production (`docker-compose.local.yml`) configurations
  - Complete setup documentation in `LOCAL_BUILD_GUIDE.md`

#### 🎪 UI/UX Improvements

- **Enhanced Component Architecture**: React.memo optimization for better performance
- **Responsive Animations**: Staggered mounting animations with proper timing
- **Glassmorphism Design**: Modern backdrop blur effects and gradient overlays
- **Improved Notification System**: Better positioning to avoid covering AppBar elements
- **Visual Polish**: Enhanced shadows, borders, gradients, and color schemes

#### 🛠️ Development Features

- **Helper Script Commands**:
  - `./build-local.sh up` - Build and start services
  - `./build-local.sh dev up` - Start with development configuration
  - `./build-local.sh rebuild` - Force rebuild and restart
  - `./build-local.sh logs` - View container logs
  - `./build-local.sh clean` - Complete cleanup
  - `./build-local.sh status` - Container status monitoring
  - `./build-local.sh shell` - Access container shell

#### � Technical Improvements

- **Component Optimization**: Enhanced prop handling and children pattern for EnhancedIconButton
- **Animation Framework**: Comprehensive Material-UI animation integration
- **Build System**: Improved Docker build process with better layer caching
- **State Management**: Better handling of UI states and animation triggers

#### 🐛 Bug Fixes

- Fixed duplicate `ListItemIcon` import causing build failures
- Corrected notification positioning to prevent AppBar coverage
- Enhanced icon visibility with proper color prop handling
- Improved component prop forwarding for custom styling

#### 📁 File Structure Updates

- Added `docker-compose.local.yml` for local production builds
- Added `docker-compose.dev.yml` for development with debugging options
- Added `build-local.sh` executable helper script
- Added `LOCAL_BUILD_GUIDE.md` comprehensive documentation
- Removed unnecessary debug files and outdated documentation

### 🔄 Migration Notes

- No breaking changes for existing deployments
- New local build options are additive features
- All existing Docker Hub images remain compatible
- Configuration format unchanged
