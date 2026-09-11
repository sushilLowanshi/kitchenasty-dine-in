import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function hasPinoPretty(): boolean {
  try {
    // Dev-only dependency; Docker runtime installs with --omit=dev
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty =
  process.env.NODE_ENV !== 'production' &&
  process.env.NODE_ENV !== 'test' &&
  hasPinoPretty();

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : level,
  ...(usePretty && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export default logger;

export const serverLogger = logger.child({ module: 'server' });
export const emailLogger = logger.child({ module: 'email' });
export const smsLogger = logger.child({ module: 'sms' });
export const automationLogger = logger.child({ module: 'automation' });
export const metricsLogger = logger.child({ module: 'metrics' });
