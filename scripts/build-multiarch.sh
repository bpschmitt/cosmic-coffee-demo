#!/bin/bash

# Cosmic Coffee Multi-Architecture Docker Build Script
# Builds Docker images for both arm64 and amd64 architectures
# Usage: ./build-multiarch.sh [service-name]
#   If service-name is provided, builds only that service
#   If no argument, builds all services

set -e

# Configuration
REGISTRY="${DOCKER_REGISTRY:-bpschmitt}"
VERSION="${VERSION:-latest}"
PLATFORMS="linux/arm64,linux/amd64"

# Service definitions: name:path:image-name:description
declare -A SERVICES=(
  ["frontend"]="../services/frontend:cosmic-coffee-frontend:Frontend"
  ["products"]="../services/products:cosmic-coffee-products:Products Service (Java)"
  ["cart"]="../services/cart:cosmic-coffee-cart:Cart Service (.NET)"
  ["payment"]="../services/payment:cosmic-coffee-payment:Payment Service (Python)"
  ["checkout"]="../services/checkout:cosmic-coffee-checkout:Checkout Service (Node.js)"
  ["orders"]="../services/orders:cosmic-coffee-orders:Orders Service (Node.js)"
  ["fulfillment"]="../services/fulfillment:cosmic-coffee-fulfillment:Fulfillment Service (.NET)"
  ["loadgen"]="../services/loadgen:cosmic-coffee-loadgen:Loadgen"
)

# Get service name from argument (optional)
SERVICE_NAME="${1:-}"

# Validate service name if provided
if [ -n "$SERVICE_NAME" ] && [ -z "${SERVICES[$SERVICE_NAME]}" ]; then
  echo "❌ Unknown service: $SERVICE_NAME"
  echo ""
  echo "Available services:"
  for svc in "${!SERVICES[@]}"; do
    echo "  - $svc"
  done
  exit 1
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -n "$SERVICE_NAME" ]; then
  echo -e "${BLUE}🐳 Building Multi-Architecture Docker Image: ${SERVICE_NAME}${NC}"
else
  echo -e "${BLUE}🐳 Building Multi-Architecture Docker Images${NC}"
fi
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

# Function to build a service
build_service() {
  local svc_name=$1
  local svc_info="${SERVICES[$svc_name]}"
  IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
  
  echo ""
  echo -e "${GREEN}Building ${svc_desc}...${NC}"
  docker buildx build \
    --platform ${PLATFORMS} \
    -t ${REGISTRY}/${svc_image}:${VERSION} \
    -t ${REGISTRY}/${svc_image}:latest \
    --push \
    ${svc_path}
}

# Build services
BUILT_IMAGES=()

if [ -n "$SERVICE_NAME" ]; then
  # Build single service
  build_service "$SERVICE_NAME"
  svc_info="${SERVICES[$SERVICE_NAME]}"
  IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
  BUILT_IMAGES+=("${REGISTRY}/${svc_image}:${VERSION}")
else
  # Build all services
  for svc in "${!SERVICES[@]}"; do
    build_service "$svc"
    svc_info="${SERVICES[$svc]}"
    IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
    BUILT_IMAGES+=("${REGISTRY}/${svc_image}:${VERSION}")
  done
fi

echo ""
echo -e "${GREEN}✅ Images built and pushed successfully!${NC}"
echo ""
echo "Images available at:"
for img in "${BUILT_IMAGES[@]}"; do
  echo "  - $img"
done
