# MaxiStep — agentic customer support

Multi-agent support desk for MaxiStep, a fictional Indian shoe store. A **router
agent** classifies every incoming message and delegates it to one of three
specialists, which answer using tools that read a real Postgres database.

| | |
|---|---|
| App | https://maxistep-web.vercel.app |
| Storefront demo (widget in an iframe) | https://maxistep-web.vercel.app/demo.html |
| API health | https://maxistep-api.vercel.app/health |
| Eval report | https://maxistep-api.vercel.app/api/evals |

Turborepo · Hono · Vercel AI SDK v7 · Drizzle · Neon Postgres · React · Tailwind.
End-to-end types via Hono RPC — no codegen.

---

## How a turn works

```
message
  → router          heuristic → classifier → fallback
  → specialist      support | order | billing
  → tools           read Postgres, enforce policy in code
  → stream          typed data parts: route, tool chips, errors
  → persist
```

**Routing is three tiers.** A high-precision regex handles unambiguous ids
(`ORD-1042` → order) with no model call at all. Anything else goes to a
classifier at `temperature: 0`. Below 0.5 confidence it refuses to commit and
hands to support for a clarifying question — a good outcome, not a failure.

The fast path **stands down whenever two domains compete**: `"I was charged
twice for ORD-1041"` carries an order number but is a billing question, so the
regex defers rather than guessing.

## Business rules live in code, not prompts

Prompts are suggestions; code is a guarantee. So the rules that must hold are
enforced in the tools, which return a structured refusal *and the reason*, so
the agent can explain the policy and offer the real alternative:

- `cancelOrder` refuses once an order has shipped, and points at returns.
- `startReturn` refuses outside the 14-day window, refuses a duplicate return,
  and refuses an exchange into a size that is out of stock — offering the
  nearest size that actually exists.
- A defect past the window is routed to the 6-month sole warranty, which does
  cover worn shoes.

Tools never throw on a miss. They return `{ found: false, message }`, because a
throw ends the agent loop while a structured miss lets the model recover by
asking the customer for what it needs.

## Failure handling

- **Provider failover.** Models are selected by *role* (`router` / `agent` /
  `summary`), never by name at the call site. `withFallback` wraps the primary
  in AI SDK middleware: on a retryable error — quota, 429, overloaded — the same
  call transparently retries on OpenRouter. Router, all three specialists and
  the summariser inherit it without a line of failover logic between them.
  This is not theoretical: Gemini's free tier is 5 requests/minute, and the
  entire routing eval suite below was served by the fallback.
- **The router never throws.** A dead classifier degrades to the generalist
  with `confidence: 0` rather than taking the conversation down.
- **Mid-stream failures** travel as a `data-error` stream part, because once
  headers are sent an HTTP status is no longer available.
- **One error envelope** for everything pre-stream; unexpected errors are logged
  in full and reported generically, so nothing leaks a connection string.
- **Sliding-window rate limiting** with `429` + `Retry-After`.

## Evals

`pnpm eval` — a dataset, graders, thresholds and a report. No framework.

```
routing      13 cases   gate 0.85
behaviour     7 cases   gate 0.90
failure       5 cases   gate 1.00
```

Three suites:

- **routing** — 13 labelled messages including the adversarial ones, graded on
  agent, intent, which tier decided, and whether low confidence correctly fell
  back.
- **behaviour** — real turns against the seeded database, graded on the tool
  *trajectory* (was `checkDeliveryStatus` called, with `ORD-1042`?) and on
  **grounding**: every identifier, tracking number and `₹` amount in the reply
  must appear in a tool result from that same turn. That grader is deterministic
  — a hallucinated order number is an automatic fail, no LLM judge required.
- **failure** — the degradation paths, graded directly against the real
  implementations so they need no live provider: dead classifier, competing
  heuristics, retryable-vs-real error classification, the error envelope, and
  rate limiting.

Each suite has a **gate**; `pnpm eval` exits non-zero below it, so a routing
regression fails CI. The report is written to `packages/evals/report/latest.json`
and served at `/api/evals`.

Cases are plain data and graders are pure functions behind a stable `Grader`
interface — `run.ts` is the only runner-aware file. Swapping in Evalite, or
pushing results to Langfuse, means replacing that one file.

One thing to know when reading a run: routing and behaviour drive real turns, so
a case whose failure detail reads `empty reply` or `HTTP 429` is the provider
giving out, not the agent behaving badly. The `failure` suite is deterministic
and needs no provider, which is why the degradation paths live there.

## Run it

```bash
cp .env.example .env     # DATABASE_URL + GOOGLE_GENERATIVE_AI_API_KEY
pnpm install
pnpm db:push && pnpm db:seed
pnpm dev                 # api :3001, web :5173
pnpm eval
```

Set `OPENROUTER_API_KEY` and `FALLBACK_MODEL` too — on a free Gemini key the
demo stalls within a minute without the failover.

## Layout

```
apps/api        Hono. routes → controllers → services → repositories.
                agents/ holds the router, the specialists, and their tools.
                Repositories are the only Drizzle importers.
apps/web        React + Tailwind. Streaming chat, routing card, live tool chips.
packages/db     Drizzle schema and the seed.
packages/shared Types and zod schemas shared across the wire.
packages/evals  Cases, graders, runner, thresholds.
packages/widget Embeddable launcher — the storefront demo loads it in an iframe.
```

## Tradeoffs

- **Rate limiting is in-process.** Correct on one instance; behind N instances
  the effective limit is N×. Swapping in Redis replaces a `Map`.
- **No authentication.** "The current user" resolves to the seeded customer in
  one middleware; every layer below already reads identity from request context,
  which is where a real session would put it.
- **Knowledge-base search is ILIKE**, not full-text. Honest at seed scale.
- **Token estimation is `length / 4`.** It only decides *when* to compact.
- **No LLM judge yet.** Grounding is deterministic and catches the failure that
  matters most; helpfulness scoring is the phase-2 addition, alongside online
  evals on sampled production traffic.
