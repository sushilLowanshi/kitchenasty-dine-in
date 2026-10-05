import path from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

/** Load packages/server/.env before Prisma/JWT/etc read process.env. */
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'packages/server/.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

/**
 * On Windows, `localhost` often resolves to IPv6 (::1). Docker Desktop's
 * published Postgres port is more reliable on IPv4 (127.0.0.1). Rewrite so
 * a machine that still has an old .env keeps working after git pull.
 */
if (process.platform === 'win32' && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /@(localhost|\[::1\]):/gi,
    '@127.0.0.1:',
  );
}
