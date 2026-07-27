#!/bin/bash
# Usage: ./scripts/deploy-orders.sh <version> [description]
#   version:     image tag to deploy (e.g. v1.0.0, v1.0.1)
#   description: optional deployment description (default: "Deploy coffee-orders <version>")
#
# Requires:
#   - kubectl configured and pointing at the correct cluster/namespace
#   - newrelic CLI installed and authenticated (NEW_RELIC_API_KEY env var or ~/.newrelic/credentials)

set -e

VERSION="${1:-}"
DESCRIPTION="${2:-}"
NAMESPACE="cosmic-coffee"
DEPLOYMENT="coffee-orders"
CONTAINER="coffee-orders"
IMAGE="bpschmitt/cosmic-coffee-orders"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [description]"
  echo "  Example: $0 v1.0.1 'Deploy bad orders version'"
  exit 1
fi

DESCRIPTION="${DESCRIPTION:-Deploy ${DEPLOYMENT} ${VERSION}}"
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
ACTOR=$(git config user.name 2>/dev/null || echo "unknown")

echo "Recording change tracking marker in New Relic..."
newrelic changeTracking create \
  --entitySearch "name = 'coffee-orders' AND type = 'APPLICATION'" \
  --category Deployment \
  --type Basic \
  --description "${DESCRIPTION}" \
  --version "${VERSION}" \
  --commit "${COMMIT}" \
  --user "${ACTOR}"

echo "Waiting 5 seconds before deploying..."
sleep 5

echo "Deploying ${IMAGE}:${VERSION} to ${NAMESPACE}/${DEPLOYMENT}..."
kubectl set image deployment/${DEPLOYMENT} \
  ${CONTAINER}=${IMAGE}:${VERSION} \
  -n ${NAMESPACE}

echo "Waiting for rollout..."
kubectl rollout status deployment/${DEPLOYMENT} -n ${NAMESPACE} --timeout=120s

echo "Done. coffee-orders is now running ${VERSION}."
