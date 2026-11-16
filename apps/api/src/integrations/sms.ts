import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface SmsResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * MSG91 Flow API. Templates must be DLT-approved; the OTP template uses ##var1## for the code,
 * the transactional template uses ##var1## for the full message body.
 */
async function msg91Send(phone: string, templateId: string, vars: Record<string, string>): Promise<SmsResult> {
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      template_id: templateId,
      short_url: '0',
      recipients: [{ mobiles: `91${phone}`, ...vars }],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || data.type === 'error') return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  return { ok: true, providerId: data.message };
}

export async function sendOtpSms(phone: string, otp: string): Promise<SmsResult> {
  if (env.SMS_DRIVER === 'console' || !env.MSG91_AUTH_KEY) {
    logger.info(`[SMS:console] OTP for ${phone}: ${otp}`);
    return { ok: true, providerId: 'console' };
  }
  return msg91Send(phone, env.MSG91_OTP_TEMPLATE_ID, { var1: otp });
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  if (env.SMS_DRIVER === 'console' || !env.MSG91_AUTH_KEY || !env.MSG91_FLOW_TEMPLATE_ID) {
    logger.info(`[SMS:console] to ${phone}: ${message}`);
    return { ok: true, providerId: 'console' };
  }
  return msg91Send(phone, env.MSG91_FLOW_TEMPLATE_ID, { var1: message.slice(0, 300) });
}
