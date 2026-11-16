'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Paged } from '@/lib/types';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Modal, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { DataTable } from '@/components/admin/DataTable';
import { Chips, FilterBar, SearchInput } from '@/components/admin/FilterBar';
import { useForm, usePerm, useUrlFilters } from '@/components/admin/hooks';
import { Cell, EnumBadge, FormGrid, PageSkeleton } from '@/components/admin/bits';
import { USER_STATUS_TONE, VERIFICATION_TONE, reportError } from '@/components/admin/utils';

interface OwnerRow {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  kycStatus: string;
  commissionRate: number | null;
  createdAt: string;
  user: { name: string | null; phone: string; email: string | null; status: string };
  _count: { vehicles: number; drivers: number; bookings: number };
}

const emptyOwner = { phone: '', name: '', email: '', businessName: '', city: '', state: 'Odisha', commissionRate: '' };

function OwnersInner() {
  const router = useRouter();
  const { canWrite } = usePerm('owners');
  const { values, page, set, setPage, reset } = useUrlFilters({ q: '', kycStatus: '' });
  const { data, loading, error, reload } = useApi<Paged<OwnerRow>>('/admin/owners', { query: { ...values, page, pageSize: 20 } });
  const [open, setOpen] = useState(false);
  const f = useForm(emptyOwner);
  const [busy, setBusy] = useState(false);

  async function create() {
    const v = f.form;
    setBusy(true);
    try {
      const o = await api<{ id: string }>('/admin/owners', {
        method: 'POST',
        body: { phone: v.phone.trim(), name: v.name.trim(), email: v.email.trim(), businessName: v.businessName.trim(), city: v.city.trim() || undefined, state: v.state.trim() || undefined, commissionRate: v.commissionRate === '' ? undefined : Number(v.commissionRate) },
      });
      toast.success('Owner onboarded — they can sign in with their phone number');
      setOpen(false);
      router.push(`/admin/owners/${o.id}`);
    } catch (e) {
      f.setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Vehicle owners"
        subtitle="Fleet partners, their KYC and commission terms"
        actions={
          canWrite && (
            <Button
              icon={<UserPlus className="h-4 w-4" />}
              onClick={() => {
                f.reset(emptyOwner);
                setOpen(true);
              }}
            >
              Onboard owner
            </Button>
          )
        }
      />
      <Chips
        value={values.kycStatus}
        onChange={(v) => set({ kycStatus: v })}
        options={[
          { value: '', label: 'All' },
          { value: 'PENDING', label: 'KYC pending' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
      />
      <FilterBar search={<SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Business name or phone" />} onReset={values.q || values.kycStatus ? reset : undefined} />
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/owners/${r.id}`}
        page={page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={setPage}
        empty="No owners found"
        columns={[
          { key: 'b', header: 'Business', render: (r) => <Cell primary={r.businessName} secondary={[r.city, r.state].filter(Boolean).join(', ')} href={`/admin/owners/${r.id}`} /> },
          { key: 'c', header: 'Contact', render: (r) => <Cell primary={r.user.name ?? '—'} secondary={r.user.phone} /> },
          { key: 'v', header: 'Vehicles', align: 'right', render: (r) => r._count.vehicles },
          { key: 'd', header: 'Drivers', align: 'right', render: (r) => r._count.drivers },
          { key: 'bk', header: 'Bookings', align: 'right', render: (r) => r._count.bookings },
          { key: 'cm', header: 'Commission', align: 'right', render: (r) => (r.commissionRate == null ? <span className="text-slate-400">Category</span> : `${Number(r.commissionRate)}%`) },
          { key: 'k', header: 'KYC', render: (r) => <EnumBadge value={r.kycStatus} tones={VERIFICATION_TONE} /> },
          { key: 'u', header: 'Account', render: (r) => <EnumBadge value={r.user.status} tones={USER_STATUS_TONE} /> },
          { key: 'j', header: 'Joined', render: (r) => fmtDate(r.createdAt) },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Onboard vehicle owner"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              Create owner
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">Owners created here are KYC-approved immediately and sign in with OTP on their mobile number.</p>
        <FormGrid>
          <Field label="Mobile number" required error={f.errors.phone}>
            <Input inputMode="tel" value={f.form.phone} onChange={(e) => f.set('phone', e.target.value)} invalid={!!f.errors.phone} placeholder="98XXXXXXXX" />
          </Field>
          <Field label="Contact name" required error={f.errors.name}>
            <Input value={f.form.name} onChange={(e) => f.set('name', e.target.value)} invalid={!!f.errors.name} />
          </Field>
          <Field label="Business name" required error={f.errors.businessName} className="sm:col-span-2">
            <Input value={f.form.businessName} onChange={(e) => f.set('businessName', e.target.value)} invalid={!!f.errors.businessName} />
          </Field>
          <Field label="Email" error={f.errors.email}>
            <Input type="email" value={f.form.email} onChange={(e) => f.set('email', e.target.value)} invalid={!!f.errors.email} />
          </Field>
          <Field label="Commission override %" error={f.errors.commissionRate} hint="Blank = category rate">
            <Input type="number" step="0.01" min={0} max={100} value={f.form.commissionRate} onChange={(e) => f.set('commissionRate', e.target.value)} />
          </Field>
          <Field label="City" error={f.errors.city}>
            <Input value={f.form.city} onChange={(e) => f.set('city', e.target.value)} />
          </Field>
          <Field label="State" error={f.errors.state}>
            <Input value={f.form.state} onChange={(e) => f.set('state', e.target.value)} />
          </Field>
        </FormGrid>
      </Modal>
    </>
  );
}

export default function OwnersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OwnersInner />
    </Suspense>
  );
}
