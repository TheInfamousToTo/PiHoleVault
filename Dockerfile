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
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Configure supervisor to manage both nginx and node
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port 80 (nginx will handle both frontend and backend routing)
EXPOSE 80

# Start supervisor to manage both services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
