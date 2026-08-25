import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { signWebhookPayload } from '../common/security/webhook-signature';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly maxAttempts = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async notifyTaskArchived(
    taskId: number,
    title: string,
    archivedAt: Date,
  ): Promise<void> {
    const notifyUrl = this.config.get<string>('NOTIFY_URL');
    if (!notifyUrl) {
      this.logger.warn('NOTIFY_URL is not configured; skipping notification');
      return;
    }

    const payload = {
      taskId,
      title,
      archivedAt: archivedAt.toISOString(),
    };
    const rawBody = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Extra: firma HMAC para que el receptor verifique autenticidad
    const notifySecret = this.config.get<string>('NOTIFY_SECRET');
    if (notifySecret) {
      headers['X-Geest-Signature'] = signWebhookPayload(rawBody, notifySecret);
    } else {
      this.logger.warn(
        'NOTIFY_SECRET is not set; sending notification without signature',
      );
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let httpStatus: number | null = null;
      let shouldRetry = false;

      try {
        const response = await fetch(notifyUrl, {
          method: 'POST',
          headers,
          body: rawBody,
          signal: AbortSignal.timeout(8000),
        });
        httpStatus = response.status;

        await this.prisma.notificationAttempt.create({
          data: {
            taskId,
            attemptNumber: attempt,
            httpStatus,
          },
        });

        if (response.ok) {
          return;
        }

        shouldRetry = response.status >= 500;
      } catch (error) {
        await this.prisma.notificationAttempt.create({
          data: {
            taskId,
            attemptNumber: attempt,
            httpStatus: null,
          },
        });
        shouldRetry = true;
        this.logger.warn(
          `Notification attempt ${attempt} failed for task ${taskId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }

      if (!shouldRetry || attempt === this.maxAttempts) {
        return;
      }

      const delayMs = 200 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  async listByTask(taskId: number) {
    return this.prisma.notificationAttempt.findMany({
      where: { taskId },
      orderBy: { attemptNumber: 'asc' },
      select: {
        id: true,
        attemptNumber: true,
        timestamp: true,
        httpStatus: true,
      },
    });
  }
}
