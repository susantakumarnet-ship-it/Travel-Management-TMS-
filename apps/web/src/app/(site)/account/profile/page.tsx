'use client';

import { useEffect, useState } from 'react';
import { Home, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Modal, Skeleton } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import type { Address } from '@/components/site/siteTypes';

export default function ProfilePage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ProfileForm />
      <Addresses />
    </div>
  );
}

function ProfileForm() {
  const { user, reload } = useAuth();
  const [f, setF] = useState({ name: '', email: '', gstin: '', companyName: '', emergencyName: '', emergencyPhone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const p = user.customerProfile;
    setF({
      name: user.name ?? '',
      email: user.email ?? '',
      gstin: p?.gstin ?? '',
      companyName: p?.companyName ?? '',
      emergencyName: p?.emergencyName ?? '',
      emergencyPhone: p?.emergencyPhone ?? '',
    });
  }, [user]);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = 'Enter your full name';
    if (f.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(f.gstin.toUpperCase())) errs.gstin = 'Invalid GSTIN (e.g. 21ABCDE1234F1Z5)';
    if (f.emergencyPhone && !/^[\d\s+-]{10,15}$/.test(f.emergencyPhone)) errs.emergencyPhone = 'Enter a valid phone number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api('/customer/profile', {
        method: 'PATCH',
        body: {
          name: f.name.trim(),
          email: f.email.trim(),
          gstin: f.gstin.trim().toUpperCase(),
          companyName: f.companyName.trim(),
          emergencyName: f.emergencyName.trim(),
          emergencyPhone: f.emergencyPhone.trim(),
        },
      });
      await reload();
      toast.success('Profile saved');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Personal details" subtitle={user ? `Mobile: +91 ${user.phone}` : undefined} />
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field label="Full name" error={errors.name} required>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" invalid={!!errors.name} maxLength={120} />
        </Field>
        <Field label="Email" error={errors.email} hint="For invoices and booking confirmations">
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" invalid={!!errors.email} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company name" error={errors.companyName}>
            <Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} maxLength={160} />
          </Field>
          <Field label="GSTIN" error={errors.gstin} hint="For GST invoices">
            <Input value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} className="font-mono uppercase" invalid={!!errors.gstin} />
          </Field>
          <Field label="Emergency contact name" error={errors.emergencyName}>
            <Input value={f.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Emergency contact phone" error={errors.emergencyPhone}>
            <Input value={f.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} inputMode="tel" maxLength={15} invalid={!!errors.emergencyPhone} />
          </Field>
        </div>
        <Button type="submit" loading={saving}>Save changes</Button>
      </form>
    </Card>
  );
}

const EMPTY = { label: 'Home', line1: '', line2: '', city: '', state: 'Odisha', pincode: '', isDefault: false };
type Form = typeof EMPTY;

function Addresses() {
  const { data, error, loading, reload } = useApi<Address[]>('/customer/addresses');
  const [editing, setEditing] = useState<{ id: string | null; f: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toForm = (a: Address): Form => ({ label: a.label, line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault });
  const payload = (f: Form) => ({ label: f.label.trim() || 'Home', line1: f.line1.trim(), line2: f.line2.trim() || undefined, city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim(), isDefault: f.isDefault });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { f, id } = editing;
    const errs: Record<string, string> = {};
    if (f.line1.trim().length < 3) errs.line1 = 'Enter the address';
    if (f.city.trim().length < 2) errs.city = 'Enter the city';
    if (f.state.trim().length < 2) errs.state = 'Enter the state';
    if (!/^\d{6}$/.test(f.pincode.trim())) errs.pincode = 'Enter a valid 6-digit PIN code';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (id) await api(`/customer/addresses/${id}`, { method: 'PUT', body: payload(f) });
      else await api('/customer/addresses', { method: 'POST', body: payload(f) });
      toast.success(id ? 'Address updated' : 'Address saved');
      setEditing(null);
      void reload();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(a: Address) {
    setBusyId(a.id);
    try {
      await api(`/customer/addresses/${a.id}`, { method: 'PUT', body: payload({ ...toForm(a), isDefault: true }) });
      toast.success(`${a.label} is now your default address`);
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api(`/customer/addresses/${deleting.id}`, { method: 'DELETE' });
      toast.success('Address deleted');
      setDeleting(null);
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const setF = (k: keyof Form, v: string | boolean) => setEditing((s) => (s ? { ...s, f: { ...s.f, [k]: v } } : s));

  return (
    <Card>
      <CardHeader
        title="Saved addresses"
        subtitle="Use them for quick pickup selection at checkout."
        action={
          (data?.length ?? 0) < 10 && (
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setEditing({ id: null, f: { ...EMPTY, isDefault: !data?.length } }); }}>
              Add address
            </Button>
          )
        }
      />
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<Home className="h-6 w-6" />} title="No saved addresses" description="Add your home, office or a frequent pickup point." />
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-2xl border border-mist-200 p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                  {a.label} {a.isDefault && <Badge tone="gold">Default</Badge>}
                </p>
                <p className="text-slate-600">{[a.line1, a.line2].filter(Boolean).join(', ')}</p>
                <p className="text-slate-600">{a.city}, {a.state} {a.pincode}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  {!a.isDefault && (
                    <button className="flex items-center gap-1 text-navy-600 hover:underline disabled:opacity-50" onClick={() => makeDefault(a)} disabled={busyId === a.id}>
                      <Star className="h-3.5 w-3.5" /> Set as default
                    </button>
                  )}
                  <button className="flex items-center gap-1 text-navy-600 hover:underline" onClick={() => { setErrors({}); setEditing({ id: a.id, f: toForm(a) }); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="flex items-center gap-1 text-red-600 hover:underline" onClick={() => setDeleting(a)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit address' : 'Add address'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="address-form" loading={saving}>Save address</Button>
          </>
        }
      >
        {editing && (
          <form id="address-form" onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <Field label="Label" error={errors.label}>
              <Input value={editing.f.label} onChange={(e) => setF('label', e.target.value)} placeholder="Home, Office…" maxLength={40} />
            </Field>
            <Field label="PIN code" error={errors.pincode} required>
              <Input value={editing.f.pincode} onChange={(e) => setF('pincode', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} invalid={!!errors.pincode} />
            </Field>
            <Field label="Address line 1" error={errors.line1} required className="sm:col-span-2">
              <Input value={editing.f.line1} onChange={(e) => setF('line1', e.target.value)} placeholder="House no., building, street" maxLength={200} invalid={!!errors.line1} />
            </Field>
            <Field label="Address line 2" error={errors.line2} className="sm:col-span-2">
              <Input value={editing.f.line2} onChange={(e) => setF('line2', e.target.value)} placeholder="Area, landmark" maxLength={200} />
            </Field>
            <Field label="City" error={errors.city} required>
              <Input value={editing.f.city} onChange={(e) => setF('city', e.target.value)} maxLength={80} invalid={!!errors.city} />
            </Field>
            <Field label="State" error={errors.state} required>
              <Input value={editing.f.state} onChange={(e) => setF('state', e.target.value)} maxLength={80} invalid={!!errors.state} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox label="Make this my default address" checked={editing.f.isDefault} onChange={(v) => setF('isDefault', v)} />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete address?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busyId === deleting?.id}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Remove “{deleting?.label}” from your saved addresses?</p>
      </Modal>
    </Card>
  );
}
