'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Hourglass, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, Skeleton } from '@/components/ui/Display';
import { DOC_LABEL, DocList, DocUploader, handleFormError, Steps } from '@/components/partner/common';
import { DriverFields, driverFormFrom, driverPayload, type DriverForm } from '@/components/partner/DriverFields';
import type { Doc, DriverProfile } from '@/components/partner/types';

const REQUIRED = ['DRIVING_LICENCE', 'AADHAAR'];

export default function DriverOnboardingPage() {
  const { user, reload } = useAuth();
  const router = useRouter();
  const profile = useApi<DriverProfile | null>('/driver/profile');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DriverForm>(() => driverFormFrom(null, user?.name));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (profile.loading || ready) return;
    if (profile.data) {
      setForm(driverFormFrom(profile.data, user?.name));
      setDocs(profile.data.documents ?? []);
      const types = new Set(profile.data.documents.map((d) => d.type));
      setStep(REQUIRED.every((t) => types.has(t)) ? 2 : 1);
    }
    setReady(true);
  }, [profile.loading, profile.data, ready, user?.name]);

  const set = <K extends keyof DriverForm>(k: K, v: DriverForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Enter your full name';
    if (!form.licenceNumber.trim()) local.licenceNumber = 'Enter your licence number';
    if (!form.licenceExpiry) local.licenceExpiry = 'Enter the expiry date';
    if (form.experienceYears === '') local.experienceYears = 'Required';
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    setErrors({});
    try {
      await api('/driver/register', { body: driverPayload(form) });
      await reload();
      toast.success('Details saved');
      setStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(handleFormError(err, setErrors));
    } finally {
      setSaving(false);
    }
  }

  if (profile.loading || !ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const types = new Set(docs.map((d) => d.type));
  const status = user?.driver?.verificationStatus ?? profile.data?.verificationStatus ?? 'PENDING';

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy-900">Join Royal Ride as a driver</h1>
      <p className="mb-8 mt-1 text-slate-500">Drive premium cars for weddings, tours and airport transfers.</p>
      <Steps steps={['Your details', 'Documents', 'Verification']} current={step} />

      {step === 0 && (
        <form onSubmit={submit} className="space-y-6" noValidate>
          <Card>
            <CardHeader title="Personal & licence details" />
            <DriverFields form={form} set={set} errors={errors} />
          </Card>
          <Button type="submit" variant="gold" size="lg" loading={saving} className="w-full sm:w-auto" icon={<ArrowRight className="h-4 w-4" />}>
            Save & continue
          </Button>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Upload your documents" subtitle="Driving licence and Aadhaar are required. Police verification helps you get more trips." />
            <ul className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUIRED.map((t) => (
                <li key={t} className="flex items-center gap-2 rounded-xl border border-mist-200 px-3 py-3 text-sm font-medium">
                  {types.has(t) ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                  {DOC_LABEL[t]}
                </li>
              ))}
            </ul>
            <DocUploader
              endpoint="/driver/documents"
              types={['DRIVING_LICENCE', 'AADHAAR', 'PAN', 'POLICE_VERIFICATION', 'OTHER']}
              withExpiry
              expiryRequiredFor={['DRIVING_LICENCE']}
              defaultType={REQUIRED.find((t) => !types.has(t))}
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
            <Button variant="ghost" size="lg" onClick={() => setStep(0)} icon={<ArrowLeft className="h-4 w-4" />}>
              Edit details
            </Button>
            <Button variant="gold" size="lg" disabled={!REQUIRED.every((t) => types.has(t))} onClick={() => setStep(2)} icon={<ArrowRight className="h-4 w-4" />}>
              Submit for verification
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="text-center">
          {status === 'APPROVED' ? (
            <>
              <div className="mx-auto mb-4 inline-flex rounded-full bg-emerald-50 p-4 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="font-display text-2xl font-semibold">You are verified!</h2>
              <p className="mx-auto mt-2 max-w-md text-slate-600">You can now receive trip assignments. Keep your availability on to get trips.</p>
            </>
          ) : status === 'REJECTED' ? (
            <>
              <div className="mx-auto mb-4 inline-flex rounded-full bg-red-50 p-4 text-red-600">
                <XCircle className="h-8 w-8" />
              </div>
              <h2 className="font-display text-2xl font-semibold">Verification unsuccessful</h2>
              <p className="mx-auto mt-2 max-w-md text-slate-600">{profile.data?.verificationNote ?? 'Please check your details and re-upload clear documents.'}</p>
              <Button variant="outline" className="mt-4" onClick={() => setStep(1)}>
                Re-upload documents
              </Button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 inline-flex rounded-full bg-gold-50 p-4 text-gold-600">
                <Hourglass className="h-8 w-8" />
              </div>
              <h2 className="font-display text-2xl font-semibold">Verification in progress</h2>
              <p className="mx-auto mt-2 max-w-md text-slate-600">Our team is checking your documents — this usually takes 24–48 hours. We&apos;ll notify you by SMS once you&apos;re approved.</p>
              <button className="mt-3 text-sm font-semibold text-navy-600 underline" onClick={() => setStep(1)}>
                Upload more documents
              </button>
            </>
          )}
          <div className="mt-6">
            <Button variant="gold" size="lg" className="w-full sm:w-auto" onClick={() => router.push('/driver')}>
              Go to driver home
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
