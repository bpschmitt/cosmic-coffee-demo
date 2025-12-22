#!/bin/bash

# Cosmic Coffee AMD64 Docker Build Script for Apple Silicon
# Builds Docker images for amd64 architecture on Apple Silicon (M1/M2/M3) Macs
# Usage: ./build-amd64.sh [service-name]
#   If service-name is provided, builds only that service
#   If no argument, builds all services

set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to repository root so relative paths work correctly
cd "$REPO_ROOT"

# Configuration
REGISTRY="${DOCKER_REGISTRY:-bpschmitt}"
VERSION="${VERSION:-latest}"
PLATFORM="linux/amd64"

# List of all available services
ALL_SERVICES="frontend products cart payment checkout orders fulfillment loadgen"

# Function to get service info (path:image-name:description)
get_service_info() {
  case "$1" in
    frontend)
      echo "services/frontend:cosmic-coffee-frontend:Frontend"
      ;;
    products)
      echo "services/products:cosmic-coffee-products:Products Service (Java)"
      ;;
    cart)
      echo "services/cart:cosmic-coffee-cart:Cart Service (.NET)"
      ;;
    payment)
      echo "services/payment:cosmic-coffee-payment:Payment Service (Python)"
      ;;
    checkout)
      echo "services/checkout:cosmic-coffee-checkout:Checkout Service (Node.js)"
      ;;
    orders)
      echo "services/orders:cosmic-coffee-orders:Orders Service (Node.js)"
      ;;
    fulfillment)
      echo "services/fulfillment:cosmic-coffee-fulfillment:Fulfillment Service (.NET)"
      ;;
    loadgen)
      echo "services/loadgen:cosmic-coffee-loadgen:Loadgen"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Get service name from argument (optional)
SERVICE_NAME="${1:-}"

# Validate service name if provided
if [ -n "$SERVICE_NAME" ]; then
  SERVICE_INFO=$(get_service_info "$SERVICE_NAME")
  if [ -z "$SERVICE_INFO" ]; then
    echo "❌ Unknown service: $SERVICE_NAME"
    echo ""
    echo "Available services:"
    for svc in $ALL_SERVICES; do
      echo "  - $svc"
    done
    exit 1
  fi
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -n "$SERVICE_NAME" ]; then
  echo -e "${BLUE}🐳 Building AMD64 Docker Image on Apple Silicon: ${SERVICE_NAME}${NC}"
else
  echo -e "${BLUE}🐳 Building AMD64 Docker Images on Apple Silicon${NC}"
fi
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

# Function to build a service
build_service() {
  local svc_name=$1
  local svc_info=$(get_service_info "$svc_name")
  IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
  
  echo ""
  echo -e "${GREEN}Building ${svc_desc} for amd64...${NC}"
  docker buildx build \
    --platform ${PLATFORM} \
    -t ${REGISTRY}/${svc_image}:${VERSION} \
    -t ${REGISTRY}/${svc_image}:latest \
    ${LOAD_FLAG} \
    ${svc_path}
}

# Build services
BUILT_IMAGES=""

if [ -n "$SERVICE_NAME" ]; then
  # Build single service
  build_service "$SERVICE_NAME"
  svc_info=$(get_service_info "$SERVICE_NAME")
  IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
  BUILT_IMAGES="${REGISTRY}/${svc_image}:${VERSION}"
else
  # Build all services
  for svc in $ALL_SERVICES; do
    build_service "$svc"
    svc_info=$(get_service_info "$svc")
    IFS=':' read -r svc_path svc_image svc_desc <<< "$svc_info"
    if [ -z "$BUILT_IMAGES" ]; then
      BUILT_IMAGES="${REGISTRY}/${svc_image}:${VERSION}"
    else
      BUILT_IMAGES="$BUILT_IMAGES"$'\n'"${REGISTRY}/${svc_image}:${VERSION}"
    fi
  done
fi

echo ""
echo -e "${GREEN}✅ AMD64 images built successfully!${NC}"
echo ""
echo "Images:"
echo "$BUILT_IMAGES" | while IFS= read -r img; do
  echo "  - $img"
done
echo ""
if [ "$LOAD_FLAG" = "--load" ]; then
    echo "Images are loaded locally and ready to use."
    echo "To push to a registry, set PUSH=true or DOCKER_REGISTRY environment variable."
fi

