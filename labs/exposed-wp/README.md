# Vulnerable WordPress Lab

A local, **intentionally insecure** WordPress instance used to test the
enumeration tool. It is configured so that every enumeration vector the tool
implements is live.

> ⚠️ **For local testing only.** This instance is deliberately vulnerable
> (weak credentials, user enumeration enabled). It binds to `127.0.0.1` only.
> Never expose it to a network or the internet.

## Run

```bash
docker compose up -d        # start + auto-seed on first run (~30s)
docker compose logs -f wp-cli   # watch the seeding
docker compose down -v      # stop and wipe all data
```

Target URL: **http://localhost:8090**
Admin panel: http://localhost:8090/wp-admin  (`admin` / `admin123`)

## Seeded users (ground truth)

| Username | Role          | Password    |
|----------|---------------|-------------|
| `admin`  | administrator | `admin123`  |
| `editor` | editor        | `editor123` |
| `jsmith` | author        | `author123` |
| `awong`  | author        | `wong12345` |

Each user has a published post, so all four are discoverable via REST, author
archives, the user sitemap, oEmbed and feeds.

## Why these settings

- **Pretty permalinks** (`/%postname%/`) enable the `?author=N → /author/<slug>/`
  redirect vector.
- **A published post per user** makes every account visible to the REST users
  endpoint and author archives (WordPress only exposes users who have posts).
- **Weak admin password** (`admin123`) lets the login brute-force module succeed.
- **WordPress 6.4** ships the core user sitemap (`/wp-sitemap-users-1.xml`),
  added in 5.5.

This is standard WordPress configuration — the *target* is configured to be
enumerable; the tool itself is generic and makes no assumptions about it.
