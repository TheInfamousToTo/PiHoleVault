#!/bin/sh

# HoleSafe container startup script with debugging
echo "🚀 Starting HoleSafe container..."

# Create log directories
mkdir -p /var/log/supervisor

# Test nginx configuration before starting
echo "🔍 Testing nginx configuration..."
if ! nginx -t; then
    echo "❌ Nginx configuration test failed!"
    echo "📄 Nginx config contents:"
    cat /etc/nginx/conf.d/default.conf
    echo "📋 Available files:"
    ls -la /etc/nginx/conf.d/
    exit 1
fi

# Check if frontend files exist
if [ ! -d "/usr/share/nginx/html" ] || [ ! "$(ls -A /usr/share/nginx/html)" ]; then
    echo "❌ Frontend files are missing!"
    echo "📁 Directory contents:"
    ls -la /usr/share/nginx/
    exit 1
fi

# Check if backend directory exists
if [ ! -d "/app" ]; then
    echo "❌ Backend application directory missing!"
    exit 1
fi

# Ensure proper permissions
chmod 755 /usr/share/nginx/html
chmod -R 644 /usr/share/nginx/html/*
find /usr/share/nginx/html -type d -exec chmod 755 {} \+
chown -R nginx:nginx /usr/share/nginx/html

echo "✅ Pre-flight checks completed successfully"

# Start supervisor
echo "🎯 Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
