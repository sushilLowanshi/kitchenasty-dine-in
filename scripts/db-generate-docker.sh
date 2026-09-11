#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm \
  -v "${ROOT}:/app" \
  -v "${ROOT}/certs/netskope-ca-bundle.crt:/etc/ssl/certs/netskope-ca-bundle.crt:ro" \
  -e NODE_EXTRA_CA_CERTS=/etc/ssl/certs/netskope-ca-bundle.crt \
  -w /app \
  node:22 \
  npx prisma generate --schema prisma/schema.prisma
