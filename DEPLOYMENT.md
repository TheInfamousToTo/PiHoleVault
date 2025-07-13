# PiHoleVault Combined Container Deployment Guide

This guide explains how to deploy PiHoleVa```bash
docker-compose logs piholevault
``` using the new combined container approach.

## What Changed

PiHoleVault now uses a **single Docker container** instead of separate frontend and backend containers:

- **Before**: 2 containers (frontend + backend)
- **After**: 1 container (combined with nginx reverse proxy)

## Benefits

- ✅ **Simplified deployment** - only one container to manage
- ✅ **Single port** - only port 3000 needs to be exposed
- ✅ **Better performance** - no network overhead between frontend/backend
- ✅ **Easier maintenance** - one image to update instead of two
- ✅ **Reduced resource usage** - lower memory and CPU consumption

## Quick Deployment

### Step 1: Get the latest docker-compose.yml

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/docker-compose.yml
```

### Step 2: Create directories

```bash
mkdir -p data backups
```

### Step 3: Start PiHoleVault

```bash
docker-compose up -d
```

### Step 4: Access the application

Open your browser and go to: **http://localhost:3000**

## Migration from Old Setup

If you're currently using the old two-container setup:

1. **Stop the old containers**:
   ```bash
   docker-compose down
   ```

2. **Update your docker-compose.yml** to use the new format (see above)

3. **Start the new combined container**:
   ```bash
   docker-compose up -d
   ```

Your data and backups will be preserved since the volume mounts remain the same.

## Automatic Updates

The combined container image is automatically built and pushed to Docker Hub whenever changes are made to the repository. To update:

```bash
docker-compose pull
docker-compose up -d
```

## Port Configuration

The combined container uses **port 80 internally** and maps to **port 3000 externally**:

- Frontend: Served by nginx on port 80
- Backend API: Proxied through nginx (internal port 3001)
- External access: http://localhost:3000

## Health Checks

The container includes built-in health checks:

```bash
# Check container health
docker-compose ps

# View health check logs
docker-compose logs holesafe
```

## Troubleshooting

### View logs
```bash
docker-compose logs -f piholevault
```

### Access container shell
```bash
docker-compose exec piholevault sh
```

### Check running processes
```bash
docker-compose exec piholevault supervisorctl status
```

### Manual restart
```bash
docker-compose restart piholevault
```

## Environment Variables

The combined container supports the same environment variables as before:

- `NODE_ENV=production`
- `DATA_DIR=/app/data`
- `BACKUP_DIR=/app/backups`

## Docker Hub

The combined image is available at: **theinfamoustoto/piholevault:latest**

It's automatically built for multiple architectures:
- linux/amd64 (x86_64)
- linux/arm64 (ARM64/Apple Silicon)

## Support

If you encounter any issues with the combined container setup, please create an issue on the GitHub repository with:

1. Your docker-compose.yml file
2. Container logs (`docker-compose logs piholevault`)
3. System information (OS, Docker version)
4. Steps to reproduce the issue
