#!/bin/bash
# Usage: ./scripts/oom-kill.sh <deployment> [restore <mem-request> <mem-limit>]
#   deployment: name of the deployment (e.g. coffee-orders)
#   restore:    pass "restore" as second arg to reset memory limits
#               optional: specify restore values (default: 128Mi request, 256Mi limit)
#
# Examples:
#   ./scripts/oom-kill.sh coffee-orders
#   ./scripts/oom-kill.sh coffee-orders restore
#   ./scripts/oom-kill.sh coffee-orders restore 256Mi 512Mi

set -e

DEPLOYMENT="${1:-}"
NAMESPACE="cosmic-coffee"

if [ -z "$DEPLOYMENT" ]; then
  echo "Usage: $0 <deployment> [restore [mem-request] [mem-limit]]"
  echo "  Example: $0 coffee-orders"
  echo "  Example: $0 coffee-orders restore"
  echo "  Example: $0 coffee-orders restore 256Mi 512Mi"
  exit 1
fi

if [ "${2:-}" = "restore" ]; then
  RESTORE_REQUEST="${3:-128Mi}"
  RESTORE_LIMIT="${4:-256Mi}"
  echo "Restoring memory limits for ${DEPLOYMENT} (requests=${RESTORE_REQUEST} limits=${RESTORE_LIMIT})..."
  kubectl patch deployment "${DEPLOYMENT}" -n "${NAMESPACE}" --type='strategic' \
    -p='{"spec":{"template":{"spec":{"containers":[{"name":"'"${DEPLOYMENT}"'","resources":{"requests":{"memory":"'"${RESTORE_REQUEST}"'"},"limits":{"memory":"'"${RESTORE_LIMIT}"'"}}}]}}}}'
  echo "Done."
else
  echo "Current memory settings for ${DEPLOYMENT}:"
  kubectl get deployment "${DEPLOYMENT}" -n "${NAMESPACE}" \
    -o jsonpath='  requests.memory: {.spec.template.spec.containers[0].resources.requests.memory}{"\n"}  limits.memory:   {.spec.template.spec.containers[0].resources.limits.memory}{"\n"}'

  echo ""
  echo "Setting memory limit to 5Mi (OOMKill incoming)..."
  kubectl patch deployment "${DEPLOYMENT}" -n "${NAMESPACE}" --type='json' \
    -p='[
      {"op":"remove","path":"/spec/template/spec/containers/0/resources/requests/memory"},
      {"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"5Mi"}
    ]'
  echo "Done. Watch for OOMKill:"
  echo "  kubectl get pods -n ${NAMESPACE} -w"
fi
