'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, Phone, Star, Unlink, Users } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Field';
import { VerifyBadge } from '@/components/partner/common';
import type { FleetDriver } from '@/components/partner/types';

export default function OwnerDriversPage() {
  const { data, error, loading, reload } = useApi<FleetDriver[]>('/owner/drivers');
  const [phone, setPhone] = useState('');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setLinkErr(null);
    setLinking(true);
    try {
      await api('/owner/drivers/link', { body: { phone } });
      toast.success('Driver linked to your fleet');
      setPhone('');
      reload();
    } catch (err) {
      setLinkErr(err instanceof ApiError ? err.fieldErrors.phone || err.message : errorMessage(err));
    } finally {
      setLinking(false);
    }
  }

  async function unlink(d: FleetDriver) {
    if (!confirm(`Remove ${d.user.name ?? d.user.phone} from your fleet?`)) return;
    setUnlinking(d.id);
    try {
      await api(`/owner/drivers/${d.id}`, { method: 'DELETE' });
      toast.success('Driver removed from fleet');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <div>
      <PageHeader title="Fleet drivers" subtitle="Drivers linked to your business can be assigned to your bookings and set as default drivers." />
      <Card className="mb-6">
        <CardHeader title="Link a driver" subtitle="The driver must first sign up and register in the Royal Ride driver portal (/driver/login)." />
        <form onSubmit={link} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field error={linkErr ?? undefined} className="flex-1">
            <Input
              inputMode="numeric"
              placeholder="Driver's mobile number"
              value={phone}
              maxLength={14}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
              leading={<Phone className="h-4 w-4" />}
              invalid={!!linkErr}
              required
            />
          </Field>
          <Button type="submit" loading={linking} icon={<Link2 className="h-4 w-4" />}>
            Link driver
          </Button>
        </form>
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState title="No drivers linked yet" description="Link your drivers by their mobile number to assign them to trips." icon={<Users className="h-6 w-6" />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((d) => {
            const licenceSoon = new Date(d.licenceExpiry).getTime() - Date.now() < 30 * 86_400_000;
            return (
              <Card key={d.id}>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold-sheen text-lg font-bold text-navy-950">{(d.user.name ?? '?').slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy-900">{d.user.name ?? 'Driver'}</p>
                    <a href={`tel:${d.user.phone}`} className="text-sm text-navy-600 underline">
                      {d.user.phone}
                    </a>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <VerifyBadge status={d.verificationStatus} labels={{ PENDING: 'Verification pending' }} />
                      <Badge tone={d.isAvailable ? 'green' : 'gray'}>{d.isAvailable ? 'Available' : 'Off duty'}</Badge>
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-mist-50 py-2">
                    <dt className="text-slate-500">Trips</dt>
                    <dd className="text-base font-bold text-navy-900">{d._count?.bookings ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-mist-50 py-2">
                    <dt className="text-slate-500">Rating</dt>
                    <dd className="flex items-center justify-center gap-0.5 text-base font-bold text-navy-900">
                      <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />
                      {Number(d.ratingAvg) > 0 ? Number(d.ratingAvg).toFixed(1) : '—'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-mist-50 py-2">
                    <dt className="text-slate-500">Experience</dt>
                    <dd className="text-base font-bold text-navy-900">{d.experienceYears}y</dd>
                  </div>
                </dl>
                <p className={licenceSoon ? 'mt-3 text-xs font-semibold text-red-600' : 'mt-3 text-xs text-slate-500'}>
                  Licence {d.licenceNumber} · valid until {fmtDate(d.licenceExpiry)}
                </p>
                <Button variant="ghost" size="sm" className="mt-3 text-red-600" loading={unlinking === d.id} onClick={() => unlink(d)} icon={<Unlink className="h-4 w-4" />}>
                  Remove from fleet
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
