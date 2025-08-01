#!/bin/bash

# PiHoleVault Multi-Architecture Build Script
# Builds and pushes Docker images for AMD64, ARM64, and ARMv7

set -e

# Read version from file
VERSION=$(cat version | tr -d '\n' | sed 's/^v//')
DOCKER_USER="theinfamoustoto"
IMAGE_NAME="piholevault"
PLATFORMS="linux/amd64,linux/arm64,linux/arm/v7"

echo "🚀 PiHoleVault Multi-Architecture Build Script"
echo "=============================================="
echo "📦 Version: $VERSION"
echo "🏗️  Platforms: $PLATFORMS"
echo ""

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "🏗️  LOCAL DEVELOPMENT COMMANDS:"
    echo "  setup       Setup Docker Buildx for multi-architecture builds"
    echo "  build       Build multi-arch images locally (for testing)"
    echo "  test        Test images on all platforms"
    echo "  status      Show buildx status and available platforms"
    echo "  clean       Clean up buildx builders and cache"
    echo ""
    echo "⚠️  PRODUCTION DEPLOYMENT:"
    echo "  push        Manual push (NOT RECOMMENDED - use Git instead)"
    echo ""
    echo "📝 RECOMMENDED WORKFLOW:"
    echo "  1. Make your changes"
    echo "  2. Run './build-multiarch.sh build' to test locally"
    echo "  3. Push to Git: 'git push origin main'"
    echo "  4. GitHub Actions will automatically build and push multi-arch images"
    echo ""
    echo "Examples:"
    echo "  $0 setup                    # Setup buildx (run this first)"
    echo "  $0 build                    # Build for local testing"
    echo "  $0 test                     # Test built images"
    echo "  git push origin main        # Deploy via GitHub Actions"
    echo ""
}

# Check if Docker Buildx is available
check_buildx() {
    if ! docker buildx version >/dev/null 2>&1; then
        echo "❌ Docker Buildx is not available. Please upgrade Docker to a version that supports Buildx."
        exit 1
    fi
    echo "✅ Docker Buildx is available"
}

# Setup Docker Buildx for multi-platform builds
setup_buildx() {
    echo "🔧 Setting up Docker Buildx for multi-platform builds..."
    
    # Create a new builder instance if it doesn't exist
    if ! docker buildx ls | grep -q "piholevault-builder"; then
        echo "📦 Creating new buildx builder: piholevault-builder"
        docker buildx create --name piholevault-builder --driver docker-container --bootstrap
    else
        echo "✅ Builder 'piholevault-builder' already exists"
    fi
    
    # Use the builder
    docker buildx use piholevault-builder
    
    # Inspect the builder to show available platforms
    echo "🔍 Available platforms:"
    docker buildx inspect --bootstrap
    
    echo "✅ Buildx setup complete!"
}

# Build images for multiple architectures
build_images() {
    local push_flag=""
    if [[ "$1" == "--push" ]]; then
        push_flag="--push"
        echo "🚀 Building and pushing multi-arch images..."
    else
        push_flag="--load"
        echo "🔨 Building multi-arch images locally..."
    fi
    
    docker buildx build \
        --platform $PLATFORMS \
        --tag $DOCKER_USER/$IMAGE_NAME:$VERSION \
        --tag $DOCKER_USER/$IMAGE_NAME:latest \
        $push_flag \
        .
    
    if [[ "$1" == "--push" ]]; then
        echo "✅ Images built and pushed successfully!"
    else
        echo "✅ Images built successfully!"
    fi
}

# Test images on all platforms
test_images() {
    echo "🧪 Testing images on all platforms..."
    
    for platform in "linux/amd64" "linux/arm64" "linux/arm/v7"; do
        echo "Testing $platform..."
        if docker run --rm --platform=$platform $DOCKER_USER/$IMAGE_NAME:latest echo "✅ $platform works"; then
            echo "✅ $platform test passed"
        else
            echo "❌ $platform test failed"
        fi
    done
}

# Show buildx status
show_status() {
    echo "📊 Docker Buildx Status:"
    echo "========================"
    
    echo "🏗️  Available builders:"
    docker buildx ls
    
    echo ""
    echo "🌍 Current builder details:"
    docker buildx inspect
    
    echo ""
    echo "💾 Build cache usage:"
    docker buildx du || echo "No cache data available"
}

# Clean up buildx resources
clean_buildx() {
    echo "🧹 Cleaning up buildx resources..."
    
    read -p "⚠️  This will remove the buildx builder and cache. Continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove the builder
        if docker buildx ls | grep -q "piholevault-builder"; then
            docker buildx rm piholevault-builder
            echo "✅ Removed builder 'piholevault-builder'"
        fi
        
        # Prune build cache
        docker buildx prune -f
        echo "✅ Cleaned build cache"
        
        echo "✅ Cleanup completed!"
    else
        echo "❌ Cleanup cancelled."
    fi
}

# Main command handling
case "${1:-help}" in
    "setup")
        check_buildx
        setup_buildx
        ;;
    
    "build")
        check_buildx
        build_images
        ;;
    
    "push")
        echo "⚠️  WARNING: Manual push is not recommended!"
        echo "� The recommended workflow is:"
        echo "   1. Push your changes to Git"
        echo "   2. GitHub Actions will automatically build and push multi-arch images"
        echo ""
        echo "🔗 GitHub Actions workflow: .github/workflows/docker-build.yml"
        echo ""
        read -p "Continue with manual push anyway? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            check_buildx
            echo "🔐 Make sure you're logged in to Docker Hub (docker login)"
            build_images --push
        else
            echo "❌ Push cancelled. Use 'git push' instead for automatic CI/CD."
        fi
        ;;
    
    "test")
        test_images
        ;;
    
    "status")
        check_buildx
        show_status
        ;;
    
    "clean")
        clean_buildx
        ;;
    
    "help"|*)
        show_usage
        ;;
esac
