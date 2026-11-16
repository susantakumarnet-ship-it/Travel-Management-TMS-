import clsx from 'clsx';
import { Info } from 'lucide-react';
import { inr, TRIP_LABEL } from '@/lib/format';
import type { Quote } from '@/lib/types';

/** Full line-item breakdown of a pricing-engine quote. */
export function PriceBreakdown({ quote, compact, showAdvance = true }: { quote: Quote; compact?: boolean; showAdvance?: boolean }) {
  const taxableLines = quote.lines.filter((l) => l.taxable && l.code !== 'DISCOUNT');
  const discountLine = quote.lines.find((l) => l.code === 'DISCOUNT');
  const passLines = quote.lines.filter((l) => !l.taxable);
  return (
    <div className="text-sm">
      {!compact && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{TRIP_LABEL[quote.tripType]}</span>
          <span>{quote.hours} hr{quote.hours === 1 ? '' : 's'}</span>
          {quote.days > 0 && <span>{quote.days} day{quote.days === 1 ? '' : 's'}</span>}
          {quote.billedKm > 0 && <span>{quote.billedKm} km billed</span>}
          {quote.includedKm > 0 && <span>{quote.includedKm} km included</span>}
        </div>
      )}
      <dl className="space-y-2">
        {taxableLines.map((l, i) => (
          <Row key={`${l.code}-${i}`} label={l.label} detail={l.detail} amount={l.amount} />
        ))}
        <Row label="Subtotal" amount={quote.subtotal} strong border />
        {discountLine && <Row label={discountLine.label} amount={discountLine.amount} tone="green" />}
        <Row label={`GST (${quote.gstPercent}%)`} amount={quote.gst} />
        {passLines.map((l, i) => (
          <Row key={`${l.code}-p-${i}`} label={l.label} detail={l.detail ?? 'At actuals, no GST'} amount={l.amount} />
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t-2 border-navy-900 pt-3">
        <span className="font-semibold text-navy-900">Total payable</span>
        <span className="text-xl font-bold text-navy-900">{inr(quote.total)}</span>
      </div>
      {showAdvance && (
        <div className="mt-3 rounded-xl bg-gold-50 px-3 py-2.5 ring-1 ring-inset ring-gold-200">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-gold-900">Advance to confirm</span>
            <span className="text-lg font-bold text-gold-900">{inr(quote.advance)}</span>
          </div>
          <p className="mt-0.5 text-xs text-gold-800">Balance {inr(Math.max(0, quote.total - quote.advance))} payable before or on the trip day.</p>
        </div>
      )}
      {quote.securityDeposit > 0 && (
        <p className="mt-2 text-xs text-slate-500">Refundable security deposit of {inr(quote.securityDeposit)} is collected at vehicle handover.</p>
      )}
      {quote.notes.length > 0 && !compact && (
        <ul className="mt-3 space-y-1">
          {quote.notes.map((n) => (
            <li key={n} className="flex gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, detail, amount, strong, border, tone }: { label: string; detail?: string; amount: number; strong?: boolean; border?: boolean; tone?: 'green' }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4', border && 'border-t border-mist-200 pt-2')}>
      <dt className={clsx(strong ? 'font-semibold text-navy-900' : 'text-slate-600')}>
        {label}
        {detail && <span className="block text-xs text-slate-400">{detail}</span>}
      </dt>
      <dd className={clsx('whitespace-nowrap tabular-nums', strong ? 'font-semibold text-navy-900' : 'text-slate-800', tone === 'green' && 'font-semibold text-emerald-700')}>
        {amount < 0 ? `− ${inr(-amount)}` : inr(amount)}
      </dd>
    </div>
  );
}
