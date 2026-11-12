# vwp — Damn Vulnerable WordPress (external target)

This is an **external** lab, referenced here rather than vendored in. It is a
realistic, partially-hardened WordPress 4.8 instance useful for testing how the
tool degrades when the easy vectors are not fully available.

- **Source:** https://github.com/ChoiSG/vwp
  (a fork of [vavkamil/dvwp](https://github.com/vavkamil/dvwp))
- **WordPress:** 4.8 (predates the core user sitemap added in 5.5)
- **Target URL:** http://127.0.0.1:8081

## Run it

```bash
git clone https://github.com/ChoiSG/vwp.git
cd vwp
# The site's URL is built from $IP_ADDRESS; set it so links resolve correctly.
export IP_ADDRESS=127.0.0.1 HOST_IP_ADDRESS=127.0.0.1
docker compose up -d --build       # amd64 images; runs under emulation on ARM
```

Stop and wipe:

```bash
docker compose down --volumes
```

## Gotchas observed

- The site's `siteurl` is set to `http://127.0.0.1:8081`, so requests to
  `localhost:8081` get a **301 redirect**. Always target `127.0.0.1:8081`.
- With **plain permalinks**, the pretty `/wp-json/` route is not served — use the
  `?rest_route=/wp/v2/users` form (the tool does this automatically).
- Plugin installs in the bundled old `wp-cli` image can fail on TLS; this only
  affects the (bonus) plugin vulns, not user enumeration.

## Seeded users (ground truth)

| Username | Discoverable as-is? |
|----------|---------------------|
| `admin`  | Yes — REST (`?rest_route`), oEmbed |
| `editor` | No — has no published post; only *confirmable* via login-error / XML-RPC |
| `choi`   | No — same as above |

This is exactly why the tool combines multiple techniques instead of relying on
a single vector.
