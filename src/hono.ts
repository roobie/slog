import { createMiddleware } from 'hono/factory';
import { getRuntimeKey } from 'hono/adapter';
import type { MiddlewareHandler } from 'hono';
import type { Logger } from './types.ts';

export type { Logger } from './types.ts';

export function slogMiddleware(logger: Logger): MiddlewareHandler {
  return createMiddleware<{ Variables: { logger: Logger } }>(async (c, next) => {
    const requestLogger = logger.withContext({
      requestId: c.req.header('cf-ray') ?? c.req.header('x-request-id') ?? crypto.randomUUID(),
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
    });

    c.set('logger', requestLogger);

    const start = performance.now();

    await next();

    // c.error is set by Hono's compose when a handler throws — it is caught
    // internally by Hono before it can propagate to our try/catch, so we
    // inspect c.error after next() instead.
    if (c.error) {
      requestLogger.error({
        message: 'request failed',
        error: c.error,
      });
    }

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
  });
}
