'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Skeleton } from '@/components/ui/Display';
import { BusinessFields, ownerFormFrom, type OwnerForm } from '@/components/partner/BusinessFields';
import { DOC_LABEL, DocList, DocUploader, handleFormError, Steps } from '@/components/partner/common';
import type { Doc, OwnerProfile } from '@/components/partner/types';

const REQUIRED_DOCS = ['PAN', 'AADHAAR', 'BANK_PROOF'];

export default function OwnerOnboardingPage() {
  const { user, reload } = useAuth();
  const router = useRouter();
  const profile = useApi<OwnerProfile | null>('/owner/profile');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OwnerForm>(() => ownerFormFrom(null, user?.name));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (profile.loading || initialised) return;
    if (profile.data) {
      setForm(ownerFormFrom(profile.data, user?.name));
      setDocs(profile.data.documents ?? []);
      setStep(1);
    }
    setInitialised(true);
  }, [profile.loading, profile.data, initialised, user?.name]);

  const set = (k: keyof OwnerForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.businessName.trim().length < 2) return setErrors({ businessName: 'Enter your business name' });
    setSaving(true);
    setErrors({});
    try {
      await api('/owner/register', { body: { ...form } });
      await reload();
      toast.success('Business details saved');
      setStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(handleFormError(err, setErrors));
    } finally {
      setSaving(false);
    }
  }

  if (profile.loading || !initialised) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const uploadedTypes = new Set(docs.map((d) => d.type));
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy-900">Welcome to Royal Ride Partners</h1>
      <p className="mb-8 mt-1 text-slate-500">Set up your business in a few minutes. You can add vehicles right after.</p>
      <Steps steps={['Business details', 'KYC documents', 'Done']} current={step} />

      {step === 0 && (
        <form onSubmit={submit} className="space-y-6" noValidate>
          <BusinessFields form={form} set={set} errors={errors} />
          <div className="flex justify-end">
            <Button type="submit" variant="gold" size="lg" loading={saving} icon={<ArrowRight className="h-4 w-4" />}>
              Save & continue
            </Button>
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Upload KYC documents" subtitle="Clear photos or PDFs. Our team usually verifies within 24 hours." />
            <ul className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {REQUIRED_DOCS.map((t) => (
                <li key={t} className="flex items-center gap-2 rounded-xl border border-mist-200 px-3 py-2.5 text-sm font-medium">
                  {uploadedTypes.has(t) ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                  {DOC_LABEL[t]}
                </li>
              ))}
            </ul>
            <DocUploader
              endpoint="/owner/documents"
              types={['PAN', 'AADHAAR', 'BANK_PROOF', 'OTHER']}
              defaultType={REQUIRED_DOCS.find((t) => !uploadedTypes.has(t))}
              onUploaded={(d) => setDocs((ds) => [d, ...ds])}
            />
          </Card>
          {docs.length > 0 && (
            <Card>
              <CardHeader title="Uploaded" />
              <DocList docs={docs} />
            </Card>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(0)} icon={<ArrowLeft className="h-4 w-4" />}>
              Edit business details
            </Button>
            <div className="flex gap-2">
              {!REQUIRED_DOCS.every((t) => uploadedTypes.has(t)) && (
                <Button variant="outline" onClick={() => setStep(2)}>
                  Skip for now
                </Button>
              )}
              <Button variant="gold" onClick={() => setStep(2)} disabled={!REQUIRED_DOCS.every((t) => uploadedTypes.has(t))} icon={<ArrowRight className="h-4 w-4" />}>
                Finish
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="text-center">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-gold-50 p-4 text-gold-600">
            <PartyPopper className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-semibold">You&apos;re all set!</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            Your business is registered and KYC is under review. Next, add your vehicles with photos, pricing and documents — they go live as soon as both your KYC and the vehicle are approved.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="gold" size="lg" onClick={() => router.push('/owner/vehicles/new')}>
              Add your first vehicle
            </Button>
            <Button variant="outline" size="lg" onClick={() => router.push('/owner')}>
              Go to dashboard
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
