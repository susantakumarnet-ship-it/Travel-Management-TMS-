'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { reportError } from './utils';

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
}
export interface QuoteBreakdown {
  items: QuoteItem[];
  discount: number;
  gstPercent: number;
  notes?: string;
  validDays: number;
  subtotal?: number;
  taxable?: number;
  gst?: number;
  total?: number;
}

interface Row {
  description: string;
  quantity: string;
  unitPrice: string;
}

/** Mirrors the server-side calculation in POST /admin/weddings/:id/quote. */
export function computeQuote(items: QuoteItem[], discount: number, gstPercent: number) {
  const subtotal = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const taxable = Math.max(0, subtotal - discount);
  const gst = Math.round(taxable * gstPercent) / 100;
  const total = Math.round((taxable + gst) * 100) / 100;
  return { subtotal, taxable, gst, total };
}

/** Itemised quote editor for a wedding request. */
export function QuoteBuilder({ requestId, initial, suggestions, disabled, onSaved }: { requestId: string; initial?: QuoteBreakdown | null; suggestions?: string[]; disabled?: boolean; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(
    initial?.items?.length
      ? initial.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) }))
      : (suggestions?.length ? suggestions : ['Decorated bride/groom car']).map((d) => ({ description: d, quantity: '1', unitPrice: '' })),
  );
  const [discount, setDiscount] = useState(String(initial?.discount ?? 0));
  const [gstPercent, setGst] = useState(String(initial?.gstPercent ?? 5));
  const [validDays, setValid] = useState(String(initial?.validDays ?? 7));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const items: QuoteItem[] = rows.filter((r) => r.description.trim()).map((r) => ({ description: r.description.trim(), quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)), unitPrice: Number(r.unitPrice) || 0 }));
  const calc = computeQuote(items, Number(discount) || 0, Number(gstPercent) || 0);
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function save() {
    if (!items.length) return toast.error('Add at least one line item');
    setBusy(true);
    setErrors({});
    try {
      await api(`/admin/weddings/${requestId}/quote`, {
        method: 'POST',
        body: { items, discount: Number(discount) || 0, gstPercent: Number(gstPercent) || 0, validDays: Number(validDays) || 7, notes: notes.trim() || undefined },
      });
      toast.success('Quote sent to the customer');
      onSaved();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 font-semibold">Description</th>
              <th className="w-20 pb-2 font-semibold">Qty</th>
              <th className="w-36 pb-2 font-semibold">Unit price (₹)</th>
              <th className="w-32 pb-2 text-right font-semibold">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <input className="input" value={r.description} disabled={disabled} onChange={(e) => update(i, { description: e.target.value })} placeholder="e.g. Mercedes E-Class with floral decoration" maxLength={200} />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" type="number" min={1} value={r.quantity} disabled={disabled} onChange={(e) => update(i, { quantity: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" type="number" min={0} value={r.unitPrice} disabled={disabled} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                </td>
                <td className="py-1 text-right tabular-nums">{inr((Number(r.quantity) || 0) * (Number(r.unitPrice) || 0))}</td>
                <td className="py-1 pl-1">
                  {!disabled && rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="rounded p-1.5 text-slate-400 hover:text-red-600" aria-label="Remove line">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors.items && <p className="mt-1 text-xs font-medium text-red-600">{errors.items}</p>}
      {!disabled && rows.length < 30 && (
        <button type="button" onClick={() => setRows((rs) => [...rs, { description: '', quantity: '1', unitPrice: '' }])} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
          <Plus className="h-4 w-4" /> Add line
        </button>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Discount (₹)" error={errors.discount}>
            <Input type="number" min={0} value={discount} disabled={disabled} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="GST %" error={errors.gstPercent}>
            <Input type="number" min={0} max={28} value={gstPercent} disabled={disabled} onChange={(e) => setGst(e.target.value)} />
          </Field>
          <Field label="Valid (days)" error={errors.validDays}>
            <Input type="number" min={1} max={60} value={validDays} disabled={disabled} onChange={(e) => setValid(e.target.value)} />
          </Field>
          <Field label="Notes to customer" className="sm:col-span-3" error={errors.notes}>
            <Textarea rows={3} value={notes} disabled={disabled} onChange={(e) => setNotes(e.target.value)} placeholder="Inclusions, payment terms, decoration theme…" maxLength={2000} />
          </Field>
        </div>
        <div className="rounded-xl border border-mist-200 bg-mist-50 p-4 text-sm">
          {(
            [
              ['Subtotal', calc.subtotal],
              ['Discount', -(Number(discount) || 0)],
              ['Taxable', calc.taxable],
              [`GST (${Number(gstPercent) || 0}%)`, calc.gst],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1">
              <span className="text-slate-500">{k}</span>
              <span className="tabular-nums">{v < 0 ? `− ${inr(-v)}` : inr(v)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-mist-300 pt-2 text-base font-bold text-navy-900">
            <span>Total</span>
            <span className="tabular-nums">{inr(calc.total)}</span>
          </div>
          {!disabled && (
            <Button variant="gold" className="mt-4 w-full" loading={busy} onClick={save}>
              {initial ? 'Update & resend quote' : 'Send quote'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
