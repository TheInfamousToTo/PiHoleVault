#!/bin/sh

# Debug script for HoleSafe nginx issues
echo "🔍 HoleSafe Nginx Debug Information"
echo "==================================="

echo
echo "📋 Container Status:"
docker ps --filter "name=holesafe" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "📝 Recent Container Logs:"
docker logs holesafe --tail 20

echo
echo "🔧 Nginx Configuration Test (inside container):"
docker exec holesafe nginx -t 2>&1 || echo "❌ Cannot test nginx config - container may not be running"

echo
echo "📁 Nginx Configuration Files:"
docker exec holesafe ls -la /etc/nginx/conf.d/ 2>&1 || echo "❌ Cannot list nginx config - container may not be running"

echo
echo "📋 Nginx Error Logs:"
docker exec holesafe cat /var/log/supervisor/nginx.err.log 2>&1 || echo "❌ No nginx error logs found"

echo
echo "🌐 Network Connectivity Test:"
docker exec holesafe curl -f http://localhost:3001/health 2>&1 || echo "❌ Backend health check failed"

echo
echo "💾 File System Check:"
docker exec holesafe ls -la /usr/share/nginx/html/ 2>&1 || echo "❌ Cannot check frontend files"

echo
echo "🔄 Process Status:"
docker exec holesafe ps aux 2>&1 || echo "❌ Cannot check processes"
