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

# Configure nginx
RUN { \
    echo 'server {'; \
    echo '    listen 80;'; \
    echo '    server_name localhost;'; \
    echo ''; \
    echo '    gzip on;'; \
    echo '    gzip_vary on;'; \
    echo '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;'; \
    echo ''; \
    echo '    location / {'; \
    echo '        root /usr/share/nginx/html;'; \
    echo '        index index.html index.htm;'; \
    echo '        try_files $uri $uri/ /index.html;'; \
    echo '    }'; \
    echo ''; \
    echo '    location /api/ {'; \
    echo '        proxy_pass http://localhost:3001;'; \
    echo '        proxy_http_version 1.1;'; \
    echo '        proxy_set_header Host $host;'; \
    echo '        proxy_set_header X-Real-IP $remote_addr;'; \
    echo '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'; \
    echo '        proxy_set_header X-Forwarded-Proto $scheme;'; \
    echo '    }'; \
    echo ''; \
    echo '    location /health {'; \
    echo '        proxy_pass http://localhost:3001/health;'; \
    echo '        proxy_http_version 1.1;'; \
    echo '        proxy_set_header Host $host;'; \
    echo '    }'; \
    echo '}'; \
} > /etc/nginx/conf.d/default.conf

# Configure supervisor to manage both nginx and node
RUN { \
    echo '[supervisord]'; \
    echo 'nodaemon=true'; \
    echo 'user=root'; \
    echo 'logfile=/var/log/supervisor/supervisord.log'; \
    echo 'pidfile=/var/run/supervisord.pid'; \
    echo ''; \
    echo '[program:nginx]'; \
    echo 'command=nginx -g "daemon off;"'; \
    echo 'autostart=true'; \
    echo 'autorestart=true'; \
    echo 'stderr_logfile=/var/log/supervisor/nginx.err.log'; \
    echo 'stdout_logfile=/var/log/supervisor/nginx.out.log'; \
    echo ''; \
    echo '[program:backend]'; \
    echo 'command=npm start'; \
    echo 'directory=/app'; \
    echo 'autostart=true'; \
    echo 'autorestart=true'; \
    echo 'stderr_logfile=/var/log/supervisor/backend.err.log'; \
    echo 'stdout_logfile=/var/log/supervisor/backend.out.log'; \
    echo 'environment=NODE_ENV=production,DATA_DIR=/app/data,BACKUP_DIR=/app/backups'; \
} > /etc/supervisor/conf.d/supervisord.conf

# Expose port 80 (nginx will handle both frontend and backend routing)
EXPOSE 80

# Start supervisor to manage both services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
