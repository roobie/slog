import { createMiddleware } from 'hono/factory';
import { getRuntimeKey } from 'hono/adapter';
import type { Logger } from './types.ts';

export type { Logger } from './types.ts';

export function slogMiddleware(logger: Logger) {
  return createMiddleware<{ Variables: { logger: Logger } }>(async (c, next) => {
    const requestLogger = logger.withContext({
      requestId: c.req.header('cf-ray') ?? c.req.header('x-request-id') ?? crypto.randomUUID(),
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
    });

    c.set('logger', requestLogger);

    const start = performance.now();

    try {
      await next();
    } catch (err) {
      requestLogger.error({
        message: 'request failed',
        error: err,
      });
      throw err;
    } finally {
      const duration = Math.round(performance.now() - start);
      requestLogger.info({
        message: 'request completed',
        status: c.res.status,
        duration,
      });

      const flushPromise = requestLogger.flush();
      if (getRuntimeKey() === 'workerd') {
        c.executionCtx.waitUntil(flushPromise);
      } else {
        await flushPromise;
      }
    }
  });
}
