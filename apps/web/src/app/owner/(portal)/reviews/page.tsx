'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquareReply, Star } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Textarea } from '@/components/ui/Field';

interface Review {
  id: string;
  rating: number;
  vehicleRating: number | null;
  driverRating: number | null;
  comment: string | null;
  status: string;
  ownerReply: string | null;
  createdAt: string;
  vehicle: { title: string };
  customer: { name: string | null };
}

function Stars({ n, size = 'h-4 w-4' }: { n: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= n ? 'fill-gold-500 text-gold-500' : 'text-mist-300'}`} />
      ))}
    </span>
  );
}

export default function OwnerReviewsPage() {
  const { data, error, loading, reload, setData } = useApi<Review[]>('/owner/reviews');
  const avg = data?.length ? data.reduce((a, r) => a + r.rating, 0) / data.length : 0;

  return (
    <div>
      <PageHeader title="Reviews" subtitle="What customers say about your vehicles and drivers. A thoughtful reply builds trust." />
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-6">
          <div>
            <p className="font-display text-4xl font-semibold text-navy-900">{avg.toFixed(1)}</p>
            <Stars n={Math.round(avg)} />
          </div>
          <p className="text-sm text-slate-600">
            Average from {data.length} review{data.length > 1 ? 's' : ''} · {data.filter((r) => !r.ownerReply).length} awaiting your reply
          </p>
        </Card>
      )}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState title="No reviews yet" description="Customers can review a trip after it is completed." icon={<Star className="h-6 w-6" />} />
      ) : (
        <div className="space-y-4">
          {data?.map((r) => (
            <ReviewCard key={r.id} r={r} onReplied={(reply) => setData((list) => list?.map((x) => (x.id === r.id ? { ...x, ownerReply: reply } : x)) ?? null)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r, onReplied }: { r: Review; onReplied: (reply: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(r.ownerReply ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (reply.trim().length < 2) return toast.error('Write a short reply');
    setBusy(true);
    try {
      await api(`/owner/reviews/${r.id}/reply`, { body: { reply: reply.trim() } });
      toast.success('Reply posted');
      onReplied(reply.trim());
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Stars n={r.rating} />
            {r.status !== 'PUBLISHED' && <Badge tone="gray">{r.status.toLowerCase()}</Badge>}
          </div>
          <p className="mt-1 text-sm font-semibold text-navy-900">
            {r.customer.name ?? 'Customer'} <span className="font-normal text-slate-500">· {r.vehicle.title}</span>
          </p>
        </div>
        <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
      </div>
      {(r.vehicleRating || r.driverRating) && (
        <p className="mt-2 text-xs text-slate-500">
          {r.vehicleRating ? `Vehicle ${r.vehicleRating}/5` : ''}
          {r.vehicleRating && r.driverRating ? ' · ' : ''}
          {r.driverRating ? `Driver ${r.driverRating}/5` : ''}
        </p>
      )}
      {r.comment ? <p className="mt-3 whitespace-pre-line text-slate-700">{r.comment}</p> : <p className="mt-3 text-sm italic text-slate-400">No written comment.</p>}

      {r.ownerReply && !editing ? (
        <div className="mt-4 rounded-xl border-l-4 border-gold-500 bg-gold-50/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Your reply</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{r.ownerReply}</p>
          <button className="mt-2 text-xs font-semibold text-navy-600 hover:underline" onClick={() => setEditing(true)}>
            Edit reply
          </button>
        </div>
      ) : editing ? (
        <div className="mt-4 space-y-2">
          <Textarea value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Thank the customer, address any concern…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={submit}>
              Post reply
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-4" icon={<MessageSquareReply className="h-4 w-4" />} onClick={() => setEditing(true)}>
          Reply
        </Button>
      )}
    </Card>
  );
}
