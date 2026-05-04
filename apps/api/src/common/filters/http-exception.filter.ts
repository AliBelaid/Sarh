import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorEnvelope } from '../errors/error-envelope';

// Wraps any uncaught error in the Sijilli error envelope so the frontend
// always sees the same shape: { error: { code, message_ar, message_en } }.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorEnvelope = {
      error: {
        code: 'ERR_INTERNAL',
        message_ar: 'خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً.',
        message_en: 'Unexpected server error, please retry.',
      },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody) {
        body = responseBody as ErrorEnvelope;
      } else {
        const message =
          typeof responseBody === 'string'
            ? responseBody
            : (responseBody as { message?: string | string[] }).message;
        const flat = Array.isArray(message) ? message.join(' · ') : (message ?? exception.message);
        body = {
          error: {
            code: `ERR_HTTP_${status}`,
            message_ar: flat,
            message_en: flat,
          },
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${req.method} ${req.url} — ${exception.message}`, exception.stack);
    }

    res.status(status).json(body);
  }
}
