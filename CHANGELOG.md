# Changelog

All notable changes to PiHoleVault will be documented in this file.

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
