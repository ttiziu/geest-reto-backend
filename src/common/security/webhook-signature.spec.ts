import {
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhook-signature';

describe('webhook-signature (extra HMAC)', () => {
  const secret = 'test-notify-secret';
  const body = JSON.stringify({
    taskId: 1,
    title: 'Demo',
    archivedAt: '2026-08-24T23:00:00.000Z',
  });

  it('signs payload with sha256= prefix', () => {
    const signature = signWebhookPayload(body, secret);
    expect(signature.startsWith('sha256=')).toBe(true);
    expect(signature.length).toBeGreaterThan(20);
  });

  it('verifies a valid signature', () => {
    const signature = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature(body, secret, signature)).toBe(true);
  });

  it('rejects tampered body', () => {
    const signature = signWebhookPayload(body, secret);
    const tampered = body.replace('Demo', 'Hacked');
    expect(verifyWebhookSignature(tampered, secret, signature)).toBe(false);
  });
});
