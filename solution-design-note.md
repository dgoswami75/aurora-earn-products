# Solution Design Note — Aurora Bank Earn Products Integration

**Audience:** Aurora Bank backend engineering team · **Date:** 2026-05-24

## What this is

A standalone HTTP service that exposes filtered upstream Earn strategies to Aurora's React Native app. Runs as a single container via `docker-compose up`.

- **Endpoint:** `GET /earn-products?tier={standard|premium|private}`
- **Returns:** JSON array of strategies, sorted by APY descending, in your required output shape.
- **Errors:** structured `{ error: { code, message } }` envelope. Never a raw stack.

## Upstream endpoints we consume

| Endpoint | Purpose | Fields used |
|---|---|---|
| `POST /private/Earn/Strategies` | Strategy catalogue | `id`, `asset`, `lock_type.type`, `apr_estimate.low`, `user_min_allocation`, `can_allocate`, `allocation_restriction_info`, `yield_source.type` |
| `GET /public/Assets` | Asset metadata for ticker normalisation | `altname`, `status` |

Both are required: strategy entries reference assets by internal codes (`XETH`, `XADA`, `XXTZ`) — the assets endpoint provides the `altname` (`ETH`, `ADA`, `XTZ`) that your customers expect.

## Business logic

**Pre-filters** — a strategy is dropped (excluded from response) before tier-matching if any of these hold:

| Filter | Why |
|---|---|
| `can_allocate === false` | The upstream provider says the customer can't allocate. Surfacing it would mislead. |
| `apr_estimate` missing | No APY → can't evaluate the 3% floor. |
| `asset` missing in `assets.json` | No clean ticker / display name. |
| `assets[asset].status !== "enabled"` | Asset disabled on platform. |
| `apyValue < 3` | Aurora's compliance floor. |

**Tier eligibility** — derived from `lock_type.type`:

| Lock type | Visible to |
|---|---|
| `instant`, `flex` | Standard, Premium, Private |
| `bonded`, `timed`, `hybrid` | Premium, Private |
| anything else | Premium, Private (safe default — hide unknown lockups from Standard) |

`timed` and `hybrid` aren't covered by Aurora's brief; both impose lockup or delayed withdrawal, so we treat them like `bonded`. Unknown lock types default to Premium+Private rather than appearing for Standard customers we may have misclassified.

## Key judgment calls

- **APR vs APY.** The upstream provider returns `apr_estimate.{low, high}` as decimal-string ranges. We surface `apr_estimate.low` as `apyValue`. Converting APR → APY requires per-strategy compounding assumptions we can't validate. The conservative `low` bound also avoids overstating yield (the worse direction for a regulated bank). Switching to mid/high is a one-line change in `transform.ts`.
- **`apyDisplay` locale.** The assessment specifies "localised APY display strings" but the sample shows English format (`"4.25%"`). We match the sample (period decimal, no space before `%`). If Aurora wants per-locale formatting (e.g. `"4,25 %"` for EU markets), accept a `locale` query param and use `Intl.NumberFormat` — straightforward change.
- **Display name composition.** `<ticker> <lock-style> <yield-source>` (e.g. `ETH Instant Staking`). The brief's sample (`"Ethereum Flexible Staking"`) implies full asset names; that needs a static lookup table not present in the mock data.

## Edge cases observed in the sample fixtures

| Strategy | Behaviour | Why |
|---|---|---|
| `XTZ` flex (low 2.5%, high 3.5%) | Dropped | Conservative `low` falls under 3%. Using `high` would let it through. |
| `POL/MATIC` flex (low ≈ 3.0%, high ≈ 3.0%) | Surfaced at 3.00% | IEEE-754 rounds `Number("2.9999999999999999")` to exactly `3.0`. The 3% cliff is effectively soft. |
| `MINA` flex (no `apr_estimate`) | Dropped silently | Cannot evaluate threshold. |
| `SOL`, `ATOM`, `KSM`, `FIL`, `FLR` | Dropped | `can_allocate: false` (most also carry `allocation_restriction_info: ["tier"]` — the upstream provider's own tier system, distinct from Aurora's). |

Note: we filter on `can_allocate` only — `allocation_restriction_info` is informational and currently redundant on this data. If a future row arrives with `can_allocate: true` and a non-empty `allocation_restriction_info`, you may want to also exclude it; trivial to add.

## Path to production

1. **Replace `dataLoader` with a real upstream API client.** The transform pipeline is decoupled from the data source. Add HMAC-SHA512 request signing for `POST /private/Earn/Strategies` (provider docs).
2. **Cache strategy/asset responses** (60s TTL, stale-while-revalidate). Today's static load is effectively this with TTL = process lifetime.
3. **Request logging + trace IDs** (`pino` + a request-ID middleware) so Aurora's frontend logs can be correlated with this service.
4. **Rate limiting** — inbound (`express-rate-limit`) and outbound (token bucket vs the provider's per-key limits).
5. **Contract tests with Aurora's frontend.** This side has 52 Vitest tests across the transform, tier, data-loader, and HTTP layers (including supertest-driven route tests); next step is locking the response shape from the consumer side so neither team can drift unilaterally.
6. **Move policy out of code:** tier→lock-type mapping, APY floor, APR side (`low`/`mid`/`high`) — into admin-editable config so compliance can retune without a redeploy.
7. **Consider a soft buffer above 3%** (e.g. 3.25%). The upstream `apr_estimate` moves; strategies flickering across the cliff is a UX issue.

## File map

| File | What it does |
|---|---|
| [src/server.ts](./src/server.ts) | Express bootstrap, error middleware, fail-fast data load |
| [src/routes/earnProducts.ts](./src/routes/earnProducts.ts) | `GET /earn-products` handler |
| [src/domain/transform.ts](./src/domain/transform.ts) | Pure transform pipeline (filter → map → sort) |
| [src/domain/tiers.ts](./src/domain/tiers.ts) | Tier eligibility rules |
| [src/domain/schemas.ts](./src/domain/schemas.ts) | Zod schemas for both upstream response shapes |
| [src/dataLoader.ts](./src/dataLoader.ts) | Reads + classifies all `*.json` files in `data/` |

Questions: reach out to your upstream Solutions Engineering contact.
