# wp-user-enum

An AI-driven WordPress user enumeration tool for authorized security testing. It
fingerprints a target, lets an AI agent decide which enumeration techniques are
worth running against *that* target, recovers usernames through multiple vectors,
optionally brute-forces the admin login, and produces a readable report.

It is built to run against **intentionally-vulnerable or self-hosted WordPress
instances only**. Two local test targets are included under `labs/`.

---

## Approach

I treated the AI as a decision-maker over a fixed, tested toolbox. A security
tool has to send the exact right request every time and be reproducible, so the
enumeration techniques themselves are plain, unit-testable code. The intelligence
sits around them:

1. **Recon first.** Before any enumeration, a passive pass fingerprints the
   target — is it WordPress, what version, pretty or plain permalinks, which
   surfaces are exposed (REST users, XML-RPC, user sitemap, oEmbed), and any
   leaked files (`readme.html`, `debug.log`).
2. **The AI plans from the recon.** Given the recon signals and a description of
   each available technique, the agent chooses which techniques to run, in what
   order, and whether a brute-force is warranted. It only ever selects from the
   real registry — it cannot invent a technique.
3. **Run, brute-force, summarize.** The selected techniques run, their results
   are merged and de-duplicated, the admin login is brute-forced (opt-in), and
   the agent writes a risk-framed summary report.

Every AI touchpoint has a **deterministic fallback**, so the tool runs fully
without any API key — it just swaps the model's judgement for sensible rules.

### Why this design

- **Reliability / reproducibility** — techniques are deterministic and testable.
- **Predictable traffic** — the agent selects from a known set of techniques, so
  every request sent is one of a small, auditable set.
- **Meaningful AI** — the model does the things models are genuinely good at:
  choosing a strategy from context, prioritising password guesses from findings,
  and writing the report. None of it is bolted on.
- **Expandable** — adding a technique is one new file plus one line in the
  registry; the planner picks it up automatically via its `isRelevant(recon)`
  hook and its description.

---

## Pipeline

```
CLI (--url, flags)
   │
   ▼
Config  ──►  Safety guard (local-only unless --allow-remote)
   │
   ▼
Recon  ──►  ReconResult (version, permalinks, signals, findings)
   │
   ▼
Planner  ──►  EnumerationPlan   (AI selects techniques, or deterministic)
   │
   ▼
Technique registry  ──►  rest_api · author_archive · user_sitemap · oembed · login_error
   │                      (each goes through one hardened HTTP client)
   ▼
Merge + de-dupe users
   │
   ▼
Brute-force (opt-in)  ──►  AI/deterministic password strategy over rockyou
   │
   ▼
Summary (AI or templated)  ──►  Report  ──►  pretty CLI  /  JSON
```

---

## Architecture

| Module | Responsibility |
|--------|----------------|
| `src/types.ts` | Shared shapes (`ReconResult`, `EnumerationPlan`, `DiscoveredUser`, `ScanReport`). |
| `src/config.ts` | Flag/env resolution, AI provider auto-selection, local-target safety guard. |
| `src/http/client.ts` | One `fetch` wrapper: timeout, retries, never throws on network errors. |
| `src/recon/wpScan.ts` | Passive fingerprinting → `ReconResult`. |
| `src/techniques/` | One file per enumeration vector + the registry (`index.ts`). |
| `src/bruteforce/login.ts` | Password-spray against `wp-login.php`. |
| `src/bruteforce/wordlist.ts` | Fetches + caches the rockyou wordlist from GitHub. |
| `src/agent/providers.ts` | Builds the OpenAI/Anthropic model from config. |
| `src/agent/planner.ts` | Recon → technique plan (AI or deterministic). |
| `src/agent/bruteStrategy.ts` | AI/deterministic password prioritisation from findings. |
| `src/agent/summary.ts` | AI or templated risk summary. |
| `src/agent/orchestrator.ts` | Runs the whole pipeline into a `ScanReport`. |
| `src/report/output.ts` | Pretty CLI and JSON renderers. |
| `src/index.ts` | The CLI entry point. |

### Agent design

