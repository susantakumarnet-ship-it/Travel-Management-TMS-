import type { Quote } from '@/lib/types';
import { inr } from '@/lib/format';

/** Renders the pricing-engine quote stored in booking.priceBreakdown. */
export function PriceBreakdownTable({ quote, extra }: { quote: Partial<Quote> | null | undefined; extra?: { label: string; amount: number; strong?: boolean }[] }) {
  if (!quote?.lines) return <p className="text-sm text-slate-500">No price breakdown recorded.</p>;
  const row = (label: string, amount: number, opts: { strong?: boolean; muted?: boolean; detail?: string; negative?: boolean } = {}) => (
    <tr key={label + amount} className={opts.strong ? 'font-semibold text-navy-900' : ''}>
      <td className="py-2 pr-4">
        <span className={opts.muted ? 'text-slate-500' : ''}>{label}</span>
        {opts.detail && <span className="block text-xs text-slate-500">{opts.detail}</span>}
      </td>
      <td className="py-2 text-right tabular-nums">{opts.negative ? `− ${inr(amount)}` : inr(amount)}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-mist-100">
          {quote.lines.map((l, i) => (
            <tr key={`${l.code}-${i}`}>
              <td className="py-2 pr-4">
                {l.label}
                {!l.taxable && <span className="ml-2 rounded bg-mist-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">pass-through</span>}
                {l.detail && <span className="block text-xs text-slate-500">{l.detail}</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{inr(l.amount)}</td>
            </tr>
          ))}
          {quote.subtotal != null && row('Subtotal', quote.subtotal, { strong: true })}
          {!!quote.discount && row('Discount', quote.discount, { negative: true })}
          {quote.taxable != null && row('Taxable value', quote.taxable, { muted: true })}
          {quote.gst != null && row(`GST (${quote.gstPercent ?? 0}%)`, quote.gst)}
          {!!quote.passThrough && row('Pass-through (tolls / taxes)', quote.passThrough, { muted: true })}
          {quote.total != null && row('Total', quote.total, { strong: true })}
          {quote.advance != null && row('Advance due at booking', quote.advance, { muted: true })}
          {!!quote.securityDeposit && row('Security deposit (refundable)', quote.securityDeposit, { muted: true })}
          {extra?.map((e) => row(e.label, e.amount, { strong: e.strong }))}
        </tbody>
      </table>
      {!!quote.notes?.length && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {quote.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
