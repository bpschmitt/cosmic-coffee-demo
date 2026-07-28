# Demo Scenarios

These scenarios demonstrate common failure patterns observable in New Relic. Each can be toggled via `kubectl patch` or `kubectl set image` without rebuilding images.

---

## N+1 Query Regression

**Service:** orders  
**Versions:** `v1.1.0` (good) → `v1.1.1` (bad) → `v1.1.2` (fixed)

Simulates a developer deploying a query rewrite that replaces a single batched fetch with individual per-item HTTP calls. The `ENABLE_N_PLUS_ONE_QUERIES` flag is baked into each image at build time (via a Dockerfile `ARG`/`ENV`), so the image tag alone determines behavior — no env var override needed at deploy time. `v1.1.0` and `v1.1.2` fetch product data with one batched/joined call; `v1.1.1` instead issues one `GET /api/products/:id` call per order line item — up to 26 sequential Products-service calls vs 1. Response times increase noticeably under load, and distributed traces in New Relic show N sequential Products-service spans instead of one.

All three versions include correlated logging: each request to an enrichment endpoint (`GET /api/orders`, `GET /api/orders/search`, `GET /api/orders/:id`, `POST /api/orders`) emits an `order_enrichment_completed` log line with `request_id`, `mode` (`batched`/`n_plus_one`), `product_service_calls`, and `duration_ms` — a log-based alternative to the trace waterfall for spotting the same regression, and a way to correlate the per-item failure warnings back to one originating request via `request_id`.

```sh
# Simulate bad deploy (regression)
kubectl set image deployment/coffee-orders \
  coffee-orders=bpschmitt/cosmic-coffee-orders:v1.1.1 \
  -n cosmic-coffee

# Roll back to the pre-regression version
kubectl set image deployment/coffee-orders \
  coffee-orders=bpschmitt/cosmic-coffee-orders:v1.1.0 \
  -n cosmic-coffee

# Or roll forward to the fix
kubectl set image deployment/coffee-orders \
  coffee-orders=bpschmitt/cosmic-coffee-orders:v1.1.2 \
  -n cosmic-coffee
```

> **Note:** `v1.0.0`/`v1.0.3` remain available as legacy tags but their exact baked-in behavior predates this build-arg mechanism and isn't guaranteed to match this description — use the `v1.1.x` line for this scenario.
>
> **Cascading failure signal:** under sustained load, `v1.1.1` can also trigger 500s on `POST /api/fulfillment/process` (logged on orders as "Failed to notify fulfillment service"). Fulfillment opens one DB connection per request and holds it for ~2.5s of simulated processing time — a single fulfillment replica saturates once N+1-inflated order throughput pushes enough concurrent requests through it. This is left unfixed intentionally: it's a realistic secondary signal (one service's regression exhausting a shared downstream dependency), not a bug in the N+1 demo itself.
>
> **Postgres memory:** `infrastructure/k8s/postgres-deployment.yaml` runs Postgres at 512Mi request / 1Gi limit — enough headroom for `v1.1.1`'s connection pressure (from orders, fulfillment, and products sharing one Postgres pod with no connection pooler in front) to run without OOMKilling the database. If you want to demonstrate a more severe cascading failure — the shared datastore itself going down, taking out every service at once — patch the limit back down (`kubectl patch deployment postgres -n cosmic-coffee --type='strategic' -p='{"spec":{"template":{"spec":{"containers":[{"name":"postgres","resources":{"requests":{"memory":"256Mi"},"limits":{"memory":"512Mi"}}}]}}}}'`) before running `v1.1.1` under load; restore the higher limit afterward the same way.

---

## `PAYMENT_SLOWDOWN_ENABLED`

**Service:** payment  
**Default:** `false`

Injects a random 2–5 second delay on top of the normal payment processing time (~0.5s). Useful for latency and slow transaction demos.

```sh
# Enable
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_SLOWDOWN_ENABLED","value":"true"}]}]}}}}'

# Disable
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_SLOWDOWN_ENABLED","value":"false"}]}]}}}}'
```

---

## `PAYMENT_FAILURE_RATE`

**Service:** payment  
**Default:** `0.0`

Sets the probability (0.0–1.0) that a payment request will fail with "Insufficient funds". For example, `0.25` causes ~25% of payments to fail. Useful for error rate and alerting demos.

```sh
# Enable (25% failure rate)
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_FAILURE_RATE","value":"0.25"}]}]}}}}'

# Disable
kubectl patch deployment coffee-payment -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-payment","env":[{"name":"PAYMENT_FAILURE_RATE","value":"0.0"}]}]}}}}'
```

---

## `CHAOS_ENABLED`

**Service:** checkout (network-disturber sidecar)  
**Default:** `false`

Activates the `netshoot` sidecar container on the checkout pod to inject 20% packet loss and 200ms network delay on the pod's network interface using Linux `tc`. The sidecar polls this flag every 5 seconds, so changes take effect without a pod restart.

```sh
# Enable
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"network-disturber","env":[{"name":"CHAOS_ENABLED","value":"true"}]}]}}}}'

# Disable
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"network-disturber","env":[{"name":"CHAOS_ENABLED","value":"false"}]}]}}}}'
```

---

## OOM / Memory Pressure Simulation

**Service:** orders

Sets the memory request and limit to 32Mi — low enough that Node.js will OOMKill under load, but high enough for the container to start. Useful for demonstrating memory pressure and OOM error scenarios in New Relic.

```sh
# Enable
kubectl patch deployment coffee-orders -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-orders","resources":{"requests":{"memory":"32Mi"},"limits":{"memory":"32Mi"}}}]}}}}'

# Restore
kubectl patch deployment coffee-orders -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-orders","resources":{"requests":{"memory":"128Mi"},"limits":{"memory":"256Mi"}}}]}}}}'
```

---

## DNS Failure Simulation

**Service:** checkout

Patches a downstream service URL on the checkout deployment to an unresolvable hostname, causing DNS failures on outbound calls. No dedicated feature flag — update the relevant `*_SERVICE_URL` env var directly.

```sh
# Break payment DNS
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-checkout","env":[{"name":"PAYMENT_SERVICE_URL","value":"http://urlis.broken:4002"}]}]}}}}'

# Restore
kubectl patch deployment coffee-checkout -n cosmic-coffee --type='strategic' \
  -p='{"spec":{"template":{"spec":{"containers":[{"name":"coffee-checkout","env":[{"name":"PAYMENT_SERVICE_URL","value":"http://coffee-payment.cosmic-coffee.svc.cluster.local:4002"}]}]}}}}'
```

> **Tip:** For DNS failures to generate observable NXDOMAIN responses (e.g. with the New Relic eBPF agent), set CoreDNS cache TTL to 1 second to prevent caching:
> ```sh
> kubectl get configmap coredns -n kube-system -o json | \
>   sed 's/cache [0-9]*/cache 1/' | kubectl apply -f -
> kubectl rollout restart deployment/coredns -n kube-system
> ```
