'use client';

import { api } from './api';
import type { Checkout } from './types';

/**
 * Opens the gateway checkout for a payment order created by
 * POST /api/customer/bookings/:id/payments, then verifies on the server.
 * The server (and the gateway webhook) is the source of truth; this only drives the UI.
 */

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };
    Cashfree?: (opts: { mode: string }) => { checkout: (opts: Record<string, unknown>) => Promise<{ error?: { message: string }; paymentDetails?: unknown }> };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    document.body.appendChild(s);
  });
}

export type PayResult = { status: 'success'; bookingId: string } | { status: 'cancelled' } | { status: 'failed'; message: string };

/** `onTestCheckout` renders the dev-only test payment UI and resolves with the user's choice. */
export async function runCheckout(c: Checkout, onTestCheckout: (c: Checkout) => Promise<boolean>): Promise<PayResult> {
  const verify = async (body: Record<string, string>): Promise<PayResult> => {
    try {
      const r = await api<{ bookingId: string }>(`/customer/payments/${c.paymentId}/verify`, { body });
      return { status: 'success', bookingId: r.bookingId };
    } catch (e) {
      return { status: 'failed', message: (e as Error).message };
    }
  };
  const markFailed = (reason: string) => api(`/customer/payments/${c.paymentId}/failed`, { body: { reason } }).catch(() => undefined);

  if (c.checkout.provider === 'test') {
    const ok = await onTestCheckout(c);
    if (!ok) {
      await markFailed('Cancelled in test checkout');
      return { status: 'cancelled' };
    }
    return verify({ test_order_id: String(c.checkout.orderId), test_signature: String(c.checkout.signature) });
  }

  if (c.checkout.provider === 'razorpay') {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    return new Promise<PayResult>((resolve) => {
      const rz = new window.Razorpay!({
        key: c.checkout.key,
        order_id: c.checkout.orderId,
        amount: c.checkout.amount,
        currency: 'INR',
        name: c.checkout.name,
        description: 'Royal Ride booking',
        prefill: c.checkout.prefill,
        theme: { color: '#0b1f4b' },
        handler: async (resp: Record<string, string>) => resolve(await verify(resp)),
        modal: {
          ondismiss: async () => {
            await markFailed('Checkout closed');
            resolve({ status: 'cancelled' });
          },
        },
      });
      rz.on('payment.failed', (r: unknown) => {
        const msg = (r as { error?: { description?: string } })?.error?.description ?? 'Payment failed';
        resolve({ status: 'failed', message: msg });
      });
      rz.open();
    });
  }

  if (c.checkout.provider === 'cashfree') {
    await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
    const cf = window.Cashfree!({ mode: String(c.checkout.mode) });
    const r = await cf.checkout({ paymentSessionId: c.checkout.paymentSessionId, redirectTarget: '_modal' });
    if (r.error) {
      await markFailed(r.error.message);
      return { status: 'failed', message: r.error.message };
    }
    return verify({ order_id: String(c.checkout.orderId) });
  }

  return { status: 'failed', message: 'Unsupported payment gateway' };
}
