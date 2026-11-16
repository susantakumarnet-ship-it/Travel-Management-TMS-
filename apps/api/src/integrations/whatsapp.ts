import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface WhatsAppResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * WhatsApp Business Cloud API. Business-initiated messages must use pre-approved templates.
 * Create templates in Meta Business Manager with the names used in notifications/templates.ts
 * and body placeholders {{1}}, {{2}} … in the same order as `params`.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  template: string,
  params: string[],
  fallbackText: string,
): Promise<WhatsAppResult> {
  if (env.WHATSAPP_DRIVER === 'console' || !env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.info(`[WhatsApp:console] to ${phone} (${template}): ${fallbackText}`);
    return { ok: true, providerId: 'console' };
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${phone}`,
      type: 'template',
      template: {
        name: template,
        language: { code: env.WHATSAPP_TEMPLATE_LANG },
        components: params.length
          ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: text.slice(0, 1000) })) }]
          : [],
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message: string };
  };
  if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, providerId: data.messages?.[0]?.id };
}
