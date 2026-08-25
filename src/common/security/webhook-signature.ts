import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Firma HMAC-SHA256 del body JSON de la notificación.
 * El receptor puede recalcular la firma con el mismo secret y comparar.
 */
export function signWebhookPayload(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string,
): boolean {
  const expected = signWebhookPayload(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
