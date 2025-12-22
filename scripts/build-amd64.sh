#!/bin/bash

# Cosmic Coffee AMD64 Docker Build Script for Apple Silicon
# Builds Docker images for amd64 architecture on Apple Silicon (M1/M2/M3) Macs

set -e

# Configuration
REGISTRY="${DOCKER_REGISTRY:-bpschmitt}"
VERSION="${VERSION:-latest}"
PLATFORM="linux/amd64"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 Building AMD64 Docker Images on Apple Silicon${NC}"
echo -e "${BLUE}Registry: ${REGISTRY}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${YELLOW}Platform: ${PLATFORM} (using QEMU emulation)${NC}"
echo -e "${YELLOW}Note: Building for amd64 on Apple Silicon is slower due to emulation${NC}"
echo ""

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    echo "❌ Docker buildx is not available. Please install Docker Desktop 19.03+ or enable buildx."
    exit 1
fi

# Create and use buildx builder if it doesn't exist
if ! docker buildx ls | grep -q amd64-builder; then
    echo "📦 Creating buildx builder instance for amd64..."
    docker buildx create --name amd64-builder --use
    docker buildx inspect --bootstrap
else
    echo "✅ Using existing buildx builder instance"
    docker buildx use amd64-builder
fi

# Check if we should push or load
PUSH="${PUSH:-false}"
LOAD_FLAG="--load"

if [ "$PUSH" = "true" ] || [ -n "$DOCKER_REGISTRY" ]; then
    LOAD_FLAG="--push"
    echo -e "${GREEN}Pushing to registry: ${REGISTRY}${NC}"
else
    echo -e "${GREEN}Loading images locally (--load)${NC}"
fi

echo ""
echo -e "${GREEN}Building Frontend for amd64...${NC}"
docker buildx build \
  --platform ${PLATFORM} \
  -t ${REGISTRY}/cosmic-coffee-frontend:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-frontend:latest \
  ${LOAD_FLAG} \
  ../services/frontend

echo ""
echo -e "${GREEN}✅ All amd64 images built successfully!${NC}"
echo ""
echo "Images:"
echo "  - ${REGISTRY}/cosmic-coffee-frontend:${VERSION}"
echo ""
if [ "$LOAD_FLAG" = "--load" ]; then
    echo "Images are loaded locally and ready to use."
    echo "To push to a registry, set PUSH=true or DOCKER_REGISTRY environment variable."
fi

