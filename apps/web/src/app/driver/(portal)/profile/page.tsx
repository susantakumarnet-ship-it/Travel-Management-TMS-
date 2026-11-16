'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Save, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, DL, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { Banner, DocList, DocUploader, handleFormError, VerifyBadge } from '@/components/partner/common';
import { DriverFields, driverFormFrom, driverPayload, type DriverForm } from '@/components/partner/DriverFields';
import type { DriverProfile } from '@/components/partner/types';

export default function DriverProfilePage() {
  const { reload: reloadMe } = useAuth();
  const { data: p, error, loading, reload } = useApi<DriverProfile>('/driver/profile');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DriverForm>(() => driverFormFrom(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (p) setForm(driverFormFrom(p));
  }, [p]);

  const set = <K extends keyof DriverForm>(k: K, v: DriverForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api('/driver/register', { body: driverPayload(form) });
      toast.success('Profile updated');
      setEditing(false);
      reload();
      reloadMe().catch(() => undefined);
    } catch (err) {
      toast.error(handleFormError(err, setErrors));
    } finally {
      setSaving(false);
    }
  }

  if (error && !p) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !p) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!p) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" />
      {p.verificationNote && p.verificationStatus !== 'APPROVED' && (
        <Banner tone={p.verificationStatus === 'REJECTED' ? 'red' : 'amber'} title="Note from verification team">
          {p.verificationNote}
        </Banner>
      )}

      <Card className="mb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold-sheen text-2xl font-bold text-navy-950">{(p.user.name ?? '?').slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-navy-900">{p.user.name ?? 'Driver'}</p>
            <p className="text-sm text-slate-500">{p.user.phone}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <VerifyBadge status={p.verificationStatus} labels={{ PENDING: 'Verification pending', APPROVED: 'Verified driver' }} />
              {Number(p.ratingAvg) > 0 && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy-900">
                  <Star className="h-4 w-4 fill-gold-500 text-gold-500" /> {Number(p.ratingAvg).toFixed(1)} <span className="font-normal text-slate-500">({p.ratingCount})</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Details"
          action={
            !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" />}>
                Edit
              </Button>
            )
          }
        />
        {editing ? (
          <form onSubmit={save} noValidate className="space-y-5">
            <DriverFields form={form} set={set} errors={errors} />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setEditing(false);
                  setForm(driverFormFrom(p));
                  setErrors({});
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" size="lg" loading={saving} icon={<Save className="h-4 w-4" />}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <DL
            items={[
              ['Licence number', <span key="l" className="font-mono">{p.licenceNumber}</span>],
              ['Licence valid until', fmtDate(p.licenceExpiry)],
              ['Experience', `${p.experienceYears} years`],
              ['Languages', p.languages.join(', ') || '—'],
              ['Date of birth', fmtDate(p.dateOfBirth)],
              ['Base city', p.city?.name ?? '—'],
              ['Email', p.user.email ?? '—'],
              ['Fleet partner', p.owner?.businessName ?? 'Royal Ride driver pool'],
              ['Address', p.address ?? '—'],
            ]}
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Documents" subtitle="Keep your licence and ID up to date to keep receiving trips." />
        <DocList docs={p.documents} />
        <div className="mt-5 border-t border-mist-100 pt-5">
          <p className="mb-3 text-sm font-semibold text-navy-900">Upload a document</p>
          <DocUploader endpoint="/driver/documents" types={['DRIVING_LICENCE', 'AADHAAR', 'PAN', 'POLICE_VERIFICATION', 'OTHER']} withExpiry expiryRequiredFor={['DRIVING_LICENCE']} onUploaded={reload} />
        </div>
      </Card>
    </div>
  );
}
