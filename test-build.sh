#!/bin/bash

# Quick build and test script for HoleSafe
echo "🔨 Building and testing HoleSafe Docker image..."

# Build the image
echo "📦 Building Docker image..."
if docker build -t holesafe-test .; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

# Test the image
echo "🧪 Testing the image..."
docker run --rm --name holesafe-test-container -d holesafe-test

# Wait a moment for startup
sleep 10

# Check if nginx is running
echo "🔍 Checking nginx status..."
if docker exec holesafe-test-container pgrep nginx > /dev/null; then
    echo "✅ Nginx is running!"
else
    echo "❌ Nginx is not running!"
    echo "📋 Container logs:"
    docker logs holesafe-test-container
fi

# Check if backend is running
echo "🔍 Checking backend status..."
if docker exec holesafe-test-container pgrep node > /dev/null; then
    echo "✅ Backend is running!"
else
    echo "❌ Backend is not running!"
fi

# Test health endpoint
echo "🏥 Testing health endpoint..."
if docker exec holesafe-test-container curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Health endpoint is responding!"
else
    echo "❌ Health endpoint is not responding!"
fi

# Cleanup
echo "🧹 Cleaning up test container..."
docker stop holesafe-test-container > /dev/null 2>&1

echo "🎉 Test completed!"
