# Changelog

All notable changes to PiHoleVault will be documented in this file.

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
