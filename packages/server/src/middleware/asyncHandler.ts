import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Forward async route errors to Express error middleware (Express 4). */
export function asyncHandler<P = unknown>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Request<P>, res, next)).catch(next);
  };
}
