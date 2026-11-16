'use client';

import { useCallback, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { runCheckout, type PayResult } from '@/lib/payments';
import { inr } from '@/lib/format';
import type { Checkout } from '@/lib/types';
import { Modal } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';

/**
 * Wraps runCheckout and renders the development-only TEST gateway modal.
 * Usage: const { pay, modal } = usePayment(); … await pay(checkout); … {modal}
 */
export function usePayment() {
  const [pending, setPending] = useState<Checkout | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const onTestCheckout = useCallback(
    (c: Checkout) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPending(c);
      }),
    [],
  );

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const pay = useCallback((c: Checkout): Promise<PayResult> => runCheckout(c, onTestCheckout), [onTestCheckout]);

  const modal = (
    <Modal
      open={!!pending}
      onClose={() => finish(false)}
      title={
        <span className="flex items-center gap-2 text-amber-700">
          <FlaskConical className="h-5 w-5" /> TEST PAYMENT — development only
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button variant="gold" onClick={() => finish(true)}>
            Simulate successful payment
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900">
          No real payment gateway is configured. This simulated checkout exists only in development and is disabled in production. No money will be charged.
        </div>
        {pending && (
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-bold text-navy-900">{inr(pending.amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Order</dt>
              <dd className="font-mono text-xs">{String(pending.checkout.orderId ?? '')}</dd>
            </div>
          </dl>
        )}
      </div>
    </Modal>
  );

  return { pay, modal };
}
