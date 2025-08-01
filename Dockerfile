# Combined PiHoleVault Dockerfile - Frontend + Backend in single container
# Multi-architecture support: AMD64, ARM64, ARMv7
FROM --platform=$BUILDPLATFORM node:18-alpine as frontend-build

# Build arguments for cross-platform builds
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Build the React frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ .
RUN npm run build

# Main application stage
FROM node:18-alpine

# Build arguments for cross-platform builds
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Add metadata labels
LABEL org.opencontainers.image.title="PiHoleVault"
LABEL org.opencontainers.image.description="Pi-hole Backup Manager with Web Interface"
LABEL org.opencontainers.image.url="https://github.com/TheInfamousToTo/PiHoleVault"
LABEL org.opencontainers.image.source="https://github.com/TheInfamousToTo/PiHoleVault"
LABEL org.opencontainers.image.vendor="TheInfamousToTo"
LABEL org.opencontainers.image.licenses="MIT"

# Install required system dependencies
RUN apk add --no-cache \
    openssh-client \
    openssh-keygen \
    curl \
    sshpass \
    nginx \
    supervisor

# Create application directory
WORKDIR /app

# Copy and install backend dependencies
COPY backend/package*.json ./
RUN npm install --only=production --silent

# Copy backend source code
COPY backend/ .

# Copy built frontend from build stage
COPY --from=frontend-build /app/frontend/build /usr/share/nginx/html

# Fix permissions for nginx - more robust approach
RUN chown -R nginx:nginx /usr/share/nginx/html
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} \+
RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \+

# Create necessary directories
RUN mkdir -p /app/data /app/backups /root/.ssh /var/log/supervisor

# Set proper permissions for SSH and create config
RUN chmod 700 /root/.ssh && \
    echo "StrictHostKeyChecking no" > /root/.ssh/config && \
    echo "UserKnownHostsFile /dev/null" >> /root/.ssh/config && \
    chmod 600 /root/.ssh/config && \
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa

# Create startup script inline
RUN echo '#!/bin/sh' > /usr/local/bin/startup.sh && \
    echo 'echo "Starting PiHoleVault services..."' >> /usr/local/bin/startup.sh && \
    echo 'nginx -t && echo "Nginx config OK"' >> /usr/local/bin/startup.sh && \
    echo 'exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf' >> /usr/local/bin/startup.sh && \
    chmod +x /usr/local/bin/startup.sh

# Configure nginx
# Remove default nginx configs and add our custom one to the correct location
RUN rm -f /etc/nginx/conf.d/default.conf /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/http.d/default.conf

# Debug nginx configuration
RUN echo "=== Nginx main config ===" && cat /etc/nginx/nginx.conf
RUN echo "=== Our site config ===" && cat /etc/nginx/http.d/default.conf
RUN echo "=== Testing nginx config ===" && nginx -t

# Enable gzip compression in nginx
RUN sed -i 's/#gzip on;/gzip on;/' /etc/nginx/nginx.conf && \
    sed -i '/gzip on;/a gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;' /etc/nginx/nginx.conf

# Configure supervisor to manage both nginx and node
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port 80 (nginx will handle both frontend and backend routing)
EXPOSE 80

# Start supervisor to manage both services
ENTRYPOINT []
CMD ["/usr/local/bin/startup.sh"]
