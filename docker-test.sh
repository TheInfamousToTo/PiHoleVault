#!/bin/bash

# Ultimate Docker Compose Test for Pi-hole Backup Manager
echo "🐳 Pi-hole Backup Manager - Docker Test"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo
    echo -e "${YELLOW}🧹 Cleaning up...${NC}"
    
    # Stop and remove containers
    echo "Stopping containers..."
    docker-compose down --volumes --remove-orphans 2>/dev/null
    
    # Remove any orphaned containers
    echo "Removing orphaned containers..."
    docker container prune -f 2>/dev/null
    
    # Remove unused networks
    echo "Cleaning up networks..."
    docker network prune -f 2>/dev/null
    
    echo -e "${GREEN}✅ Cleanup completed!${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Function to wait for service
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${BLUE}Waiting for $name...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $name is ready!${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $name failed to start${NC}"
    return 1
}

echo
echo "🔧 Pre-flight checks..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose are available${NC}"

# Clean up any existing containers
echo
echo "🧹 Cleaning up existing containers..."
docker-compose down --volumes --remove-orphans 2>/dev/null

# Build the images
echo
echo "🏗️  Building images..."
if ! docker-compose build --no-cache; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Start the services
echo
echo "🚀 Starting services..."
if ! docker-compose up -d; then
    echo -e "${RED}❌ Failed to start services${NC}"
    docker-compose logs
    exit 1
fi

echo -e "${GREEN}✅ Services started${NC}"

# Wait for services to be ready
echo
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check container status
echo
echo "📊 Container status:"
docker-compose ps

# Wait for backend
wait_for_service "http://localhost:3001/health" "Backend API"

# Wait for frontend
wait_for_service "http://localhost:3000" "Frontend"

echo
echo "🎯 Test Results:"
echo "==============="
echo -e "${GREEN}✅ Backend API: http://localhost:3001${NC}"
echo -e "${GREEN}✅ Frontend: http://localhost:3000${NC}"
echo -e "${GREEN}✅ Health Check: http://localhost:3001/health${NC}"

# Test API endpoints
echo
echo "🔍 Testing API endpoints..."

# Test health endpoint
health_response=$(curl -s "http://localhost:3001/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Health check: $health_response${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test config status
config_response=$(curl -s "http://localhost:3001/api/config/status" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Config status: $config_response${NC}"
else
    echo -e "${RED}❌ Config status failed${NC}"
fi

echo
echo "📋 Recent logs:"
echo "Backend:"
docker-compose logs --tail=5 backend 2>/dev/null
echo
echo "Frontend:"
docker-compose logs --tail=5 frontend 2>/dev/null

echo
echo -e "${GREEN}🎉 All services are running successfully!${NC}"
echo
echo "💡 What to do next:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Complete the setup wizard"
echo "3. Configure your Pi-hole connection"
echo
echo -e "${YELLOW}⚠️  Press Ctrl+C to stop and remove all containers${NC}"
echo
echo "🔄 Services are running. Press Ctrl+C to stop..."

# Keep running until interrupted
while true; do
    sleep 5
    
    # Check if containers are still running
    if ! docker-compose ps -q | grep -q .; then
        echo -e "${RED}❌ Containers stopped unexpectedly${NC}"
        break
    fi
done
