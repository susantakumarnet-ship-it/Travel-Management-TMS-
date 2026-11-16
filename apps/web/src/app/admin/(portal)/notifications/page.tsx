'use client';

import { Suspense, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, titleCase } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, Card, PageHeader, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Segmented, Textarea } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { FilterBar, FilterSelect, SearchInput } from '@/components/admin/FilterBar';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EnumBadge, PageSkeleton, ReadOnlyNotice } from '@/components/admin/bits';
import { useForm, usePerm, useUrlFilters } from '@/components/admin/hooks';
import { NOTIF_STATUS_TONE, reportError } from '@/components/admin/utils';

interface Notif {
  id: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  event: string;
  recipient: string;
  title: string | null;
  body: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

function Expandable({ title, body }: { title: string | null; body: string }) {
  const [open, setOpen] = useState(false);
  const long = body.length > 90;
  return (
    <div className="max-w-md">
      {title && <p className="font-medium text-navy-900">{title}</p>}
      <p className={`whitespace-pre-line text-xs text-slate-600 ${open ? '' : 'line-clamp-2'}`}>{body}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-semibold text-navy-600 hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function DeliveryLog() {
  const f = useUrlFilters({ channel: '', status: '', event: '' });
  const { data, loading, error, reload } = useApi<Paged<Notif>>('/admin/notifications', { query: { ...f.values, page: f.page } });
  const cols: Column<Notif>[] = [
    { key: 'time', header: 'Time', render: (n) => <span className="whitespace-nowrap text-xs">{fmtDateTime(n.createdAt)}</span> },
    { key: 'channel', header: 'Channel', render: (n) => <Badge tone={n.channel === 'WHATSAPP' ? 'green' : n.channel === 'EMAIL' ? 'blue' : n.channel === 'SMS' ? 'violet' : 'gray'}>{n.channel === 'IN_APP' ? 'In-app' : titleCase(n.channel)}</Badge> },
    { key: 'event', header: 'Event', render: (n) => <span className="font-mono text-xs">{n.event}</span> },
    { key: 'recipient', header: 'Recipient', render: (n) => <span className="whitespace-nowrap text-xs">{n.recipient}</span> },
    { key: 'message', header: 'Message', className: 'min-w-[260px]', render: (n) => <Expandable title={n.title} body={n.body} /> },
    { key: 'status', header: 'Status', render: (n) => <EnumBadge value={n.status} tones={NOTIF_STATUS_TONE} /> },
    { key: 'error', header: 'Error', className: 'max-w-[220px]', render: (n) => (n.error ? <span className="text-xs text-red-600">{n.error}</span> : <span className="text-slate-400">—</span>) },
  ];
  return (
    <>
      <FilterBar search={<SearchInput value={f.values.event} onChange={(v) => f.set({ event: v })} placeholder="Exact event key, e.g. BOOKING_CONFIRMED" />} onReset={f.reset}>
        <FilterSelect
          value={f.values.channel}
          onChange={(v) => f.set({ channel: v })}
          placeholder="SMS, WhatsApp & email"
          options={[
            { value: 'SMS', label: 'SMS' },
            { value: 'WHATSAPP', label: 'WhatsApp' },
            { value: 'EMAIL', label: 'Email' },
            { value: 'IN_APP', label: 'In-app' },
          ]}
        />
        <FilterSelect
          value={f.values.status}
          onChange={(v) => f.set({ status: v })}
          placeholder="Any status"
          options={[
            { value: 'QUEUED', label: 'Queued' },
            { value: 'SENT', label: 'Sent' },
            { value: 'FAILED', label: 'Failed' },
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(n) => n.id}
        empty="No notifications"
        page={data?.page}
        totalPages={data?.totalPages}
        total={data?.total}
        onPage={f.setPage}
      />
    </>
  );
}

function Broadcast({ canWrite }: { canWrite: boolean }) {
  const { form, set, errors, setErrors, reset } = useForm({ role: 'CUSTOMER' as 'CUSTOMER' | 'OWNER' | 'DRIVER', title: '', message: '', sms: false });
  const [confirm, setConfirm] = useState(false);
  const audience = { CUSTOMER: 'all active customers', OWNER: 'all active vehicle owners', DRIVER: 'all active drivers' }[form.role];

  async function send() {
    try {
      const r = await api<{ sent: number }>('/admin/notifications/broadcast', { method: 'POST', body: form });
      toast.success(`Announcement sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'}`);
      reset();
    } catch (e) {
      setErrors(reportError(e));
      throw e;
    }
  }

  return (
    <Card className="max-w-2xl">
      {!canWrite && <ReadOnlyNotice module="notifications" />}
      <fieldset disabled={!canWrite} className="space-y-4">
        <Field label="Audience">
          <Segmented
            value={form.role}
            onChange={(v) => set('role', v)}
            options={[
              { value: 'CUSTOMER', label: 'Customers' },
              { value: 'OWNER', label: 'Owners' },
              { value: 'DRIVER', label: 'Drivers' },
            ]}
          />
        </Field>
        <Field label="Title" required error={errors.title}>
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} invalid={!!errors.title} />
        </Field>
        <Field label="Message" required error={errors.message} hint={`${form.message.length}/500`}>
          <Textarea value={form.message} onChange={(e) => set('message', e.target.value)} maxLength={500} rows={4} invalid={!!errors.message} />
        </Field>
        <Checkbox label="Also send as SMS" description="SMS charges apply per recipient" checked={form.sms} onChange={(v) => set('sms', v)} disabled={!canWrite} />
        <div className="flex justify-end">
          <Button icon={<Megaphone className="h-4 w-4" />} onClick={() => setConfirm(true)} disabled={!canWrite || form.title.trim().length < 2 || form.message.trim().length < 2}>
            Send broadcast
          </Button>
        </div>
      </fieldset>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send broadcast?"
        tone="primary"
        confirmLabel="Send now"
        message={
          <>
            This sends an in-app notification{form.sms ? ' and SMS' : ''} to <strong>{audience}</strong>. It cannot be undone.
          </>
        }
        onConfirm={send}
      />
    </Card>
  );
}

function NotificationsInner() {
  const { canWrite } = usePerm('notifications');
  const [tab, setTab] = useState<'log' | 'broadcast'>('log');
  return (
    <>
      <PageHeader title="Notifications" subtitle="Delivery log for SMS, WhatsApp and email — and announcements to users" />
      <Tabs
        tabs={[
          { value: 'log', label: 'Delivery log' },
          { value: 'broadcast', label: 'Broadcast' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'log' ? <DeliveryLog /> : <Broadcast canWrite={canWrite} />}
    </>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotificationsInner />
    </Suspense>
  );
}
