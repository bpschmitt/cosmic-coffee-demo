#!/bin/bash

# Cosmic Coffee Multi-Architecture Docker Build Script
# Builds Docker images for both arm64 and amd64 architectures

set -e

# Configuration
REGISTRY="${DOCKER_REGISTRY:-bpschmitt}"
VERSION="${VERSION:-latest}"
PLATFORMS="linux/arm64,linux/amd64"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 Building Multi-Architecture Docker Images${NC}"
echo -e "${BLUE}Registry: ${REGISTRY}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Platforms: ${PLATFORMS}${NC}"
echo ""

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    echo "❌ Docker buildx is not available. Please install Docker Desktop 19.03+ or enable buildx."
    exit 1
fi

# Create and use buildx builder if it doesn't exist
if ! docker buildx ls | grep -q multiarch; then
    echo "📦 Creating buildx builder instance..."
    docker buildx create --name multiarch --use
    docker buildx inspect --bootstrap
else
    echo "✅ Using existing buildx builder instance"
    docker buildx use multiarch
fi

echo ""
echo -e "${GREEN}Building Frontend...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-frontend:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-frontend:latest \
  --push \
  ../services/frontend

echo ""
echo -e "${GREEN}Building Products Service (Java)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-products:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-products:latest \
  --push \
  ../services/products

echo ""
echo -e "${GREEN}Building Cart Service (.NET)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-cart:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-cart:latest \
  --push \
  ../services/cart

echo ""
echo -e "${GREEN}Building Payment Service (Python)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-payment:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-payment:latest \
  --push \
  ../services/payment

echo ""
echo -e "${GREEN}Building Checkout Service (Node.js)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-checkout:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-checkout:latest \
  --push \
  ../services/checkout

echo ""
echo -e "${GREEN}Building Orders Service (Node.js)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-orders:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-orders:latest \
  --push \
  ../services/orders

echo ""
echo -e "${GREEN}Building Fulfillment Service (.NET)...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-fulfillment:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-fulfillment:latest \
  --push \
  ../services/fulfillment

echo ""
echo -e "${GREEN}Building Loadgen...${NC}"
docker buildx build \
  --platform ${PLATFORMS} \
  -t ${REGISTRY}/cosmic-coffee-loadgen:${VERSION} \
  -t ${REGISTRY}/cosmic-coffee-loadgen:latest \
  --push \
  ../services/loadgen

echo ""
echo -e "${GREEN}✅ All images built and pushed successfully!${NC}"
echo ""
echo "Images available at:"
echo "  - ${REGISTRY}/cosmic-coffee-frontend:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-products:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-cart:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-payment:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-checkout:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-orders:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-fulfillment:${VERSION}"
echo "  - ${REGISTRY}/cosmic-coffee-loadgen:${VERSION}"