The planner and the summary are [Mastra](https://mastra.ai) agents. The model is
chosen at runtime from whichever API key is present (`OPENAI_API_KEY` or
`ANTHROPIC_API_KEY`); with both set, `AI_PROVIDER` decides. With neither, the
same functions run in deterministic mode. The planner returns a structured,
schema-validated plan, and its chosen technique ids are filtered against the real
registry before anything runs.

---

## Enumeration techniques

| Technique | How it recovers usernames |
|-----------|---------------------------|
| `rest_api` | `GET /wp-json/wp/v2/users` (with a `?rest_route=` fallback for plain permalinks, and a per-id fallback when the list is restricted). Highest-signal vector. |
| `author_archive` | `GET /?author=N` → reads the `/author/<slug>/` redirect, or the author slug from the page body class on plain-permalink sites. |
| `user_sitemap` | `GET /wp-sitemap-users-1.xml` (WordPress ≥ 5.5) and parses the author URLs. |
| `oembed` | Resolves a published post, then reads `/wp-json/oembed/1.0/embed` for the author's name/slug. Often survives other hardening. |
| `login_error` | Submits wrong-password logins for common usernames and uses the valid-vs-invalid error wording to confirm which exist. |

Each technique declares `isRelevant(recon)` so the planner skips vectors whose
surface is absent (e.g. the user sitemap on a WordPress 4.8 target).

### Adding a technique

The tool is built to take more techniques without touching the rest of the code.
A new vector is a single file that implements the `Technique` interface —
`id`, `title`, `description`, `isRelevant(recon)`, and `run(ctx)` — added to the
`TECHNIQUES` array in `src/techniques/index.ts`. The planner then picks it up
automatically from its description and relevance hook, and it reuses the same
HTTP client, result shape, and reporting. Nothing else changes. A technique that
needs extra inputs or a specific attack vector can extend the `TechniqueContext`
it receives.

---

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env     # optional — the tool runs without any key
npm run build
```

### Configuration (`.env`)

```
OPENAI_API_KEY=            # optional
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=         # optional
ANTHROPIC_MODEL=claude-haiku-5-5
AI_PROVIDER=              # "openai" | "anthropic" — only needed if both keys set
WP_TARGET_URL=http://localhost:8090
```

If no key is set, the tool runs in deterministic mode and still produces full
results (the AI plan/summary become rule-based).

---

## Usage

```bash
# Build first, then:
node dist/index.js --url http://localhost:8090

# Or run directly from source:
npm run dev -- --url http://localhost:8090
```

### Flags

| Flag | Description |
|------|-------------|
| `-u, --url <url>` | Target URL (or set `WP_TARGET_URL`). |
| `-f, --format <pretty\|json>` | Output format (default `pretty`). |
| `--brute` | Enable the login brute-force (opt-in). |
| `--max-attempts <n>` | Brute-force attempt cap (default 40). |
| `--password-file <path>` | Use a custom wordlist instead of rockyou. |
| `--author-range <n>` | Highest author id to probe (default 10). |
| `--provider <openai\|anthropic>` | Force the AI provider. |
| `--timeout <ms>` / `--retries <n>` | Network tuning. |
| `--allow-remote` | Allow non-local targets (authorized use only). |

### Examples

```bash
# Full run with brute-force (deterministic, no key needed)
node dist/index.js --url http://localhost:8090 --brute

# AI mode (Anthropic) with JSON output
ANTHROPIC_API_KEY=sk-... node dist/index.js --url http://localhost:8090 --brute --format json
```

---

## Test targets (`labs/`)

Two local, intentionally-vulnerable WordPress instances are provided for testing.
See `labs/README.md` for details.

```bash
# Our lab — WordPress 6.4, every vector exposed, port 8090
cd labs/exposed-wp && docker compose up -d
```

- **`labs/exposed-wp`** (WordPress 6.4, Docker) seeds four users — `admin`,
  `editor`, `jsmith`, `awong` — each with a published post, and a weak admin
  password (`admin123`). All enumeration vectors are live.
- **`labs/vwp`** references the external [Damn Vulnerable WordPress fork](https://github.com/ChoiSG/vwp)
  (WordPress 4.8, plain permalinks) as a more realistic, partially-hardened
  target.

---

## How it was tested

The tool was run end-to-end against both labs, in deterministic and AI modes:

| Target | Users recovered | Brute-force |
|--------|-----------------|-------------|
| `exposed-wp` (WP 6.4) | `admin`, `editor`, `jsmith`, `awong` (all 4) | `admin:admin123` |
| `vwp` (WP 4.8) | `admin`, `editor`, `choi` (all 3) | `admin:admin` |

Against `vwp`, the REST vector automatically uses the `?rest_route=` fallback
(plain permalinks don't serve the pretty route), the author-archive vector
recovers slugs from the page body, and the user-sitemap vector is correctly
skipped (WordPress 4.8 predates it). Edge cases verified: JSON output is valid,
the safety guard refuses non-local targets, and a non-WordPress target is handled
gracefully.

Unit-level verification is done against recorded HTTP responses so the parsing
logic can be tested without a live target.

---

## Limitations

- The AI's technique selection can be conservative and skip a vector; the
  deterministic mode always runs every relevant technique.
- `login_error` confirms common usernames via the error differential and will not
  discover unusual usernames on its own.
- rockyou is used as its frequency-top subset — the full 14M-entry list is
  impractical against a live login — so the AI prioritises targeted guesses from
  the findings. Use `--password-file` for a custom list.
- Authorized use only: non-local targets are refused unless `--allow-remote` is
  passed, and the brute-force is strictly opt-in.
