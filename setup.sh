#!/bin/bash

# Pi-hole Backup Manager - Setup Script
# This script helps you get started with the Pi-hole Backup Manager

set -e

echo "🚀 Pi-hole Backup Manager Setup"
echo "================================"
echo

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p data backups

# Set proper permissions
echo "🔐 Setting proper permissions..."
chmod 755 data backups

# Check if configuration exists
if [ -f "data/config.json" ]; then
    echo "⚙️  Found existing configuration"
    echo "   Your settings will be preserved"
else
    echo "📋 No existing configuration found"
    echo "   You'll need to complete the setup wizard"
fi

echo

# Ask user if they want to start the application
read -p "🚀 Do you want to start the application now? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Starting Pi-hole Backup Manager..."
    echo "   This may take a few minutes on first run..."
    
    # Start the application
    docker-compose up -d
    
    echo
    echo "✅ Application started successfully!"
    echo
    echo "🌐 Access the web interface at: http://localhost:3000"
    echo "📊 API documentation available at: http://localhost:3001/health"
    echo
    echo "📝 Next steps:"
    echo "1. Open your web browser and go to http://localhost:3000"
    echo "2. Complete the setup wizard"
    echo "3. Configure your Pi-hole server connection"
    echo "4. Set up SSH key authentication"
    echo "5. Configure backup schedule"
    echo
    echo "💡 Tips:"
    echo "• Check logs with: docker-compose logs"
    echo "• Stop the application with: docker-compose down"
    echo "• Update the application with: docker-compose pull && docker-compose up -d"
    echo
    echo "🆘 Need help? Check the README.md or visit:"
    echo "   https://github.com/TheInfamousToTo/HoleSafe"
    
else
    echo "⏸️  Application not started."
    echo "   You can start it later with: docker-compose up -d"
fi

echo
echo "🎉 Setup complete!"
