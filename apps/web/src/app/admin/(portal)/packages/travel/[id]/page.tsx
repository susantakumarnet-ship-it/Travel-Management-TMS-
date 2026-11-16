'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { titleCase } from '@/lib/format';
import { ErrorState, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ListEditor } from '@/components/admin/ListEditor';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { BackLink, FormGrid, PageSkeleton, ReadOnlyNotice, Section } from '@/components/admin/bits';
import { useForm, usePerm } from '@/components/admin/hooks';
import { reportError } from '@/components/admin/utils';

const TYPES = ['ODISHA_TOUR', 'CITY_SIGHTSEEING', 'FAMILY_VACATION', 'WEEKEND_TRIP', 'OUTSTATION', 'CUSTOM'] as const;

interface Day {
  title: string;
  description: string;
  places: string[];
}
interface TravelPkgFull {
  id: string;
  title: string;
  type: (typeof TYPES)[number];
  destination: string;
  startCity: string;
  durationDays: number;
  durationNights: number;
  summary: string | null;
  description: string | null;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  basePrice: number | string;
  estimatedKm: number;
  minPassengers: number;
  maxPassengers: number;
  recommendedCategoryId: string | null;
  imageUrl: string | null;
  gallery: string[];
  isPublished: boolean;
  isFeatured: boolean;
  itinerary: { dayNumber: number; title: string; description: string | null; places: string[] }[];
}

const blank = {
  title: '',
  type: 'ODISHA_TOUR' as (typeof TYPES)[number],
  destination: '',
  startCity: 'Bhubaneswar',
  durationDays: '1',
  durationNights: '0',
  summary: '',
  description: '',
  highlights: [] as string[],
  inclusions: [] as string[],
  exclusions: [] as string[],
  basePrice: '',
  estimatedKm: '0',
  minPassengers: '1',
  maxPassengers: '7',
  recommendedCategoryId: '',
  imageUrl: null as string | null,
  gallery: [] as string[],
  isPublished: false,
  isFeatured: false,
  itinerary: [] as Day[],
};
type FormT = typeof blank;

function fromPkg(p: TravelPkgFull): FormT {
  return {
    title: p.title,
    type: p.type,
    destination: p.destination,
    startCity: p.startCity,
    durationDays: String(p.durationDays),
    durationNights: String(p.durationNights),
    summary: p.summary ?? '',
    description: p.description ?? '',
    highlights: p.highlights,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    basePrice: String(Number(p.basePrice)),
    estimatedKm: String(p.estimatedKm),
    minPassengers: String(p.minPassengers),
    maxPassengers: String(p.maxPassengers),
    recommendedCategoryId: p.recommendedCategoryId ?? '',
    imageUrl: p.imageUrl,
    gallery: p.gallery,
    isPublished: p.isPublished,
    isFeatured: p.isFeatured,
    itinerary: [...p.itinerary].sort((a, b) => a.dayNumber - b.dayNumber).map((d) => ({ title: d.title, description: d.description ?? '', places: d.places })),
  };
}

