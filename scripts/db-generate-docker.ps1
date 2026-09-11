$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$mount = ($root -replace '\\', '/')
if ($mount -match '^([A-Za-z]):') {
  $mount = '/' + $matches[1].ToLower() + $mount.Substring(2)
}

docker run --rm `
  -v "${mount}:/app" `
  -v "${mount}/certs/netskope-ca-bundle.crt:/etc/ssl/certs/netskope-ca-bundle.crt:ro" `
  -e NODE_EXTRA_CA_CERTS=/etc/ssl/certs/netskope-ca-bundle.crt `
  -w /app `
  node:22 `
  npx prisma generate --schema prisma/schema.prisma
