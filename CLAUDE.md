# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A polyglot microservices demo app for showcasing New Relic observability (APM, distributed tracing, Browser, Infrastructure/K8s). Every service is deliberately instrumented with New Relic agents, and several services have built-in feature flags to simulate failure/performance scenarios on demand. There are no test suites in this repo — correctness is verified by running the stack and observing behavior/telemetry, not by unit tests.

## Architecture

Nine services, four languages, one Postgres database:

| Service | Language | Port | Role |
|---|---|---|---|
| frontend | React (CRA) + Nginx | 3000→80 | UI, proxies `/api/*` to backend services |
| products | Java/Spring Boot | 4001 | Product catalog |
| cart | .NET/ASP.NET Core | 4003 | Shopping cart, validates products via Products service |
| payment | Python/FastAPI | 4002 | Simulated payment processing (stateless, no DB) |
| checkout | Node.js/Express | 4004 | Orchestrates cart → payment → orders → clear cart |
| orders | Node.js/Express | 4000 | Order CRUD/search, enriches with product names, notifies fulfillment |
| fulfillment | .NET/ASP.NET Core (EF Core) | 5000 | Async order processing (pending → processing → completed) |
| loadgen | Python/Locust | 8089 (UI) | HTTP load generator, hits frontend API |
| loadgen-browser | Node.js/Playwright | — | Browser-driven load generator, drives real page interactions |

Postgres is the only datastore, shared by products, orders, and fulfillment. Schema in `database/init.sql` (`products`, `orders`, `order_items`, `order_events`).

**Request flow (checkout path):** Frontend → Checkout → {Cart (read), Payment (charge), Orders (create)} → Cart (clear). Orders then calls Products to enrich line items with names, and notifies Fulfillment asynchronously. This fan-out is the backbone of the distributed traces the demo is built around — when changing any of these services, preserve the call shape unless the change is specifically about altering it for a demo scenario.

**Kubernetes is the primary deployment target**, not Docker Compose — manifests live in `infrastructure/k8s/`, one file per resource, applied via Kustomize (`kubectl apply -k infrastructure/k8s/`). Namespace is `cosmic-coffee`. Deployment/container names are prefixed `coffee-` (e.g. `coffee-orders`, `coffee-payment`), which differs from the plain service names used in Docker Compose and the README's k8s guide — `infrastructure/k8s/README.md` is stale in places (references non-existent `backend-deployment.yaml`/`postgres-pv.yaml`); trust the actual manifests in that directory over the README prose.

Postgres runs a custom image (`bpschmitt/cosmic-coffee-postgres`, built from `infrastructure/docker/postgres/`) with `pg_stat_statements`, `pg_stat_monitor`, and `pg_wait_sampling` preloaded for New Relic's Query Performance features — rebuild/push it with `./scripts/build-postgres.sh <version>` after editing the Dockerfile or `initdb-extensions.sql`.

## Demo feature flags

Env-var-gated behaviors exist specifically to trigger observable failure/performance signatures. Full details and expected New Relic signals for each are in `DEMO_FLAGS.md`. Summary:

- `ENABLE_N_PLUS_ONE_QUERIES` (orders) — per-item product lookups instead of batched. Also toggle-able by deploying image tag `v1.0.3` (bad) vs `v1.0.0` (good) instead of an env var.
- `PAYMENT_SLOWDOWN_ENABLED` (payment) — adds random 2-5s delay.
- `PAYMENT_FAILURE_RATE` (payment) — float 0.0-1.0, probability of simulated "Insufficient funds" failure.
- `CHAOS_ENABLED` (checkout's `network-disturber` sidecar) — 20% packet loss + 200ms latency via `tc`, polled every 5s (no pod restart needed).
- Orders OOM: patch memory limit to 32Mi via `./scripts/oom-kill.sh coffee-orders` (and `restore` to undo) to trigger real OOMKills.
- DNS failure: patch a `*_SERVICE_URL` env var on checkout to an unresolvable host — no dedicated flag.

Toggle flags with `kubectl set env` / `kubectl patch deployment` against the `coffee-*` deployments in `cosmic-coffee` namespace — do not rebuild images for these, only for the N+1 version-swap scenario.

## Commands

**Local dev (per service, from its `services/<name>/` directory):**
- products (Java): `mvn spring-boot:run`
- checkout, orders (Node): `npm install && npm run dev` (nodemon)
- payment (Python): `pip install -r requirements.txt && uvicorn main:app --reload --port 4002`
- cart, fulfillment (.NET): `dotnet run`
- frontend (React): `npm install && npm start`

All backend services expect common DB env vars (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) except payment, which is stateless.

**Docker Compose (whole stack):**
```bash
scripts/start.sh   # docker-compose -f infrastructure/docker/docker-compose.yml up --build
scripts/stop.sh
```

**Kubernetes:**
```bash
kubectl apply -k infrastructure/k8s/          # deploy everything
kubectl get pods -n cosmic-coffee
kubectl port-forward service/frontend 3000:80 -n cosmic-coffee
kubectl delete -k infrastructure/k8s/         # teardown
```

**Building/pushing images:**
```bash
./scripts/build-multiarch.sh     # all services, multi-arch (arm64+amd64), pushes to registry
./scripts/build-amd64.sh         # amd64-only, for local load on Apple Silicon
./scripts/build-postgres.sh <version>   # custom postgres image only
```
Never bump an image version tag in a deployment manifest without being explicitly asked to — deployments here are often mid-demo, and version tags carry meaning (e.g. `v1.0.0` vs `v1.0.3` orders is the N+1 toggle).

**Deploying orders with New Relic change tracking:**
```bash
./scripts/deploy-orders.sh <version> [description]
```
Records a New Relic change tracking marker (via `newrelic` CLI) before rolling out the image tag — requires `newrelic` CLI authenticated and `kubectl` pointed at the right cluster.

There are no test, lint, or typecheck commands configured in any service — don't invent them.
