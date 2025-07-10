FROM node:18-alpine

# Install SSH client and other dependencies
RUN apk add --no-cache openssh-client openssh-keygen curl sshpass

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Use npm install for now (no package-lock.json available)
RUN npm install --only=production --silent

COPY . .

# Create necessary directories
RUN mkdir -p /app/data /app/backups /root/.ssh

# Set proper permissions for SSH and create config
RUN chmod 700 /root/.ssh && \
    echo "StrictHostKeyChecking no" > /root/.ssh/config && \
    echo "UserKnownHostsFile /dev/null" >> /root/.ssh/config && \
    chmod 600 /root/.ssh/config && \
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa

EXPOSE 3001

CMD ["npm", "start"]
