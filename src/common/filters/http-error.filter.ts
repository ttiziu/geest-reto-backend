import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Unexpected error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = 'RATE_LIMIT_EXCEEDED';
        message = 'Too many requests, please try again later';
      } else if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        if (typeof obj.code === 'string') code = obj.code;
        else code = HttpStatus[status] ?? 'HTTP_ERROR';

        if (Array.isArray(obj.message)) {
          message = obj.message.join('; ');
          code = 'VALIDATION_ERROR';
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      error: { code, message },
    });
  }
}
