import './env.js';
import { createServer } from 'http';
import { createApp } from './app.js';
import { initSocket } from './lib/socket.js';
import { serverLogger } from './lib/logger.js';
import prisma from './lib/db.js';

const PORT = process.env.PORT || 3000;

async function assertDatabase(retries = 10): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      serverLogger.warn(
        { attempt, retries, err: message },
        'Database not reachable yet — retrying',
      );
      if (attempt === retries) {
        serverLogger.error(
          'Cannot reach Postgres. For local Docker DB run: npm run db:fix  then restart this server.',
        );
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

async function main(): Promise<void> {
  await assertDatabase();

  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  process.on('unhandledRejection', (reason) => {
    serverLogger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    serverLogger.error({ err }, 'Uncaught exception');
  });

  httpServer.listen(PORT, () => {
    serverLogger.info(`KitchenAsty server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  serverLogger.error({ err }, 'Server failed to start');
  process.exit(1);
});
