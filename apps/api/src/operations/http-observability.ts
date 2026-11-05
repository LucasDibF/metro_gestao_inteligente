import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageUnavailableError } from '@spt/private-storage';
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
interface ClientFailure {
  status: number;
  code: string;
  message: string;
}
const conflict = { status: 409, code: 'RECORD_CONFLICT', message: 'Record conflict' };
const forbidden = { status: 403, code: 'FORBIDDEN', message: 'Operation not allowed' };
const notFound = { status: 404, code: 'RECORD_NOT_FOUND', message: 'Record not found' };
const busy = { status: 503, code: 'DATABASE_BUSY', message: 'Service busy; try again' };
const prismaFailures: Record<string, ClientFailure> = {
  P2002: conflict,
  P2025: notFound,
  P2028: busy,
  P2034: busy,
};
// Raw queries surface as P2010 and unmapped ORM failures as P2039, both with the SQLSTATE below.
const sqlStateFailures: Record<string, ClientFailure> = {
  '23505': conflict,
  '23514': conflict,
  '42501': forbidden,
  '40001': busy,
  '40P01': busy,
  '55P03': busy,
};
export function clientFailure(exception: unknown): ClientFailure | null {
  if (exception instanceof StorageUnavailableError)
    return { status: 503, code: 'STORAGE_UNAVAILABLE', message: 'Storage unavailable' };
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const driver = exception.meta?.driverAdapterError as
    { cause?: { originalCode?: string } } | undefined;
  return (
    prismaFailures[exception.code] ?? sqlStateFailures[driver?.cause?.originalCode ?? ''] ?? null
  );
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
    const failure = clientFailure(exception);
    if (failure) {
      console.warn(
        JSON.stringify({
          event: 'http_dependency_error',
          requestId: res.getHeader('X-Request-ID'),
          code: failure.code,
        }),
      );
      res.status(failure.status).json({ code: failure.code, message: failure.message });
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
