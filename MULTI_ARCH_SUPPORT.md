# Multi-Architecture Support Implementation

## Overview
PiHoleVault now supports multi-architecture Docker builds for AMD64, ARM64, and ARMv7 platforms, enabling deployment on a wide range of devices including Raspberry Pi, Intel/AMD servers, and Apple Silicon Macs.

## Changes Made

### 1. Updated GitHub Actions Workflow (`.github/workflows/docker-build.yml`)
- ✅ Added multi-platform build support: `linux/amd64,linux/arm64,linux/arm/v7`
- ✅ Added build cache optimization with GitHub Actions cache
- ✅ Maintained automatic builds on push to main branch
- ✅ Maintained automatic builds on version tags

### 2. Enhanced Dockerfile
- ✅ Added build arguments for cross-platform builds (`BUILDPLATFORM`, `TARGETPLATFORM`)
- ✅ Added proper OCI image labels for better metadata
- ✅ Used `--platform=$BUILDPLATFORM` for frontend build stage to optimize cross-compilation
- ✅ Maintained compatibility with existing deployment methods

### 3. Created Multi-Architecture Build Script (`build-multiarch.sh`)
- ✅ Local development and testing tool
- ✅ Docker Buildx setup and management
- ✅ Multi-platform image building and testing
- ✅ Clear guidance on recommended CI/CD workflow
- ✅ Warning against manual production pushes

### 4. Updated Documentation
- ✅ Added multi-architecture information to README.md
- ✅ Documented supported platforms (AMD64, ARM64, ARMv7)
- ✅ Explained automatic platform detection by Docker

### 5. Deprecated Legacy Scripts
- ✅ Updated `publish.sh` with deprecation warning
- ✅ Redirected users to proper CI/CD workflow

## Supported Platforms

| Platform | Architecture | Examples |
|----------|-------------|----------|
| `linux/amd64` | x86_64 | Intel/AMD servers, most PCs |
| `linux/arm64` | aarch64 | Raspberry Pi 4+, Apple Silicon, AWS Graviton |
| `linux/arm/v7` | armv7l | Raspberry Pi 3, older ARM devices |

## Recommended Workflow

### For Production Deployment
1. Make changes to the code
2. Test locally: `./build-multiarch.sh build`
3. Push to Git: `git push origin main`
4. GitHub Actions automatically builds and pushes multi-arch images

### For Local Development
1. Setup: `./build-multiarch.sh setup`
2. Build: `./build-multiarch.sh build`
3. Test: `./build-multiarch.sh test`

## Benefits

- **🌍 Universal Compatibility**: Single image tag works on all supported platforms
- **⚡ Automatic Selection**: Docker automatically pulls the correct architecture
- **🔄 CI/CD Integration**: Automated builds via GitHub Actions
- **🧪 Local Testing**: Easy multi-platform testing for developers
- **📦 Single Deployment**: Same docker-compose.yml works everywhere

## Verification

To verify multi-architecture support:

```bash
# Check available platforms for the image
docker buildx imagetools inspect theinfamoustoto/piholevault:latest

# Test on specific platform
docker run --rm --platform=linux/arm64 theinfamoustoto/piholevault:latest echo "ARM64 works"
```

## Migration Notes

- **No breaking changes**: Existing deployments continue to work
- **Automatic updates**: Next deployment will pull the correct architecture
- **Performance**: ARM devices will now use native ARM images instead of emulation
