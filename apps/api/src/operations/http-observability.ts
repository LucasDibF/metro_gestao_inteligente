import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthRequest } from '../auth/auth.guard';
export function requestLog(req: Request, res: Response, next: () => void) {
  const requestId = randomUUID(),
    started = performance.now();
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.on('finish', () =>
    console.log(
      JSON.stringify({
        event: 'http_request',
        requestId,
        method: req.method,
        route: req.route?.path ?? 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        tenantId: (req as Request & Partial<AuthRequest>).identity?.tenantId,
      }),
    ),
  );
  next();
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp(),
      res = context.getResponse<Response>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    console.error(
      JSON.stringify({
        event: 'http_internal_error',
        requestId: res.getHeader('X-Request-ID'),
        type: exception instanceof Error ? exception.constructor.name : 'Unknown',
      }),
    );
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
