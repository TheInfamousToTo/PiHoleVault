# Multi-stage build for production optimization
FROM node:18-alpine as build

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Use npm ci for faster, reliable builds (or npm install as fallback)
RUN npm install --only=production --silent

# Copy source code
COPY . .

# Build the React app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine as production

# Copy built app from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add gzip compression and caching headers
RUN echo 'gzip on;' >> /etc/nginx/conf.d/default.conf && \
    echo 'gzip_vary on;' >> /etc/nginx/conf.d/default.conf && \
    echo 'gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;' >> /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Development stage
FROM node:18-alpine as development

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Use npm install for development
RUN npm install --silent

COPY . .

EXPOSE 3000

CMD ["npm", "start"]

# Default to development
FROM development
