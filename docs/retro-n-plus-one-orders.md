# Retro: Orders API Latency Regression (N+1 Query Pattern)

**Date of incident:** 2026-07-14
**Retro date:** 2026-07-17
**Author:** Orders team
**Severity:** SEV-2 (degraded performance, no data loss, no full outage)
**Status:** Resolved

## Summary

A routine deploy of the `orders` service (`v1.0.1-test`) introduced an N+1 query pattern into the order-listing endpoint. Instead of one batched query to fetch product names for order line items, the service issued one HTTP call to the Products service per line item. Under normal load this went unnoticed in staging, but in production the endpoint's P95 latency rose from ~120ms to over 2.1s, and the effect compounded during a scheduled load test, causing Products service saturation and a partial checkout slowdown. Rolled back to `v1.0.0` after 47 minutes.

## Timeline (UTC)

| Time | Event |
|---|---|
| 09:12 | `coffee-orders:v1.0.1-test` rolled out via `kubectl set image` (query rewrite intended to simplify line-item enrichment code) |
| 09:15 | New Relic APM dashboard shows `GET /api/orders` average response time climbing from 130ms to 900ms |
| 09:19 | Distributed trace view shows a single `/api/orders` request fanning out into 26 sequential `GET /api/products/:id` spans instead of 1 |
| 09:24 | Products service throughput alert fires — request rate up 12x with no corresponding traffic increase upstream |
| 09:31 | Checkout service starts reporting elevated 503s; root cause traced to Orders → Products latency inflating the overall checkout transaction past client timeout |
| 09:37 | On-call confirms `v1.0.1-test` is the only recent change; begins rollback |
| 09:44 | `kubectl set image deployment/coffee-orders coffee-orders=bpschmitt/cosmic-coffee-orders:v1.0.0 -n cosmic-coffee` |
| 09:59 | Latency and error rates back to baseline; incident closed |

## Root cause

The `v1.0.1-test` release refactored the order-enrichment code path in `services/orders/server.js`. The previous implementation collected all unique product IDs referenced across an order/order-items result set and fetched them in a single batched call. The rewrite replaced this with a per-item lookup inside the enrichment loop — functionally correct, but issuing one outbound HTTP request per order item rather than one request per unique product ID set.

For a typical response of 10 orders averaging 2-3 items each, this meant 20-30 sequential calls to the Products service instead of 1-10 parallel calls. The N+1 pattern was not caught in code review because the diff read as a simplification (removing a `Promise.all` batching helper), and it was not caught in staging because staging's order volume per request was too low to produce a visible latency delta.

This is a known/reproducible demo scenario in this repo — see `ENABLE_N_PLUS_ONE_QUERIES` and the `v1.0.0`/`v1.0.1-test` image tags described in `DEMO_FLAGS.md`.

## Impact

- Orders API (`GET /api/orders`) P95 latency: 120ms → 2.1s for ~35 minutes
- Products service request volume: +12x during the same window, no corresponding capacity headroom
- Checkout success rate dipped as downstream timeouts cascaded (503s from Checkout service)
- No data loss; no orders were dropped or corrupted
- Customer-visible impact limited to slower checkout confirmation; no failed orders confirmed

## What went well

- New Relic distributed tracing made the fan-out pattern immediately visible — the trace waterfall showing 26 sequential Products spans was the single clearest signal in the whole incident and cut diagnosis time significantly
- Rollback was fast and low-risk since the previous image tag was known-good and still available in the registry
- Alerting on Products service throughput caught the downstream blast radius before it became a full outage

## What went poorly

- Code review approved a query-pattern regression because the diff looked like a simplification; there was no explicit call-count assertion or query-plan check in the review checklist
- Staging load profile didn't resemble production order volume closely enough to surface the regression pre-deploy
- No automated alert existed specifically for "spans per trace" or "downstream call count per request," which would have caught this before customer impact

## Action items

| Action | Owner | Status |
|---|---|---|
| Add a New Relic NRQL alert on distributed trace span count per transaction for `GET /api/orders` | Orders team | Open |
| Add a lightweight integration check that asserts Products service call count stays O(1) relative to unique product IDs, not O(n) relative to line items | Orders team | Open |
| Update staging load profile to match production order-size distribution | Platform team | Open |
| Add a review-checklist note: any diff touching batched/`Promise.all` fetch patterns requires a call-count sanity check before merge | Orders team | Done |
| Document this failure mode and its detection signature in `DEMO_FLAGS.md` for future onboarding/training | Orders team | Done |

## Supporting data

- Deploy: `bpschmitt/cosmic-coffee-orders:v1.0.1-test` → rolled back to `v1.0.0`
- Affected code path: order-item product-name enrichment in `services/orders/server.js`
- New Relic: distributed trace showing 1 `/api/orders` span parenting 26 sequential `/api/products/:id` spans (expected: 1 batched span)
