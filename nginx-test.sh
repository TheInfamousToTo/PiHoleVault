#!/bin/sh

# Nginx startup verification script
echo "🔍 Testing nginx configuration..."

# Test nginx configuration
if nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors:"
    nginx -t 2>&1
    echo "📋 Available config files in conf.d:"
    ls -la /etc/nginx/conf.d/
    echo "� Available config files in http.d:"
    ls -la /etc/nginx/http.d/
    echo "�📄 Main nginx config:"
    cat /etc/nginx/nginx.conf
    echo "📄 Site config:"
    cat /etc/nginx/http.d/default.conf 2>/dev/null || echo "No site config found"
    exit 1
fi

# Check if frontend files exist
if [ -d "/usr/share/nginx/html" ] && [ "$(ls -A /usr/share/nginx/html)" ]; then
    echo "✅ Frontend files are present"
    ls -la /usr/share/nginx/html/
else
    echo "❌ Frontend files are missing"
    echo "📁 Checking directory:"
    ls -la /usr/share/nginx/
    exit 1
fi

echo "🎉 All checks passed!"
