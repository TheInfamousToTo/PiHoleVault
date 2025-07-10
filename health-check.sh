#!/bin/bash

# Health check script for the Pi-hole Backup Manager

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏥 Pi-hole Backup Manager Health Check"
echo "======================================"

# Check if containers are running
echo
echo "📦 Checking Docker containers..."

if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Containers are running${NC}"
else
    echo -e "${RED}❌ Containers are not running${NC}"
    echo "   Try: docker-compose up -d"
    exit 1
fi

# Check frontend health
echo
echo "🌐 Checking frontend (port 3000)..."
if curl -s -f http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✅ Frontend is responding${NC}"
else
    echo -e "${RED}❌ Frontend is not responding${NC}"
fi

# Check backend health
echo
echo "🔧 Checking backend API (port 3001)..."
if curl -s -f http://localhost:3001/health > /dev/null; then
    echo -e "${GREEN}✅ Backend API is responding${NC}"
    
    # Get API health details
    health_response=$(curl -s http://localhost:3001/health)
    echo "   Status: $health_response"
else
    echo -e "${RED}❌ Backend API is not responding${NC}"
fi

# Check data directory
echo
echo "📁 Checking data directory..."
if [ -d "data" ]; then
    echo -e "${GREEN}✅ Data directory exists${NC}"
    
    if [ -f "data/config.json" ]; then
        echo -e "${GREEN}✅ Configuration file exists${NC}"
    else
        echo -e "${YELLOW}⚠️  No configuration file found${NC}"
        echo "   Complete the setup wizard at http://localhost:3000"
    fi
else
    echo -e "${RED}❌ Data directory not found${NC}"
fi

# Check backup directory
echo
echo "💾 Checking backup directory..."
if [ -d "backups" ]; then
    echo -e "${GREEN}✅ Backup directory exists${NC}"
    
    backup_count=$(find backups -name "*.zip" 2>/dev/null | wc -l)
    echo "   Backup files: $backup_count"
else
    echo -e "${RED}❌ Backup directory not found${NC}"
fi

# Check logs
echo
echo "📋 Recent log entries..."
if docker-compose logs --tail=5 backend 2>/dev/null | grep -q "Server running"; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
else
    echo -e "${YELLOW}⚠️  Check backend logs for issues${NC}"
    echo "   Run: docker-compose logs backend"
fi

echo
echo "🎯 Health check complete!"
echo
echo "💡 Useful commands:"
echo "   • View logs: docker-compose logs"
echo "   • Restart: docker-compose restart"
echo "   • Stop: docker-compose down"
echo "   • Update: docker-compose pull && docker-compose up -d"
