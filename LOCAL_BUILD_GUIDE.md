# HoleSafe Local Build Setup

This guide explains how to build and run HoleSafe locally instead of pulling from Docker Hub.

## Files Overview

- `docker-compose.local.yml` - Production-like local build
- `docker-compose.dev.yml` - Development configuration with debugging options
- `build-local.sh` - Helper script for easy management

## Quick Start

### Option 1: Using the Helper Script (Recommended)

```bash
# Make the script executable (if not already)
chmod +x build-local.sh

# Build and start HoleSafe
./build-local.sh up

# Access HoleSafe at http://localhost:3000
```

### Option 2: Direct Docker Compose Commands

```bash
# Build and start with production config
docker-compose -f docker-compose.local.yml up -d --build

# Or for development
docker-compose -f docker-compose.dev.yml up -d --build
```

## Available Commands

### Using the Helper Script

```bash
# Production builds
./build-local.sh build          # Build image only
./build-local.sh up             # Build and start services
./build-local.sh down           # Stop services
./build-local.sh logs           # View logs
./build-local.sh rebuild        # Force rebuild and restart
./build-local.sh status         # Show container status
./build-local.sh shell          # Open shell in container

# Development builds
./build-local.sh dev up         # Start with dev config
./build-local.sh dev build      # Build with dev config
./build-local.sh dev logs       # View dev logs

# Cleanup
./build-local.sh clean          # Remove all containers and images
```

### Direct Docker Compose Commands

```bash
# Production configuration
docker-compose -f docker-compose.local.yml build
docker-compose -f docker-compose.local.yml up -d
docker-compose -f docker-compose.local.yml down
docker-compose -f docker-compose.local.yml logs -f

# Development configuration
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml logs -f
```

## Configuration Differences

### docker-compose.local.yml

- Builds image from local Dockerfile
- Production-optimized
- Container name: `holesafe-local`

### docker-compose.dev.yml

- Same as local but with development options
- Commented sections for source code mounting
- Debugging options available
- Container name: `holesafe-dev`

## Build Process

The local build process:

1. **Frontend Build Stage**: Builds React frontend using Node.js 18 Alpine
2. **Main Stage**:
   - Installs system dependencies (openssh, nginx, supervisor)
   - Copies backend code and installs dependencies
   - Copies built frontend to nginx directory
   - Sets up SSH configuration
   - Configures permissions

## Volumes and Data

- `./data` → `/app/data` (Application data)
- `./backups` → `/app/backups` (Backup files)
- `ssh_keys` → `/root/.ssh` (SSH keys, persistent volume)

## Ports

- Host port `3000` → Container port `80`
- Access via: <http://localhost:3000>

## Troubleshooting

### Build Issues

```bash
# Clean build (removes cache)
./build-local.sh rebuild

# Check build logs
docker-compose -f docker-compose.local.yml build --no-cache --progress=plain

# Clean everything and start fresh
./build-local.sh clean
./build-local.sh up
```

### Runtime Issues

```bash
# Check container logs
./build-local.sh logs

# Check container status
./build-local.sh status

# Access container shell
./build-local.sh shell
```

### Permission Issues

```bash
# Fix data directory permissions
sudo chown -R $USER:$USER ./data ./backups

# Check container permissions
./build-local.sh shell
ls -la /app/
```

## Development Tips

1. **Fast Development**: Use `docker-compose.dev.yml` for development
2. **Source Code Changes**: Uncomment volume mounts in dev config for live reloading
3. **Debugging**: Enable `stdin_open` and `tty` in dev config for interactive debugging
4. **Logs**: Use `./build-local.sh logs` to monitor real-time logs

## Performance Notes

- Initial build may take 5-10 minutes depending on system
- Subsequent builds are faster due to Docker layer caching
- Use `--no-cache` flag for clean builds when needed

## Security Considerations

- SSH keys are generated automatically during build
- Use proper firewall rules for production deployments
- Consider using Docker secrets for sensitive configuration in production
