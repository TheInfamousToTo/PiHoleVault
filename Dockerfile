# Combined HoleSafe Dockerfile - Frontend + Backend in single container
FROM node:18-alpine as frontend-build

# Build the React frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ .
RUN npm run build

# Main application stage
FROM node:18-alpine

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

# Create necessary directories
RUN mkdir -p /app/data /app/backups /root/.ssh /var/log/supervisor

# Set proper permissions for SSH and create config
RUN chmod 700 /root/.ssh && \
    echo "StrictHostKeyChecking no" > /root/.ssh/config && \
    echo "UserKnownHostsFile /dev/null" >> /root/.ssh/config && \
    chmod 600 /root/.ssh/config && \
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa

# Copy startup script
COPY startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

# Copy test script
COPY nginx-test.sh /usr/local/bin/nginx-test.sh
RUN chmod +x /usr/local/bin/nginx-test.sh

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
