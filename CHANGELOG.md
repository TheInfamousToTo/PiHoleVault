# Changelog

All notable changes to PiHoleVault will be documented in this file.

## [Unreleased]

### 🔒 Security

- **Dependency advisories published after 2.0.0 are fixed.** `axios` 1.20.0 (12 advisories, high), `proxy-addr` 2.0.8 (IP spoofing through IPv4-mapped IPv6 trust subnets, critical; Express uses it to resolve the client IP that rate limiting keys on), `ip-address` 10.7.3 (moderate) and, in the frontend build toolchain, `source-map-js`. `npm audit --omit=dev` reports 0 vulnerabilities in both packages. The one remaining dev-only advisory (`braces`, through `nodemon`) has no fixed release and never ships in the image.

---

## [2.0.0] - 2026-10-07

### ⚠️ Upgrading from 1.x

2.0.0 changes several defaults so that PiHoleVault is secure out of the box. Most installs upgrade without touching anything, but check these first:

- **HTTPS Pi-holes with a self-signed certificate will fail to connect.** TLS certificates are now verified, and Pi-hole v6 serves a self-signed certificate by default. Turn on *Allow self-signed certificate* in Settings, set `ALLOW_INSECURE_TLS=true`, or give the Pi-hole a trusted certificate.
- **Pi-hole v6 is required for the web method.** v5 is end-of-life; its API never worked for backups here anyway.
- **The SSH user must be able to read Pi-hole's config**: be `root`, be in the `pihole` group, or have password-less `sudo pihole-FTL`. The connection test now checks this.
- **SSH host keys are pinned on first contact** (`SSH_HOST_KEY_POLICY=tofu`). If the Pi-hole is later rebuilt or its key changes, backups are refused until you remove its entry from `data/known_hosts.json`.
- **Legacy SSH algorithms** (`ssh-rsa`, `ssh-dss`, `hmac-sha1`) are off. Only very old OpenSSH servers need `SSH_ALLOW_LEGACY_ALGORITHMS=true`.
- **The API no longer sends `Access-Control-Allow-Origin: *`.** The bundled UI is unaffected. Only set `CORS_ALLOWED_ORIGINS` if you call the API from another origin.
- **Recommended:** set `AUTH_TOKEN` (`openssl rand -hex 32`). Without it the API stays open, and the server logs a warning at startup.

See `.env.example` for every option.

### 🔌 Pi-hole v6 compatibility

Tested end to end against a real Pi-hole on the current release (FTL v6.7.1, Web v6.6, Core v6.4.3), including a Pi-hole with no password, one with 2FA, and HTTPS with the default self-signed certificate.

- **Backups no longer lock you out of Pi-hole.** Every run opened an API session and never closed it. Pi-hole allows 16 and keeps each for 30 minutes (and restores them after a restart), so after a handful of runs both backups *and the Pi-hole's own web login* failed with "API seats exceeded". PiHoleVault now logs out after every request; 40 consecutive backups were tested.
- **Hybrid actually works.** The hybrid connection test and hybrid backup called functions that were never written, so hybrid failed outright. It now uses the web API first and falls back to SSH automatically, and the test checks both halves.
- **A wrong password fails the connection test** instead of passing it and failing at the first backup. Errors now say what happened: wrong password, 2FA needs an app password, untrusted certificate, nothing listening, HTTPS on an HTTP port, out of API sessions, rate-limited.
- **The admin URL the wizard asks for is accepted.** `https://pi.hole:8443/admin/` was rejected by the backend and could not be saved; it is now split into host, port and HTTPS on save.
- **Two-factor authentication is supported** through Pi-hole app passwords.
- **SSH backups work on v6.** The archive name is read from the last line of `pihole-FTL --teleporter` output (FTL prints log lines before it), a non-root user falls back to `sudo -n`, and the remote archive is cleaned up.
- **Session auth uses the `X-FTL-SID` header**, which needs no CSRF token, and only a real zip archive is accepted as a backup.
- `POST /api/backup` with a `connectionId` now runs the same backup path as scheduled backups; it only ever handled the web method, without writing the archive.

### 🎨 Interface

- **New logo.** An original vault-door mark replaces the raspberry, which leaned on the Raspberry Pi and Pi-hole marks. It ships as SVG with a simplified favicon variant for small sizes, plus PNG and Apple touch icons.
- **Allow self-signed certificate** switch in the wizard and in Settings, and Settings can now edit the connection method, web port and HTTPS.

- **A new look with motion throughout.** The ground is deep slate with a slow ambient glow behind translucent glass surfaces, and a single blue-to-cyan accent marks what you can act on and what is live. Panels rise in on load, numbers count up, the retention ring draws itself in, cards pick up a pointer-following highlight, deleted backups animate out, and wizard steps slide in the direction you are moving. Motion follows the OS reduced-motion setting.
- **The dashboard opens with an answer.** A health headline reads "protected", "getting stale", "last backup failed" or "in progress", next to a ring showing how many of your retained restore points are used. Below it are stat tiles, a storage meter with slots left before rotation, and an activity timeline.
- **Deleting a backup asks for confirmation.** It used to be a single click.
- **The header turns to frosted glass on scroll** and shows a Run backup button, so the main action stays in reach.
- **The setup wizard was rebuilt:** an animated progress rail, cards for choosing the connection method, clickable cron presets with a plain-English preview ("Daily at 03:00"), and a retention preview.
- **Support links are grouped** into one Support menu instead of five unlabelled icons.
- **Inter and JetBrains Mono are bundled with the app** rather than fetched from a CDN. The CSP allows fonts from this origin only, and a Pi-hole often has no route to the internet. Machine values (addresses, ports, cron expressions, paths, sizes) are set in the monospace face.
- **The community stats panel renders nothing when its service is unreachable**, instead of announcing its own absence.

### 🐛 Bug Fixes

- **Failed scheduled backups showed as successful.** Jobs logged as `success`/`error` were not recognised, so an error rendered as a green tick. Both naming schemes now map to completed/failed.
- **Downloads keep the backup's real filename.** They used to save as `backup-<name>.zip.tar.gz`.
- **The schedule "enabled" control had no label.** It is now a labelled switch.
- **The connection test no longer blames the backend** for an unreachable Pi-hole.

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
- Added `framer-motion` for animation; shared motion primitives live in `frontend/src/components/ui.jsx` and cron descriptions in `frontend/src/utils/cron.js`.
- `package.json` versions brought back in line with the `version` file (they had stayed at 1.6.0).
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
