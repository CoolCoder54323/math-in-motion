#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARX_DIR="${SEARX_DIR:-$ROOT_DIR/ops/searxng}"
SURGE_DIR="${SURGE_DIR:-$ROOT_DIR/surge/searxng-portal}"
DOMAIN="${1:-<your-surge-domain>.surge.sh}"

if [[ ! -f "$SEARX_DIR/.env" ]]; then
  echo "Missing $SEARX_DIR/.env. Copy env.template and fill required values."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not found in PATH."
  exit 1
fi

cd "$SEARX_DIR"
docker compose --env-file .env up -d

echo "SearXNG started on http://127.0.0.1:8080"
echo "Deploy portal via Surge (after: npm i -g surge && surge login):"
echo "  surge $SURGE_DIR $DOMAIN"

echo "Tip: For another project, copy ops/searxng + surge/searxng-portal and set SEARX_DIR/SURGE_DIR env vars."
