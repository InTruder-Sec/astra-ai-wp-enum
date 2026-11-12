# Test Targets (Labs)

A collection of **intentionally-vulnerable**, **local-only** WordPress targets
used to develop and test the enumeration tool. Testing against more than one
target keeps the tool honest: it must work on both a fully-exposed site and a
more realistic, partially-hardened one.

> ⚠️ Every target here is deliberately insecure. Run them on `localhost` only.
> Never expose them to a network or the internet.

## Available targets

| Lab | Type | URL | Seeded users | Notes |
|-----|------|-----|--------------|-------|
| [`exposed-wp/`](./exposed-wp) | Our lab (WP 6.4, Docker) | http://localhost:8090 | `admin`, `editor`, `jsmith`, `awong` | **All vectors live** (REST, author, sitemap, oEmbed, feed, XML-RPC). Weak admin password for brute-force. |
| [`vwp/`](./vwp) | External — Damn Vulnerable WP fork (WP 4.8) | http://127.0.0.1:8081 | `admin`, `editor`, `choi` | Realistic/hardened: only `admin` is *discoverable*; others require confirmation. Referenced, not vendored. |

## Why two targets

- **`exposed-wp`** is the clean case — every technique the tool implements
  succeeds, so it's ideal for demos and end-to-end verification.
- **`vwp`** is the hard case — plain permalinks and users without posts mean the
  REST/author vectors only yield `admin`, forcing the tool to combine techniques
  and fall back (e.g. `?rest_route=`). It validates graceful degradation.

## Contributing a new target

Add a folder under `labs/` containing:

1. A `docker-compose.yml` (or clear run instructions if the lab is external).
2. A `README.md` documenting: how to start/stop it, the target URL, the seeded
   users (ground truth), and which enumeration vectors it exercises.
3. A `localhost`-only binding and an explicit "intentionally vulnerable" warning.

Keep external labs **referenced** (clone instructions + source link), not copied
in, to respect their licensing and authorship.
