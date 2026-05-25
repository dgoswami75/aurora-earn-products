# Aurora Bank — Earn Products PoC

A TypeScript + Express service that surfaces Kraken Earn yield strategies to Aurora Bank customers, filtered and tier-gated per Aurora's compliance requirements.

## Run it

```bash
docker-compose up
```

That's it. The service is available at `http://localhost:3000`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/earn-products?tier={standard\|premium\|private}` | Tier-filtered earn-product list, sorted by APY descending |
| `GET` | `/health` | Liveness probe → `{ "status": "ok" }` |

Example:

```bash
curl 'http://localhost:3000/earn-products?tier=standard'
```

Returns a JSON array shaped like:

```json
[
  {
    "strategyId": "ESRFUO3-Q62XD-WIOIL7",
    "asset": "DOT",
    "displayName": "DOT Instant Staking",
    "lockType": "instant",
    "apyValue": 8,
    "apyDisplay": "8.00%",
    "eligibleTiers": ["Standard", "Premium", "Private"],
    "minimumAmount": "0.01"
  }
]
```

Errors return a structured response — never a raw stack trace:

```json
{ "error": { "code": "INVALID_TIER", "message": "Unknown tier \"platinum\". Expected one of: standard, premium, private." } }
```

## Architecture

The service is a single Express process that loads the mounted `data/*.json` files once at boot, validates them with Zod, and serves a pure transform pipeline on each request. No database, no live API calls, no shared state.

```
data/*.json ──► dataLoader ──► (Zod-validated, in-memory) ──► transform pipeline ──► JSON response
                                                                ▲
                                                                │
                                                 tier query param ──┘
```

Key design choices:

- **All JSON files in `data/` are read and classified by shape** (strategies vs assets). Unknown files are skipped with a warning, not a crash. Additional grading fixtures dropped into `data/` will be picked up automatically.
- **Data loaded once at boot.** Restart to pick up new fixtures. Trade-off: low latency, no FS chatter per request; cost: needs a restart for changes. Appropriate for the static-fixture use case here.
- **Pure transform.** `buildEarnProducts(strategies, assets, tier)` is a pure function — easy to test in isolation, easy to reason about. All 16 unit tests cover this layer directly.
- **Boundary-only validation.** Zod schemas validate at the file-load boundary (where bad data enters). Internal types are TS-only. This matches the spec's "handle malformed upstream data" requirement without paying the runtime cost everywhere.
- **Fail-fast at boot.** If data files are missing or unparseable, the process exits with a clear error — better than discovering it on the first customer request.

## Project layout

```
src/
├── server.ts              # express bootstrap, route wiring, error middleware
├── routes/earnProducts.ts # GET /earn-products handler
├── domain/
│   ├── types.ts           # internal + output types (Tier, EarnProduct)
│   ├── schemas.ts         # Zod schemas for both input file shapes
│   ├── tiers.ts           # eligibleTiersFor(strategy) — pure
│   └── transform.ts       # raw -> output (filter, normalise, sort)
├── dataLoader.ts          # reads + classifies all *.json in /data
├── errors.ts              # structured error response helper
└── __tests__/             # Vitest unit tests (16 total)
```

## Dependencies

Three runtime deps total, chosen for minimal surface area and longevity:

| Package | Version | Why it's safe |
|---|---|---|
| `express` | `^4.21.2` | The de-facto Node HTTP framework. Mature, audited, conservative release cadence. We use only the core router + middleware — no plugins. |
| `zod` | `^3.23.8` | Schema-validation library with zero dependencies. Pure TypeScript, no native code, no runtime fetches. Used only to validate file contents at load time. |
| `node:fs/promises`, `node:path` | (stdlib) | Filesystem reads happen via the Node standard library. |

Dev-only: `typescript`, `vitest`, `ts-node-dev`, `@types/*`. None ship in the production image.

## Tests

```bash
npm test
```

16 unit tests covering: tier rules per lock type, APY threshold (including the XTZ 2.5–3.5 boundary case), missing apr_estimate, disabled assets, unknown asset codes, `can_allocate=false`, sort order, display formatting.

## Known limitations / what I'd add with more time

- **No integration test** of the HTTP layer (supertest would slot in easily) — the transform and tier logic are covered by unit tests, but the route handler is only verified via manual curl.
- **APR is surfaced as APY.** Kraken returns `apr_estimate`; converting to true APY would require assumptions about compounding frequency that vary by `payout_frequency`. We use the conservative `low` bound as `apyValue` — see [solution-design-note.md](./solution-design-note.md) §2.
- **No request logging.** A real deployment would add `pino` or similar with request IDs.
- **No rate limiting.** Aurora's frontend will fan out reads — an `express-rate-limit` ahead of the route would be appropriate.
- **Display names are derived, not human-curated.** We compose `<ticker> <lock-style> <yield-source>` (e.g. `ETH Instant Staking`). The brief's sample (`"Ethereum Flexible Staking"`) implies full asset names; producing those needs a static lookup table not in the mock data.
- **The data is reloaded only on process restart.** A file-watcher or signal-driven reload would be cheap to add if Aurora wants to drop in updated fixtures live.