export default function TravelPackageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { canWrite } = usePerm('packages');
  const cats = useApi<{ id: string; name: string }[]>('/admin/categories');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const { form, set, setForm, errors, setErrors } = useForm<FormT>(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    // No single-package admin endpoint: load the list and pick this one.
    api<TravelPkgFull[]>('/admin/travel-packages')
      .then((list) => {
        const p = list.find((x) => x.id === id);
        if (!p) setLoadError('Package not found');
        else setForm(fromPkg(p));
      })
      .catch((e) => setLoadError(errorMessage(e)))
      .finally(() => setLoaded(true));
  }, [id, isNew, setForm]);

  const setDay = (i: number, patch: Partial<Day>) => set('itinerary', form.itinerary.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const moveDay = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.itinerary.length) return;
    const next = [...form.itinerary];
    [next[i], next[j]] = [next[j], next[i]];
    set('itinerary', next);
  };

  async function save() {
    setBusy(true);
    try {
      const body = {
        title: form.title,
        type: form.type,
        destination: form.destination,
        startCity: form.startCity || 'Bhubaneswar',
        durationDays: Number(form.durationDays),
        durationNights: Number(form.durationNights || 0),
        summary: form.summary || null,
        description: form.description || null,
        highlights: form.highlights.filter(Boolean),
        inclusions: form.inclusions.filter(Boolean),
        exclusions: form.exclusions.filter(Boolean),
        basePrice: Number(form.basePrice),
        estimatedKm: Number(form.estimatedKm || 0),
        minPassengers: Number(form.minPassengers || 1),
        maxPassengers: Number(form.maxPassengers || 1),
        recommendedCategoryId: form.recommendedCategoryId || null,
        imageUrl: form.imageUrl,
        gallery: form.gallery.filter(Boolean),
        isPublished: form.isPublished,
        isFeatured: form.isFeatured,
        itinerary: form.itinerary.map((d, i) => ({ dayNumber: i + 1, title: d.title, description: d.description || null, places: d.places.filter(Boolean) })),
      };
      if (isNew) {
        const p = await api<{ id: string }>('/admin/travel-packages', { method: 'POST', body });
        toast.success('Package created');
        router.replace(`/admin/packages/travel/${p.id}`);
      } else {
        await api(`/admin/travel-packages/${id}`, { method: 'PUT', body });
        toast.success('Package saved');
      }
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} />;
  const ro = !canWrite;

  return (
    <>
      <PageHeader
        back={<BackLink href="/admin/packages" label="Packages" />}
        title={isNew ? 'New travel package' : form.title || 'Travel package'}
        subtitle="Day-wise itinerary, pricing and website listing"
        actions={
          canWrite && (
            <Button onClick={save} loading={busy} disabled={!form.title || !form.destination || form.basePrice === ''}>
              {isNew ? 'Create package' : 'Save changes'}
            </Button>
          )
        }
      />
      {ro && <ReadOnlyNotice module="packages" />}
      <fieldset disabled={ro} className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section title="Overview">
            <div className="space-y-4">
              <FormGrid>
                <Field label="Title" required error={errors.title} className="sm:col-span-2">
                  <Input value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />
                </Field>
                <Field label="Type" error={errors.type}>
                  <Select value={form.type} onChange={(e) => set('type', e.target.value as FormT['type'])}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {titleCase(t)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Destination" required error={errors.destination}>
                  <Input value={form.destination} onChange={(e) => set('destination', e.target.value)} invalid={!!errors.destination} placeholder="e.g. Puri – Konark" />
                </Field>
                <Field label="Start city" error={errors.startCity}>
                  <Input value={form.startCity} onChange={(e) => set('startCity', e.target.value)} />
                </Field>
                <Field label="Recommended vehicle category" error={errors.recommendedCategoryId}>
                  <Select value={form.recommendedCategoryId} onChange={(e) => set('recommendedCategoryId', e.target.value)}>
                    <option value="">— None —</option>
                    {cats.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field label="Summary" hint="Shown on package cards (max 300 chars)" error={errors.summary}>
                <Input value={form.summary} onChange={(e) => set('summary', e.target.value)} maxLength={300} />
              </Field>
              <Field label="Description" error={errors.description}>
                <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} />
              </Field>
            </div>
          </Section>

          <Section title="Pricing & capacity">
            <FormGrid cols={3}>
              <Field label="Base price (₹)" required error={errors.basePrice}>
                <Input type="number" min={0} value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} invalid={!!errors.basePrice} />
              </Field>
              <Field label="Days" required error={errors.durationDays}>
                <Input type="number" min={1} max={30} value={form.durationDays} onChange={(e) => set('durationDays', e.target.value)} invalid={!!errors.durationDays} />
              </Field>
              <Field label="Nights" error={errors.durationNights}>
                <Input type="number" min={0} max={30} value={form.durationNights} onChange={(e) => set('durationNights', e.target.value)} invalid={!!errors.durationNights} />
              </Field>
              <Field label="Estimated km" error={errors.estimatedKm}>
                <Input type="number" min={0} value={form.estimatedKm} onChange={(e) => set('estimatedKm', e.target.value)} />
              </Field>
              <Field label="Min passengers" error={errors.minPassengers}>
                <Input type="number" min={1} max={60} value={form.minPassengers} onChange={(e) => set('minPassengers', e.target.value)} />
              </Field>
              <Field label="Max passengers" error={errors.maxPassengers}>
                <Input type="number" min={1} max={60} value={form.maxPassengers} onChange={(e) => set('maxPassengers', e.target.value)} />
              </Field>
            </FormGrid>
          </Section>

          <Section
            title="Day-wise itinerary"
            subtitle={`${form.itinerary.length} day${form.itinerary.length === 1 ? '' : 's'} planned`}
            action={
              !ro && (
                <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => set('itinerary', [...form.itinerary, { title: '', description: '', places: [] }])} disabled={form.itinerary.length >= 30}>
                  Add day
                </Button>
              )
            }
          >
            {errors.itinerary && <p className="mb-3 text-xs font-medium text-red-600">{errors.itinerary}</p>}
            {!form.itinerary.length && <p className="rounded-xl border border-dashed border-mist-300 bg-mist-50 px-4 py-8 text-center text-sm text-slate-500">No days yet. Add the first day of the trip.</p>}
            <ol className="space-y-4">
              {form.itinerary.map((d, i) => (
                <li key={i} className="rounded-xl border border-mist-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-bold text-gold-300">Day {i + 1}</span>
                    <div className="ml-auto flex gap-1">
                      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-navy-800 disabled:opacity-30" onClick={() => moveDay(i, -1)} disabled={ro || i === 0} aria-label="Move day up">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-navy-800 disabled:opacity-30" onClick={() => moveDay(i, 1)} disabled={ro || i === form.itinerary.length - 1} aria-label="Move day down">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30" onClick={() => set('itinerary', form.itinerary.filter((_, k) => k !== i))} disabled={ro} aria-label="Remove day">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Field label="Title" required error={errors[`itinerary.${i}.title`]}>
                      <Input value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} placeholder="e.g. Bhubaneswar → Puri, Jagannath darshan" />
                    </Field>
                    <Field label="Description">
                      <Textarea value={d.description} onChange={(e) => setDay(i, { description: e.target.value })} rows={2} />
                    </Field>
                    <Field label="Places">
                      <ListEditor value={d.places} onChange={(v) => setDay(i, { places: v })} max={20} disabled={ro} placeholder="Add a place and press Enter" />
                    </Field>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Highlights, inclusions & exclusions">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Field label="Highlights" error={errors.highlights}>
                <ListEditor value={form.highlights} onChange={(v) => set('highlights', v)} max={20} disabled={ro} placeholder="Add highlight" />
              </Field>
              <Field label="Inclusions" error={errors.inclusions}>
                <ListEditor value={form.inclusions} onChange={(v) => set('inclusions', v)} disabled={ro} placeholder="Add inclusion" />
              </Field>
              <Field label="Exclusions" error={errors.exclusions}>
                <ListEditor value={form.exclusions} onChange={(v) => set('exclusions', v)} disabled={ro} placeholder="Add exclusion" />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Listing">
            <div className="space-y-3">
              <Checkbox label="Published" description="Visible on the website" checked={form.isPublished} onChange={(v) => set('isPublished', v)} disabled={ro} />
              <Checkbox label="Featured" description="Promoted on the homepage" checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} disabled={ro} />
            </div>
          </Section>
          <Section title="Cover image">
            <ImageUploader value={form.imageUrl} onChange={(k) => set('imageUrl', k)} disabled={ro} />
          </Section>
          <Section
            title="Gallery"
            subtitle={`${form.gallery.length} / 20 images`}
            action={
              !ro &&
              form.gallery.length < 20 && (
                <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => set('gallery', [...form.gallery, ''])}>
                  Add
                </Button>
              )
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {form.gallery.map((g, i) => (
                <ImageUploader
                  key={i}
                  value={g || null}
                  aspect="aspect-[4/3]"
                  disabled={ro}
                  label="Upload"
                  onChange={(k) => set('gallery', k ? form.gallery.map((x, j) => (j === i ? k : x)) : form.gallery.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            {!form.gallery.length && <p className="text-sm text-slate-500">No gallery images.</p>}
          </Section>
        </div>
      </fieldset>
    </>
  );
}
