#!/bin/bash

# PiHoleVault Local Build Script
# This script helps you build and run PiHoleVault locally

set -e

# Discord webhook URL for notifications
export DISCORD_WEBHOOK_URL=""

echo "🚀 PiHoleVault Local Build & Deploy Script"
echo "======================================="
echo "🔔 Discord notifications enabled"

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
    echo "  status      Show container status"
    echo "  shell       Open shell in container"
    echo "  discord     Show Discord webhook status"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 build                    # Build the image"
    echo "  $0 up                       # Start services"
    echo "  $0 dev up                   # Start with dev config"
    echo "  $0 rebuild                  # Force rebuild and restart"
    echo "  $0 logs                     # View logs"
    echo "  $0 status                   # Check container status"
    echo "  $0 discord                  # Check Discord webhook status"
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
        echo "🔨 Building PiHoleVault image locally..."
        
        # Check if buildx is available for better multi-platform support
        if docker buildx version >/dev/null 2>&1; then
            echo "📦 Using Docker Buildx for enhanced build support"
            # Set default builder to ensure compatibility
            docker buildx use default 2>/dev/null || true
        else
            echo "⚠️  Docker Buildx not available, using standard build"
            echo "💡 Consider installing buildx for better multi-platform support"
        fi
        
        # Build with better error handling
        if docker-compose -f $COMPOSE_FILE build --no-cache; then
            echo "✅ Build completed successfully!"
        else
            echo "❌ Build failed!"
            echo ""
            echo "🔧 Troubleshooting tips:"
            echo "  1. Make sure Docker is running"
            echo "  2. Check if you have sufficient disk space"
            echo "  3. Try: docker system prune -f"
            echo "  4. If using WSL2, restart Docker Desktop"
            exit 1
        fi
        ;;
    
    "up")
        echo "🚀 Starting PiHoleVault services..."
        
        # Check if images exist, build if needed
        if ! docker images | grep -q piholevault-local; then
            echo "📦 No existing image found, building first..."
        fi
        
        if docker-compose -f $COMPOSE_FILE up -d --build; then
            echo "✅ Services started successfully!"
            echo "🌐 Access PiHoleVault at: http://localhost:3000"
            echo "📋 To view logs: $0 logs"
            echo "📊 To check status: $0 status"
        else
            echo "❌ Failed to start services!"
            echo "📋 Check logs: $0 logs"
            exit 1
        fi
        ;;
    
    "down")
        echo "🛑 Stopping PiHoleVault services..."
        docker-compose -f $COMPOSE_FILE down
        echo "✅ Services stopped!"
        ;;
    
    "logs")
        echo "📋 Showing PiHoleVault logs (Ctrl+C to exit)..."
        docker-compose -f $COMPOSE_FILE logs -f
        ;;
    
    "rebuild")
        echo "🔄 Rebuilding and restarting PiHoleVault..."
        docker-compose -f $COMPOSE_FILE down
        docker-compose -f $COMPOSE_FILE build --no-cache
        docker-compose -f $COMPOSE_FILE up -d
        echo "✅ Rebuild completed!"
        echo "🌐 Access PiHoleVault at: http://localhost:3000"
        ;;
    
    "clean")
        echo "🧹 Cleaning up all PiHoleVault containers, images, and volumes..."
        read -p "⚠️  This will remove ALL PiHoleVault data. Continue? (y/N): " -n 1 -r
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
        echo "📊 PiHoleVault container status:"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    
    "shell")
        echo "🐚 Opening shell in PiHoleVault container..."
        docker-compose -f $COMPOSE_FILE exec piholevault sh
        ;;
    
    "discord")
        echo "🔔 Discord Webhook Configuration:"
        if [[ -n "$DISCORD_WEBHOOK_URL" ]]; then
            echo "✅ Webhook URL: ${DISCORD_WEBHOOK_URL:0:50}..." 
            echo "📡 Discord notifications are enabled"
            echo "🧪 Testing webhook..."
            # Test the webhook with a simple curl command
            curl -X POST "$DISCORD_WEBHOOK_URL" \
                -H "Content-Type: application/json" \
                -d '{
                    "username": "PiHoleVault Test",
                    "embeds": [{
                        "title": "🧪 Test Notification",
                        "description": "Discord webhook is working correctly!",
                        "color": 65280,
                        "footer": {"text": "PiHoleVault Local Build"}
                    }]
                }' && echo "✅ Test notification sent!" || echo "❌ Test failed"
        else
            echo "❌ No Discord webhook URL configured"
        fi
        ;;
    
    "help"|*)
        show_usage
        ;;
esac
