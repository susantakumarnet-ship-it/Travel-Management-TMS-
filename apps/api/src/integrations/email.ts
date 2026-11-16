import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (env.EMAIL_DRIVER !== 'smtp' || !env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function emailLayout(title: string, bodyText: string): string {
  const paragraphs = bodyText
    .split('\n')
    .map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0b1f4b;padding:20px 28px;color:#d4af37;font-size:20px;font-weight:700;letter-spacing:.5px">ROYAL RIDE</td></tr>
  <tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6">
  <h2 style="margin:0 0 16px;color:#0b1f4b;font-size:18px">${escape(title)}</h2>${paragraphs}</td></tr>
  <tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px">${escape(env.COMPANY_NAME)} · ${escape(env.COMPANY_ADDRESS)}</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, text: string) {
  const t = getTransporter();
  if (!t) {
    logger.info(`[Email:console] to ${to}: ${subject} — ${text.replace(/\n/g, ' | ')}`);
    return { ok: true, providerId: 'console' };
  }
  try {
    const info = await t.sendMail({ from: env.EMAIL_FROM, to, subject, text, html: emailLayout(subject, text) });
    return { ok: true, providerId: info.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
