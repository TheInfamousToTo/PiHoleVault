#!/bin/bash

# Build and run HoleSafe combined container
# This script combines both frontend and backend into a single Docker image

set -e

echo "🚀 Building HoleSafe Combined Container..."

# Build the combined Docker image
docker build -f Dockerfile.combined -t theinfamoustoto/holesafe-combined:latest .

echo "✅ Build completed successfully!"
echo ""
echo "🐳 Starting HoleSafe Combined Container..."

# Stop and remove existing containers
docker-compose -f docker-compose.combined.yml down --remove-orphans

# Start the new combined container
docker-compose -f docker-compose.combined.yml up -d

echo "✅ HoleSafe is now running on http://localhost:3000"
echo ""
echo "📊 Container status:"
docker-compose -f docker-compose.combined.yml ps

echo ""
echo "📝 To view logs:"
echo "   docker-compose -f docker-compose.combined.yml logs -f"
echo ""
echo "🛑 To stop:"
echo "   docker-compose -f docker-compose.combined.yml down"
