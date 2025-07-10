# Multi-stage build for production optimization
FROM node:18-alpine as build

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Use npm install for now (no package-lock.json available)
RUN npm install --only=production --silent

COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine as production

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

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
