# HoleSafe Combined Container

This configuration combines both the frontend (React) and backend (Node.js) into a single Docker container using nginx as a reverse proxy.

## Architecture

- **Frontend**: React app served by nginx on port 80
- **Backend**: Node.js API server running on port 3001 (internal)
- **Reverse Proxy**: nginx routes `/api/*` requests to the backend
- **Process Manager**: Supervisor manages both nginx and Node.js processes

## Quick Start

### Option 1: Using the build script (Recommended)
```bash
./build-combined.sh
```

### Option 2: Manual build and run
```bash
# Build the combined image
docker build -f Dockerfile.combined -t theinfamoustoto/holesafe-combined:latest .

# Run using docker-compose
docker-compose -f docker-compose.combined.yml up -d
```

### Option 3: Direct docker run
```bash
docker run -d \
  --name holesafe-combined \
  -p 3000:80 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/backups:/app/backups \
  -e NODE_ENV=production \
  -e DATA_DIR=/app/data \
  -e BACKUP_DIR=/app/backups \
  theinfamoustoto/holesafe-combined:latest
```

## Access

- **Web Interface**: http://localhost:3000
- **API Endpoints**: http://localhost:3000/api/*
- **Health Check**: http://localhost:3000/health

## Benefits of Combined Container

1. **Simplified Deployment**: Single container instead of two
2. **Reduced Resource Usage**: Less memory and CPU overhead
3. **Easier Port Management**: Only one port to expose
4. **Faster Inter-service Communication**: No network overhead between frontend and backend
5. **Simplified Networking**: No need for container-to-container communication

## Files Created

- `Dockerfile.combined` - Multi-stage Dockerfile for combined container
- `nginx.combined.conf` - nginx configuration for reverse proxy
- `supervisord.conf` - Process manager configuration
- `docker-compose.combined.yml` - Simplified docker-compose file
- `build-combined.sh` - Build and run script

## Monitoring

Check container logs:
```bash
docker-compose -f docker-compose.combined.yml logs -f
```

Check individual service logs:
```bash
docker-compose -f docker-compose.combined.yml exec holesafe supervisorctl status
docker-compose -f docker-compose.combined.yml exec holesafe supervisorctl tail -f backend
docker-compose -f docker-compose.combined.yml exec holesafe supervisorctl tail -f nginx
```

## Migration from Separate Containers

If you're migrating from the original two-container setup:

1. Stop the existing containers:
   ```bash
   docker-compose down
   ```

2. Use the new combined setup:
   ```bash
   ./build-combined.sh
   ```

Your data and backups will be preserved as they use the same volume mounts.
