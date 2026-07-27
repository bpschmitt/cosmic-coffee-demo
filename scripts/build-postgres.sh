#!/bin/bash
# Usage: ./scripts/build-postgres.sh <version>
#   version: image tag (e.g. 15, 15.1)
#
# Builds a custom postgres image with pg_stat_monitor and pg_wait_sampling
# for New Relic database observability (Query Performance).

set -e

VERSION="${1:-15}"
IMAGE="bpschmitt/cosmic-coffee-postgres"
DOCKERFILE="infrastructure/docker/postgres/Dockerfile"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "  Example: $0 15"
  exit 1
fi

echo "Building ${IMAGE}:${VERSION}..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t "${IMAGE}:${VERSION}" \
  -f "${DOCKERFILE}" \
  infrastructure/docker/postgres/

echo "Done. ${IMAGE}:${VERSION} pushed."
