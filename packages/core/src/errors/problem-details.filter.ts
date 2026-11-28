import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { PROBLEM_CONTENT_TYPE } from '@lga/contracts';
import { stripQuery } from '@lga/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { reportError } from '../observability/sentry.js';
import { toProblem } from './to-problem.js';

/**
 * Global exception filter: every error leaves the API as RFC 9457 problem details.
 * Stack traces and internal messages never reach clients (logged with the requestId instead).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: unknown }>();
    const res = http.getResponse<Response>();
    const requestId = typeof req.id === 'string' ? req.id : undefined;

    const { problem, logLevel } = toProblem(exception, {
      instance: stripQuery(req.originalUrl || req.url),
      requestId,
    });

    if (logLevel === 'error') {
      this.logger.error(
        { err: exception, code: problem.code, status: problem.status },
        'Request failed',
      );
      // 5xx and unexpected errors only; expected 4xx DomainErrors never reach Sentry.
      reportError(exception, { requestId, status: problem.status, code: problem.code });
    } else {
      this.logger.warn({ code: problem.code, status: problem.status }, problem.title);
    }

    if (res.headersSent) return;
    const retryAfter = problem.retryAfterSeconds;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      res.setHeader('Retry-After', String(Math.ceil(retryAfter)));
    }
    res.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}
