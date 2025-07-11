#!/bin/bash

# HoleSafe Local Build Script
# This script helps you build and run HoleSafe locally

set -e

# Discord webhook URL for notifications
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/1393231200889344183/sUv1wnBjDk4pkmytuqJeEFfuylBgcv6cIc2c79m8afLOCEZEXRkPYkpPyqmEHUbLPQd3"

echo "🚀 HoleSafe Local Build & Deploy Script"
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
                    "username": "HoleSafe Test",
                    "embeds": [{
                        "title": "🧪 Test Notification",
                        "description": "Discord webhook is working correctly!",
                        "color": 65280,
                        "footer": {"text": "HoleSafe Local Build"}
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
