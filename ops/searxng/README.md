# Private SearXNG + Surge portal

Yes — this setup is reusable across projects.

## What this gives you

- A private SearXNG service in Docker (`127.0.0.1:8080` binding).
- A static Surge portal that links to your private search endpoint.

## Reuse in any project

You have two options:

1. **Copy-paste mode (fast):** copy `ops/searxng` and `surge/searxng-portal` into another repo.
2. **Shared infra mode (recommended):** keep this setup in one infra repo and point scripts to it with `SEARX_DIR` / `SURGE_DIR` env vars.

## 1) Configure

```bash
cp ops/searxng/env.template ops/searxng/.env
# edit ops/searxng/.env
openssl rand -hex 32
```

## 2) Start private SearXNG

```bash
./scripts/deploy-searxng-surge.sh
```

Or for custom locations:

```bash
SEARX_DIR=/path/to/ops/searxng SURGE_DIR=/path/to/surge/searxng-portal ./scripts/deploy-searxng-surge.sh my-search.surge.sh
```

## 3) Publish portal with Surge

```bash
npm i -g surge
surge login
```

Set your private SearXNG URL in `surge/searxng-portal/index.html` (`SEARCH_URL`), then deploy:

```bash
surge surge/searxng-portal your-portal-name.surge.sh
```

## Important limitations

- Surge is static-only hosting; it **cannot run SearXNG** directly.
- Treat the private SearXNG URL like sensitive infrastructure (VPN, auth proxy, or IP allowlist).
