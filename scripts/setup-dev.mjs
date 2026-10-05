#!/usr/bin/env node
/**
 * One-command local setup after git clone / git pull:
 *  1) Ensure packages/server/.env exists (from .env.example)
 *  2) Normalize Windows-friendly DATABASE_URL (127.0.0.1:5433)
 *  3) Start Docker Postgres + Mailhog
 *  4) Wait until Postgres accepts connections
 *  5) Prisma migrate deploy + seed
 *
 * Usage: npm run setup
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envExample = path.join(root, 'packages', 'server', '.env.example');
const envFile = path.join(root, 'packages', 'server', '.env');

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

function ensureEnv() {
  if (!existsSync(envExample)) {
    console.error('Missing packages/server/.env.example — cannot create .env');
    process.exit(1);
  }

  if (!existsSync(envFile)) {
    copyFileSync(envExample, envFile);
    console.log('Created packages/server/.env from .env.example');
  } else {
    console.log('packages/server/.env already exists (keeping your local values)');
  }

  let contents = readFileSync(envFile, 'utf8');
  const before = contents;

  // Prefer IPv4 + Docker host port 5433 for local hybrid dev.
  contents = contents.replace(
    /^(DATABASE_URL=postgresql:\/\/kitchenasty:kitchenasty@)(localhost|\[::1\]|127\.0\.0\.1):(\d+)/m,
    '$1' + '127.0.0.1:5433',
  );

  if (contents !== before) {
    writeFileSync(envFile, contents, 'utf8');
    console.log('Normalized DATABASE_URL → 127.0.0.1:5433 (Docker Compose host port)');
  }
}

function dockerAvailable() {
  const result = runCapture('docker', ['version']);
  return result.status === 0;
}

function sleepSeconds(seconds) {
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Seconds ${seconds}`], {
      stdio: 'ignore',
    });
  } else {
    spawnSync('sleep', [String(seconds)], { stdio: 'ignore' });
  }
}

function waitForPostgres(maxAttempts = 30) {
  console.log('Waiting for Postgres (kitchenasty-db) to become ready...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = runCapture('docker', [
      'exec',
      'kitchenasty-db',
      'pg_isready',
      '-U',
      'kitchenasty',
    ]);
    if (result.status === 0) {
      console.log('Postgres is ready.');
      return;
    }
    process.stdout.write(`  attempt ${attempt}/${maxAttempts}...\r`);
    sleepSeconds(2);
  }
  console.error('\nPostgres did not become ready. Try: npm run db:fix');
  process.exit(1);
}

function loadDatabaseUrl() {
  const text = readFileSync(envFile, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    console.error('DATABASE_URL missing in packages/server/.env');
    process.exit(1);
  }
  return match[1].trim().replace(/^["']|["']$/g, '');
}

console.log('=== KitchenAsty local setup ===\n');
ensureEnv();

if (!dockerAvailable()) {
  console.error('Docker is not available. Install/start Docker Desktop, then re-run: npm run setup');
  process.exit(1);
}

console.log('\nStarting Docker services: postgres + mailhog');
run('docker', ['compose', 'up', '-d', 'postgres', 'mailhog']);
waitForPostgres();

const databaseUrl = loadDatabaseUrl();
const env = { ...process.env, DATABASE_URL: databaseUrl };

console.log('\nRunning Prisma migrate deploy...');
run(
  'npx',
  ['-w', 'packages/server', 'prisma', 'migrate', 'deploy', '--schema', '../../prisma/schema.prisma'],
  { env },
);

console.log('\nSeeding database (safe to skip if data already exists)...');
const seed = spawnSync(
  'npx',
  ['-w', 'packages/server', 'prisma', 'db', 'seed'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  },
);
if (seed.status !== 0) {
  console.warn(
    '\nSeed did not complete (often OK if the database was seeded before). Continuing…',
  );
} else {
  console.log('Seed completed.');
}

console.log(`
=== Setup complete ===

Hybrid local (Docker DB + npm apps):
  npm run dev:server       → http://localhost:3000
  npm run dev:admin        → http://localhost:5173
  npm run dev:storefront   → http://localhost:5174

Login: admin@kitchenasty.com / admin123

Full stack in Docker instead:
  npm run docker:full

If login shows "Can't reach database server":
  npm run db:fix
  then restart: npm run dev:server
`);
