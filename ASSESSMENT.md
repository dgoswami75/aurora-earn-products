# Solutions Engineering — Take-Home Technical Assessment

- **Version:** v0.5 · 2026-05-06
- **Role:** Solutions Architect / Solutions Engineer
- **Time estimate:** 2–4 hours
- **Language:** TypeScript **or** Rust

---

## Overview

The goal for this assessment is to evaluate how you approach solutions engineering problems in action: reading API docs, translating customer requirements into working code, and using AI as a genuine accelerant. There are no trick questions. We're evaluating:

- Confidence working against a documented B2B API
- Sound judgment applying business logic to real API schemas
- Effective, deliberate use of AI in your development workflow
- Communication quality — you'll write a brief handoff note as if passing this to an implementation team

## The Scenario

You are a Solutions Engineer in pre-sales with **Aurora Bank** — a fictional European neobank that wants to offer crypto yield products to their customers via Kraken's Earn API. They have asked for a working PoC. Their requirements:

| Aurora Bank requirement | Notes / context |
|---|---|
| Only surface assets with a current APY ≥ 3% | Hard filter — Aurora's compliance team will not present sub-threshold yields to customers. |
| Support tiered eligibility | Aurora has three customer tiers (Standard, Premium, Private). Premium and Private customers should see all qualifying strategies; Standard customers should see only flexible/instant-access strategies (`lock_type: instant`). Bonded strategies with unbonding periods should be restricted to Premium and Private only. |
| Format for Aurora's frontend | A clean JSON array suitable for direct use in Aurora's React Native app, with localised APY display strings and a stable sort order (highest APY first). |
| Handle errors gracefully | If the upstream data is unavailable or returns unexpected data, return a structured error response with a human-readable message — never a raw stack trace. |
| Document the integration | Produce a one-page Solution Design Note (see Submission Package below) as if handing this off to Aurora's implementation team. |

## Technical Requirements

### API Integration

You will work against **provided mock data files** that mirror Kraken's Spot REST API response shapes — no API credentials are required. Use the Kraken API reference documentation to understand each endpoint's response contract, then consume the JSON files that reflect those schemas. The following endpoints are relevant to this task:

| Endpoint | Purpose |
|---|---|
| `POST /private/Earn/Strategies` | Primary data source. Returns all earn strategies available to the user — asset, lock type, reward rate, minimum allocation amount, geographic availability. |
| `GET /public/Assets` | Secondary. Returns metadata for all assets on the platform — asset class, display precision, human-readable altnames. |

**API reference:** <https://docs.kraken.com/api/docs/rest-api/list-strategies> — read this as your reference for what the provided `.json` mock files represent. Your solution should mock the calls to the endpoint and simply leverage the local `.json` files as responses. See Provided Mock Data below for details.

### Expected Output

Aurora's requirements are defined above. How you structure your logic, apply the filters, and implement the tier model is up to you — we are evaluating the result and the decisions behind it, not a specific implementation path.

Your endpoint must return a JSON array where each item matches the following shape:

```json
{
  "strategyId": "ESETH01",
  "asset": "ETH",
  "displayName": "Ethereum Flexible Staking",
  "lockType": "instant",
  "apyDisplay": "4.25%",
  "apyValue": 4.25,
  "eligibleTiers": ["Standard", "Premium", "Private"],
  "minimumAmount": "0.0001"
}
```

Two hard constraints on the output: results **must** be sorted by APY descending, and if the data source is unavailable or malformed, the response **must** be a structured error object — never a raw exception.

### Service Interface

Expose your logic as a simple HTTP service with at least one endpoint:

```
GET /earn-products?tier={tier}
```

Accepts `tier` as a query param (`standard`, `premium`, or `private`) and returns the filtered, formatted asset list.

**Single-command run requirement**

Your solution must run via `docker-compose up` from the root of your repository — no additional setup steps or commands. A reviewing engineer will clone your repo and run `docker-compose up`. If it does not work out of the box, the submission will not be evaluated.

- Include a `Dockerfile` and `docker-compose.yml` at the root of your repository
- Service must be accessible at `http://localhost:3000` after `docker-compose up` completes
- No credentials, environment variables, or manual configuration should be required to run

**Network isolation (grading environment)**

When we grade your submission, we run it in an isolated environment:

- **Build-time network is open** — your `Dockerfile` can `RUN cargo build`, `RUN npm install`, `RUN apt-get install`, etc., as normal. Dependency fetching from crates.io / registry.npmjs.org / Docker Hub / etc. works.
- **Runtime network is closed** — the running container has **no outbound network access**. Your service must not attempt to call the internet at runtime. All data it needs must come from the mounted `data/` directory.
- **Only use the default compose network.** If your `docker-compose.yml` declares a custom `networks:` block, the grading pipeline will reject the submission before building.

