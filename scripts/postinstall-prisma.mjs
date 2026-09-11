import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.SKIP_PRISMA_GENERATE === '1') {
  process.exit(0);
}

const prismaCli = join('node_modules', 'prisma', 'package.json');
if (!existsSync(prismaCli)) {
  console.log('prisma CLI not installed, skipping client generation');
  process.exit(0);
}

execSync(
  'npx prisma generate --schema prisma/schema.prisma',
  { stdio: 'inherit' },
);
