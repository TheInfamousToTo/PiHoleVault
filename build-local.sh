#!/bin/bash

# HoleSafe Local Build Script
# This script helps you build and run HoleSafe locally

set -e

echo "🚀 HoleSafe Local Build & Deploy Script"
echo "======================================="

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  build       Build the Docker image locally"
    echo "  up          Start the services (builds if needed)"
    echo "  down        Stop and remove containers"
    echo "  logs        Show container logs"
    echo "  rebuild     Force rebuild and restart"
    echo "  dev         Use development configuration"
    echo "  clean       Remove all containers, images, and volumes"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 build                    # Build the image"
    echo "  $0 up                       # Start services"
    echo "  $0 dev up                   # Start with dev config"
    echo "  $0 rebuild                  # Force rebuild and restart"
    echo "  $0 logs                     # View logs"
    echo ""
}

# Set compose file based on arguments
COMPOSE_FILE="docker-compose.local.yml"
if [[ "$1" == "dev" ]]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    shift
fi

# Main command handling
case "${1:-help}" in
    "build")
        echo "🔨 Building HoleSafe image locally..."
        docker-compose -f $COMPOSE_FILE build --no-cache
        echo "✅ Build completed!"
        ;;
    
    "up")
        echo "🚀 Starting HoleSafe services..."
        docker-compose -f $COMPOSE_FILE up -d --build
        echo "✅ Services started!"
        echo "🌐 Access HoleSafe at: http://localhost:3000"
        echo "📋 To view logs: $0 logs"
        ;;
    
    "down")
        echo "🛑 Stopping HoleSafe services..."
        docker-compose -f $COMPOSE_FILE down
        echo "✅ Services stopped!"
        ;;
    
    "logs")
        echo "📋 Showing HoleSafe logs (Ctrl+C to exit)..."
        docker-compose -f $COMPOSE_FILE logs -f
        ;;
    
    "rebuild")
        echo "🔄 Rebuilding and restarting HoleSafe..."
        docker-compose -f $COMPOSE_FILE down
        docker-compose -f $COMPOSE_FILE build --no-cache
        docker-compose -f $COMPOSE_FILE up -d
        echo "✅ Rebuild completed!"
        echo "🌐 Access HoleSafe at: http://localhost:3000"
        ;;
    
    "clean")
        echo "🧹 Cleaning up all HoleSafe containers, images, and volumes..."
        read -p "⚠️  This will remove ALL HoleSafe data. Continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f $COMPOSE_FILE down -v --rmi all
            docker system prune -f
            echo "✅ Cleanup completed!"
        else
            echo "❌ Cleanup cancelled."
        fi
        ;;
    
    "status")
        echo "📊 HoleSafe container status:"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    
    "shell")
        echo "🐚 Opening shell in HoleSafe container..."
        docker-compose -f $COMPOSE_FILE exec holesafe sh
        ;;
    
    "help"|*)
        show_usage
        ;;
esac
