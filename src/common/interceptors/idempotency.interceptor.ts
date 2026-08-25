import { createHash } from 'crypto';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../exceptions/app.exception';

const PENDING_STATUS = 0;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req.method !== 'POST') {
      return next.handle();
    }

    const keyHeader = req.headers['idempotency-key'];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;

    if (!key) {
      return next.handle();
    }

    const method = req.method;
    const path = (req.originalUrl || req.url).split('?')[0];
    const requestHash = this.hashBody(req.body);

    return from(this.begin(key, method, path, requestHash)).pipe(
      switchMap((decision) => {
        if (decision.type === 'replay') {
          res.status(decision.responseStatus);
          return of(decision.responseBody);
        }

        return next.handle().pipe(
          switchMap((body) =>
            from(
              this.finalize(key, method, path, res.statusCode || 201, body),
            ).pipe(switchMap(() => of(body))),
          ),
          catchError((error: unknown) =>
            from(this.finalizeError(key, method, path, error)).pipe(
              switchMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }

  private hashBody(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }

  private async begin(
    key: string,
    method: string,
    path: string,
    requestHash: string,
  ): Promise<
    | { type: 'execute' }
    | { type: 'replay'; responseStatus: number; responseBody: unknown }
  > {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_method_path: { key, method, path } },
    });

    if (existing) {
      return this.replayOrWait(existing, key, method, path, requestHash);
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          method,
          path,
          requestHash,
          responseStatus: PENDING_STATUS,
          responseBody: {},
        },
      });
      return { type: 'execute' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.waitForCompletion(key, method, path);
        return this.replayOrWait(raced, key, method, path, requestHash);
      }
      throw error;
    }
  }

  private async replayOrWait(
    existing: {
      requestHash: string;
      responseStatus: number;
      responseBody: Prisma.JsonValue;
    },
    key: string,
    method: string,
    path: string,
    requestHash: string,
  ): Promise<
    | { type: 'execute' }
    | { type: 'replay'; responseStatus: number; responseBody: unknown }
  > {
    if (existing.requestHash !== requestHash) {
      throw new AppException(
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used with a different request body',
        HttpStatus.CONFLICT,
      );
    }

    const row =
      existing.responseStatus === PENDING_STATUS
        ? await this.waitForCompletion(key, method, path)
        : existing;

    return {
      type: 'replay',
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
    };
  }

  private async waitForCompletion(key: string, method: string, path: string) {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      const row = await this.prisma.idempotencyKey.findUnique({
        where: { key_method_path: { key, method, path } },
      });

      if (!row) {
        throw new AppException(
          'IDEMPOTENCY_FAILED',
          'Idempotency record disappeared while waiting',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (row.responseStatus !== PENDING_STATUS) {
        return row;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new AppException(
      'IDEMPOTENCY_TIMEOUT',
      'Timed out waiting for a concurrent idempotent request to finish',
      HttpStatus.CONFLICT,
    );
  }

  private async finalize(
    key: string,
    method: string,
    path: string,
    status: number,
    body: unknown,
  ) {
    await this.prisma.idempotencyKey.update({
      where: { key_method_path: { key, method, path } },
      data: {
        responseStatus: status,
        responseBody: body as Prisma.InputJsonValue,
      },
    });
  }

  private async finalizeError(
    key: string,
    method: string,
    path: string,
    error: unknown,
  ) {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Prisma.InputJsonValue = {
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' },
    };

    if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();

      if (typeof response === 'string') {
        body = {
          error: {
            code: HttpStatus[status] ?? 'HTTP_ERROR',
            message: response,
          },
        };
      } else if (typeof response === 'object' && response !== null) {
        const obj = response as Record<string, unknown>;

        if (obj.error) {
          body = response as Prisma.InputJsonValue;
        } else if (Array.isArray(obj.message)) {
          body = {
            error: {
              code: 'VALIDATION_ERROR',
              message: (obj.message as string[]).join('; '),
            },
          };
        } else if (
          typeof obj.code === 'string' &&
          typeof obj.message === 'string'
        ) {
          body = { error: { code: obj.code, message: obj.message } };
        } else if (typeof obj.message === 'string') {
          body = {
            error: {
              code: HttpStatus[status] ?? 'HTTP_ERROR',
              message: obj.message,
            },
          };
        }
      }
    }

    await this.prisma.idempotencyKey.update({
      where: { key_method_path: { key, method, path } },
      data: {
        responseStatus: status,
        responseBody: body,
      },
    });
  }
}
