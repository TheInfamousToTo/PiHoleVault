#!/bin/bash

# Script to build and publish Docker images for HoleSafe

VERSION=$(cat version)
DOCKER_USER="theinfamoustoto"
FRONTEND_IMAGE="holesafe-frontend"
BACKEND_IMAGE="holesafe-backend"

echo "Building and publishing HoleSafe version: $VERSION"

# Build frontend image
echo "Building frontend image..."
docker build -t $DOCKER_USER/$FRONTEND_IMAGE:$VERSION -t $DOCKER_USER/$FRONTEND_IMAGE:latest --target production ./frontend

# Build backend image
echo "Building backend image..."
docker build -t $DOCKER_USER/$BACKEND_IMAGE:$VERSION -t $DOCKER_USER/$BACKEND_IMAGE:latest ./backend

# Push images to Docker Hub
echo "Pushing images to Docker Hub..."
docker push $DOCKER_USER/$FRONTEND_IMAGE:$VERSION
docker push $DOCKER_USER/$FRONTEND_IMAGE:latest
docker push $DOCKER_USER/$BACKEND_IMAGE:$VERSION
docker push $DOCKER_USER/$BACKEND_IMAGE:latest

echo "Successfully published version $VERSION to Docker Hub"
