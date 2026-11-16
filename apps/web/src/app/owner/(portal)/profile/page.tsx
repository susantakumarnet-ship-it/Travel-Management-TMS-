'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, DL, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { BusinessFields, ownerFormFrom, type OwnerForm } from '@/components/partner/BusinessFields';
import { Banner, DocList, DocUploader, handleFormError, VerifyBadge } from '@/components/partner/common';
import type { OwnerProfile } from '@/components/partner/types';

export default function OwnerProfilePage() {
  const { user, reload: reloadMe } = useAuth();
  const { data: p, error, loading, reload } = useApi<OwnerProfile>('/owner/profile');
  const [form, setForm] = useState<OwnerForm>(() => ownerFormFrom(null, user?.name));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (p) setForm(ownerFormFrom(p, user?.name));
  }, [p, user?.name]);

  const set = (k: keyof OwnerForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.businessName.trim().length < 2) return setErrors({ businessName: 'Enter your business name' });
    setSaving(true);
    setErrors({});
    try {
      await api('/owner/profile', { method: 'PUT', body: { ...form } });
      toast.success('Profile updated');
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!p) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Business profile" subtitle="Your business, payout and KYC details." />
      {p.kycNote && <Banner tone={p.kycStatus === 'REJECTED' ? 'red' : 'amber'} title="Note from our verification team">{p.kycNote}</Banner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={save} className="space-y-6 lg:col-span-2" noValidate>
          <BusinessFields form={form} set={set} errors={errors} />
          <div className="flex justify-end">
            <Button type="submit" variant="gold" size="lg" loading={saving} icon={<Save className="h-4 w-4" />}>
              Save changes
            </Button>
          </div>
        </form>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account status" />
            <DL
              cols={1}
              items={[
                ['KYC', <VerifyBadge key="k" status={p.kycStatus} />],
                ['Mobile', p.user.phone],
                ['Commission rate', p.commissionRate != null ? `${p.commissionRate}% (custom)` : 'Standard category rate'],
                ['Partner since', fmtDate(p.createdAt)],
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="KYC documents" subtitle="PAN, Aadhaar and bank proof are required." />
            <DocList docs={p.documents} />
            <div className="mt-5 border-t border-mist-100 pt-5">
              <DocUploader endpoint="/owner/documents" types={['PAN', 'AADHAAR', 'BANK_PROOF', 'OTHER']} onUploaded={reload} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
