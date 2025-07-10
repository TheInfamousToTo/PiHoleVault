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
RUN printf 'server {\n\
    listen 80;\n\
    server_name localhost;\n\
    \n\
    gzip on;\n\
    gzip_vary on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;\n\
    \n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    location /api/ {\n\
        proxy_pass http://localhost:3001;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
    \n\
    location /health {\n\
        proxy_pass http://localhost:3001/health;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Configure supervisor to manage both nginx and node
RUN printf '[supervisord]\n\
nodaemon=true\n\
user=root\n\
logfile=/var/log/supervisor/supervisord.log\n\
pidfile=/var/run/supervisord.pid\n\
\n\
[program:nginx]\n\
command=nginx -g "daemon off;"\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/supervisor/nginx.err.log\n\
stdout_logfile=/var/log/supervisor/nginx.out.log\n\
\n\
[program:backend]\n\
command=npm start\n\
directory=/app\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/supervisor/backend.err.log\n\
stdout_logfile=/var/log/supervisor/backend.out.log\n\
environment=NODE_ENV=production,DATA_DIR=/app/data,BACKUP_DIR=/app/backups\n' > /etc/supervisor/conf.d/supervisord.conf

# Expose port 80 (nginx will handle both frontend and backend routing)
EXPOSE 80

# Start supervisor to manage both services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
