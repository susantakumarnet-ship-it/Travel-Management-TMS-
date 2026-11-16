import type { NotificationChannel, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { sendSms } from '../../integrations/sms.js';
import { sendWhatsAppTemplate } from '../../integrations/whatsapp.js';
import { sendEmail } from '../../integrations/email.js';
import { env } from '../../config/env.js';

type Vars = Record<string, string | number | undefined | null>;

interface Template {
  title: string;
  /** Plain-text body with {placeholders}. Used for SMS, email and in-app. */
  text: string;
  /** WhatsApp template name and ordered params (must match Meta-approved template). */
  wa?: { name: string; params: string[] };
  channels: NotificationChannel[];
}

export const TEMPLATES = {
  CUSTOMER_REGISTERED: {
    title: 'Welcome to Royal Ride',
    text: 'Hi {name}, welcome to Royal Ride! Book premium cars for weddings, holidays and every special occasion at {appUrl}.',
    wa: { name: 'rr_welcome', params: ['name'] },
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  BOOKING_CREATED: {
    title: 'Booking received – {bookingNumber}',
    text: 'Your booking {bookingNumber} for {vehicle} on {pickupAt} is reserved. Pay the advance of {advance} within {holdMinutes} minutes to confirm it.',
    channels: ['IN_APP', 'EMAIL'],
  },
  BOOKING_CONFIRMED: {
    title: 'Booking confirmed – {bookingNumber}',
    text: 'Booking {bookingNumber} is confirmed! {vehicle}, pickup {pickupAt} from {pickup}. Amount paid: {paid}. Balance: {balance}. Track at {appUrl}/account/bookings/{bookingId}',
    wa: { name: 'rr_booking_confirmed', params: ['bookingNumber', 'vehicle', 'pickupAt', 'pickup', 'paid'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  PAYMENT_RECEIVED: {
    title: 'Payment received',
    text: 'We received {amount} for booking {bookingNumber} (ref {paymentRef}). Thank you!',
    wa: { name: 'rr_payment_received', params: ['amount', 'bookingNumber', 'paymentRef'] },
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  OWNER_NEW_BOOKING: {
    title: 'New booking – {bookingNumber}',
    text: 'New booking {bookingNumber} for {vehicle} ({registration}) on {pickupAt}. Pickup: {pickup}. Please review it in your partner portal.',
    wa: { name: 'rr_owner_new_booking', params: ['bookingNumber', 'vehicle', 'pickupAt', 'pickup'] },
    channels: ['SMS', 'WHATSAPP', 'IN_APP'],
  },
  DRIVER_ASSIGNED: {
    title: 'Driver assigned – {bookingNumber}',
    text: 'Your driver for {bookingNumber} is {driverName} ({driverPhone}). Vehicle: {vehicle} {registration}. Pickup {pickupAt}.',
    wa: { name: 'rr_driver_assigned', params: ['bookingNumber', 'driverName', 'driverPhone', 'vehicle', 'pickupAt'] },
    channels: ['SMS', 'WHATSAPP', 'IN_APP'],
  },
  DRIVER_NEW_TRIP: {
    title: 'New trip assigned – {bookingNumber}',
    text: 'Trip {bookingNumber} assigned to you: {pickupAt} from {pickup} to {drop}. Customer: {customerName}. Open the driver portal to accept.',
    wa: { name: 'rr_driver_new_trip', params: ['bookingNumber', 'pickupAt', 'pickup', 'drop'] },
    channels: ['SMS', 'WHATSAPP', 'IN_APP'],
  },
  VEHICLE_DISPATCHED: {
    title: 'Your car is on the way',
    text: '{vehicle} ({registration}) has been dispatched for booking {bookingNumber}. Driver: {driverName} {driverPhone}.',
    channels: ['SMS', 'IN_APP'],
  },
  PICKUP_REMINDER: {
    title: 'Pickup reminder – {bookingNumber}',
    text: 'Reminder: your Royal Ride pickup is at {pickupAt} from {pickup}. Driver: {driverName} {driverPhone}.',
    wa: { name: 'rr_pickup_reminder', params: ['pickupAt', 'pickup', 'driverName', 'driverPhone'] },
    channels: ['SMS', 'WHATSAPP', 'IN_APP'],
  },
  TRIP_STARTED: {
    title: 'Trip started – {bookingNumber}',
    text: 'Your trip {bookingNumber} has started. Have a safe journey!',
    channels: ['IN_APP'],
  },
  TRIP_COMPLETED: {
    title: 'Trip completed – {bookingNumber}',
    text: 'Trip {bookingNumber} is complete. Final bill: {finalAmount}. Balance due: {balance}. Please rate your experience at {appUrl}/account/bookings/{bookingId}',
    wa: { name: 'rr_trip_completed', params: ['bookingNumber', 'finalAmount', 'balance'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  BOOKING_CANCELLED: {
    title: 'Booking cancelled – {bookingNumber}',
    text: 'Booking {bookingNumber} has been cancelled. {refundText}',
    wa: { name: 'rr_booking_cancelled', params: ['bookingNumber', 'refundText'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  REFUND_UPDATE: {
    title: 'Refund {status}',
    text: 'Refund of {amount} for booking {bookingNumber} is {status}. It usually reflects in 5–7 working days.',
    wa: { name: 'rr_refund_update', params: ['amount', 'bookingNumber', 'status'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  DOCUMENT_EXPIRY: {
    title: 'Document expiring – {document}',
    text: '{document} for {subject} expires on {expiresOn} ({daysLeft} days). Please upload the renewed document to avoid suspension.',
    wa: { name: 'rr_document_expiry', params: ['document', 'subject', 'expiresOn'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  WEDDING_REQUEST: {
    title: 'Wedding request received – {requestNumber}',
    text: 'Thank you {name}! We have received your wedding transport request {requestNumber} for {weddingDate}. Our wedding desk will share a customised quote shortly.',
    wa: { name: 'rr_wedding_request', params: ['name', 'requestNumber', 'weddingDate'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  WEDDING_QUOTED: {
    title: 'Your wedding quote – {requestNumber}',
    text: 'Your customised wedding transport quote {requestNumber} is ready: {amount}. View and accept it at {appUrl}/account/weddings',
    wa: { name: 'rr_wedding_quote', params: ['requestNumber', 'amount'] },
    channels: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'],
  },
  ADMIN_ALERT: {
    title: '{title}',
    text: '{message}',
    channels: ['IN_APP', 'EMAIL'],
  },
} satisfies Record<string, Template>;

export type NotificationEvent = keyof typeof TEMPLATES;

const fill = (s: string, v: Vars) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : String(v[k])));

export interface NotifyTarget {
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * Persist + dispatch a notification on every configured channel.
 * Never throws: notification failures must not break bookings or payments.
 */
export async function notify(target: NotifyTarget, event: NotificationEvent, vars: Vars, onlyChannels?: NotificationChannel[]) {
  try {
    const t: Template = TEMPLATES[event];
    const all: Vars = { appUrl: env.APP_URL, ...vars };
    const title = fill(t.title, all);
    const text = fill(t.text, all);
    const channels = t.channels.filter((c) => !onlyChannels || onlyChannels.includes(c));

    for (const channel of channels) {
      const recipient =
        channel === 'EMAIL' ? target.email : channel === 'IN_APP' ? target.userId : target.phone;
      if (!recipient) continue;
      const row = await prisma.notification.create({
        data: {
          userId: target.userId ?? null,
          channel,
          event,
          recipient,
          title,
          body: text,
          status: channel === 'IN_APP' ? 'SENT' : 'QUEUED',
          sentAt: channel === 'IN_APP' ? new Date() : null,
          meta: vars as Prisma.InputJsonValue,
        },
      });
      if (channel === 'IN_APP') continue;
      void dispatch(row.id, channel, recipient, title, text, t.wa ? { name: t.wa.name, params: t.wa.params.map((p) => String(all[p] ?? '')) } : undefined);
    }
  } catch (e) {
    logger.error({ err: e, event }, 'notify failed');
  }
}

async function dispatch(
  id: string,
  channel: NotificationChannel,
  recipient: string,
  title: string,
  text: string,
  wa?: { name: string; params: string[] },
) {
  try {
    const r =
      channel === 'SMS'
        ? await sendSms(recipient, text)
        : channel === 'WHATSAPP'
          ? await sendWhatsAppTemplate(recipient, wa?.name ?? 'rr_generic', wa?.params ?? [text], text)
          : await sendEmail(recipient, title, text);
    await prisma.notification.update({
      where: { id },
      data: r.ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', error: r.error?.slice(0, 500) },
    });
  } catch (e) {
    await prisma.notification
      .update({ where: { id }, data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) } })
      .catch(() => undefined);
  }
}

/** Notify every admin (in-app + email) — e.g. new wedding enquiry, failed refund. */
export async function notifyAdmins(title: string, message: string) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, email: true } });
  await Promise.all(admins.map((a) => notify({ userId: a.id, email: a.email }, 'ADMIN_ALERT', { title, message })));
}
