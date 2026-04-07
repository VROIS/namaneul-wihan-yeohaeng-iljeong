/**
 * Stripe Webhook Handlers
 * 
 * Webhook 이벤트 처리:
 * - checkout.session.completed → 크레딧 충전
 * 
 * @created 2025-11-26
 */

import { getStripeSync } from './stripeClient';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);
  }
}