### Provided Mock Data

We provide `data/strategies.json` and `data/assets.json` in this repository. These files contain mock strategy and asset data based on the real Kraken Earn/Strategies API schema and include enough variety to exercise your filtering and tier logic.

- Your service should read from the mounted `data/` directory rather than making live API calls
- **Read all JSON files found in the directory** — additional test data files may be added during scoring
- The mock data uses real field names from the API docs

**Scoring note:** when your submission is reviewed, additional JSON files may be added to the `data/` directory to test edge case handling. Your service should handle any valid file in the directory, not just the sample files provided.

## AI Usage

Using AI tools (Claude Code, Cursor, Codex, Copilot, etc.) is **expected and evaluated** — not just permitted. We want to see how you use AI, not just whether you used it.

### AI Transcript — Required Submission

Export your full AI conversation transcript(s) and include them in your repository as `ai-transcript.md` (or the native export format from your tool — e.g., an exported Claude conversation, a Cursor chat history, etc.). If you used multiple tools or sessions, include all of them.

We will review your transcript directly and assess it across four dimensions:

| Dimension | What we are looking for in the transcript |
|---|---|
| Effective prompting | Are prompts clear, specific, and tailored to the task? |
| Critical evaluation | How did you review AI output and decide to accept, revise, redirect, or reject? The reasoning is more important than the outcome. |
| Iterative refinement | How did you work with AI agents over time? Did the solution evolve across turns? |
| Knowing the limits | Did you choose not to rely on AI in some cases? Which ones and why? |

> **Why a full transcript?** A written reflection can describe your process — the raw transcript shows it. We can see the actual prompts you wrote, how the AI responded, where you pushed back, where you accepted output, and how the solution evolved.

## Submission Package

Submit a link to a GitHub/GitLab repository (public or private with reviewer access) containing:

| Deliverable | Contents |
|---|---|
| Working code | TypeScript or Rust service implementing the requirements · `Dockerfile` and `docker-compose.yml` at the repository root · runs via `docker-compose up` with no additional steps · service accessible at `http://localhost:3000` |
| `README.md` | Any context a reviewer needs beyond `docker-compose up` · brief explanation of your architecture decisions · key dependencies with a note on why each is safe to use · any known limitations or things you would improve with more time |
| `ai-transcript.md` | Your full AI conversation transcript(s) from the session(s) used to build this — see AI Transcript above · if using multiple tools or sessions, include all of them |
| `solution-design-note.md` | A handoff document written as if passing this integration to Aurora Bank's engineering team · include: what was built, key API calls and their purpose, how the tier logic works, known edge cases, and suggested next steps toward production · target audience: a mid-level backend engineer at Aurora Bank — not an internal reader · bullet points are fine |

> **On the solution design note** — this document matters a lot. In this role, you will regularly produce these kinds of handoff artefacts for implementation teams. We are evaluating your ability to communicate technical decisions clearly to an external engineering audience — without jargon, without assuming internal context, and with the right level of detail for a team that has to implement from scratch.

## Evaluation

We review submissions holistically. The areas we pay attention to:

- **Schema & Data Handling** — how well you understood the API contract from the documentation provided and translated it into your data model.
- **Business Logic Implementation** — how cleanly Aurora's requirements turned into a correct, well-structured solution.
- **Code Quality & Production Signals** — whether the result reads as work a teammate could pick up and ship without you in the room.
- **AI Usage Sophistication** — how deliberately and critically you used AI as part of your workflow, evaluated from the transcript you submit.
- **Communication & Documentation** — whether your written artefacts (design note, README) let an external engineer continue the work.

We are looking for thoughtful engineering judgement throughout — across both the code you wrote and the decisions you made along the way.

## Frequently Asked Questions

| Question | Answer |
|---|---|
| Can I use TypeScript or Rust? | Yes, your choice. We use both in the Solutions Engineering practice. Pick whichever lets you move fastest and produce your best work. |
| Can I use third-party libraries? | Yes. Use whatever helps you move fast and produce quality code. For each key dependency, include a brief note in your README on why it is a safe choice from a security / use-case perspective. |
| How polished does the code need to be? | Production-ready judgment, not production-ready code. We do not expect full test coverage or a deployment pipeline. We do expect you to handle errors and structure the code as if a colleague will read it. |
| What if I cannot finish everything? | Submit what you have. Document what is missing and what you would do with more time. Partial, honest work is better than overstated complete work. |

---

*Good luck! We are rooting for you.*

*Solutions Engineering · May 2026*
