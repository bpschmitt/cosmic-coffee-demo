# Demo Feature Flags

These environment variables control chaos and observability scenarios for demo purposes. All flags default to `false` and can be toggled via `kubectl patch` without rebuilding images.

---

## N+1 Query Regression

**Service:** orders  
**Versions:** `v1.0.0` (good), `v1.0.1` (bad)

Simulates a developer deploying a query rewrite that replaces a single optimized JOIN with individual per-order database lookups. Each request to GET /api/orders issues 1 query to fetch orders followed by 1 query per order to fetch its items — up to 26 sequential database queries vs 1. Response times increase noticeably under load, and distributed traces in New Relic show N sequential PostgreSQL spans instead of one.

```sh
# Simulate bad deploy
kubectl set image deployment/coffee-orders \
  coffee-orders=bpschmitt/cosmic-coffee-orders:v1.0.1 \
  -n cosmic-coffee

# Roll back to good version
kubectl set image deployment/coffee-orders \
  coffee-orders=bpschmitt/cosmic-coffee-orders:v1.0.0 \
  -n cosmic-coffee
```

---

## `ENABLE_RANDOM_ORDER_ERRORS`

**Service:** orders  
**Default:** `false`

Causes ~25% of order creation requests to fail with a simulated "inventory unavailable" error. Useful for error rate and alerting demos.

```sh
kubectl patch deployment coffee-orders -n cosmic-coffee --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/env/1/value","value":"true"}]'
```

---

## `PAYMENT_SLOWDOWN_ENABLED`

**Service:** payment  
**Default:** `false`

Injects a random 2–5 second delay on top of the normal payment processing time (~0.5s). Useful for latency and slow transaction demos.

```sh
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_SLOWDOWN_ENABLED","value":"true"}]}]}}}}'
```

---

## `PAYMENT_FAILURE_RATE`

**Service:** payment  
**Default:** `0.0`

Sets the probability (0.0–1.0) that a payment request will fail with "Insufficient funds". For example, `0.25` causes ~25% of payments to fail. Useful for error rate and alerting demos.

```sh
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_FAILURE_RATE","value":"0.25"}]}]}}}}'
```

---

## `CHAOS_ENABLED`

**Service:** checkout (network-disturber sidecar)  
**Default:** `false`

Activates the `netshoot` sidecar container on the checkout pod to inject 20% packet loss and 200ms network delay on the pod's network interface using Linux `tc`. The sidecar polls this flag every 5 seconds, so changes take effect without a pod restart.

```sh
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/1/env/0/value","value":"true"}]'
```

---

## OOM / Memory Pressure Simulation

**Service:** orders

Sets the memory request and limit to 32Mi — low enough that Node.js will OOMKill under load, but high enough for the container to start. Useful for demonstrating memory pressure and OOM error scenarios in New Relic.

```sh
kubectl patch deployment coffee-orders -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-orders","resources":{"requests":{"memory":"32Mi"},"limits":{"memory":"32Mi"}}}]}}}}'
```

To restore:

```sh
kubectl patch deployment coffee-orders -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-orders","resources":{"requests":{"memory":"128Mi"},"limits":{"memory":"256Mi"}}}]}}}}'
```

---

## DNS Failure Simulation

There is no dedicated feature flag for DNS failures. To simulate a DNS error on any downstream service, patch the relevant `*_SERVICE_URL` env var on the checkout deployment to an unresolvable hostname:

```sh
# Break payment DNS
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/env/1/value","value":"http://urlis.broken:4002"}]'

# Restore
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/env/1/value","value":"http://coffee-payment.cosmic-coffee.svc.cluster.local:4002"}]'
```

> **Tip:** For DNS failures to generate observable NXDOMAIN responses (e.g. with the New Relic eBPF agent), set CoreDNS cache TTL to 1 second to prevent caching:
> ```sh
> kubectl get configmap coredns -n kube-system -o json | \
>   sed 's/cache [0-9]*/cache 1/' | kubectl apply -f -
> kubectl rollout restart deployment/coredns -n kube-system
> ```
