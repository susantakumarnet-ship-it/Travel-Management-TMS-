'use client';

import { useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, titleCase } from '@/lib/format';
import { Badge, Modal, PageHeader, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Cell, EnumBadge, FormGrid, ReadOnlyNotice } from '@/components/admin/bits';
import { useForm, usePerm } from '@/components/admin/hooks';
import { USER_STATUS_TONE, reportError } from '@/components/admin/utils';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  _count: { users: number };
}
interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  lastLoginAt: string | null;
  adminRole: { id: string; name: string } | null;
}

// ─────────────────────────── Roles ───────────────────────────

function RoleModal({ role, modules, onClose, onSaved, canWrite }: { role: Role | null; modules: string[]; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const readOnly = !canWrite || !!role?.isSystem;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const full = perms.has('*');

  const toggle = (mod: string, action: 'read' | 'write', on: boolean) => {
    const next = new Set(perms);
    if (action === 'write') {
      if (on) {
        next.add(`${mod}:write`);
        next.add(`${mod}:read`);
      } else next.delete(`${mod}:write`);
    } else {
      if (on) next.add(`${mod}:read`);
      else {
        next.delete(`${mod}:read`);
        next.delete(`${mod}:write`);
      }
    }
    setPerms(next);
  };
  const setColumn = (action: 'read' | 'write', on: boolean) => {
    const next = new Set(perms);
    for (const m of modules) {
      if (on) {
        next.add(`${m}:read`);
        if (action === 'write') next.add(`${m}:write`);
      } else {
        next.delete(`${m}:write`);
        if (action === 'read') next.delete(`${m}:read`);
      }
    }
    setPerms(next);
  };

  async function save() {
    setBusy(true);
    try {
      const body = { name, description: description || undefined, permissions: full ? ['*'] : Array.from(perms).filter((p) => p !== '*').sort() };
      if (role) await api(`/admin/roles/${role.id}`, { method: 'PUT', body });
      else await api('/admin/roles', { method: 'POST', body });
      toast.success(role ? 'Role updated' : 'Role created');
      onSaved();
      onClose();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={role ? (readOnly ? role.name : `Edit ${role.name}`) : 'New role'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button onClick={save} loading={busy} disabled={name.trim().length < 2}>
              Save role
            </Button>
          )}
        </>
      }
    >
      {role?.isSystem && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-mist-200 bg-mist-50 px-3 py-2 text-sm text-slate-600">
          <Lock className="h-4 w-4" /> System roles cannot be edited.
        </p>
      )}
      <fieldset disabled={readOnly} className="space-y-4">
        <FormGrid>
          <Field label="Role name" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field label="Description" error={errors.description}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </Field>
        </FormGrid>
        <div className="rounded-xl border border-gold-200 bg-gold-50/60 px-4 py-3">
          <Checkbox
            label="Full access (super admin)"
            description="Grants every permission, including future modules"
            checked={full}
            disabled={readOnly}
            onChange={(v) => {
              const next = new Set(perms);
              if (v) next.add('*');
              else next.delete('*');
              setPerms(next);
            }}
          />
        </div>
        {errors.permissions && <p className="text-xs font-medium text-red-600">{errors.permissions}</p>}
        <div className={full ? 'pointer-events-none opacity-40' : ''}>
          <div className="overflow-hidden rounded-xl border border-mist-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Module</th>
                  <th className="text-center">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      View
                      {!readOnly && <input type="checkbox" className="accent-navy-900" checked={modules.every((m) => perms.has(`${m}:read`))} onChange={(e) => setColumn('read', e.target.checked)} aria-label="Toggle all view" />}
                    </label>
                  </th>
                  <th className="text-center">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      Manage
                      {!readOnly && <input type="checkbox" className="accent-navy-900" checked={modules.every((m) => perms.has(`${m}:write`))} onChange={(e) => setColumn('write', e.target.checked)} aria-label="Toggle all manage" />}
                    </label>
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m}>
                    <td className="font-medium text-navy-900">{titleCase(m)}</td>
                    <td className="text-center">
                      <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={full || perms.has(`${m}:read`)} onChange={(e) => toggle(m, 'read', e.target.checked)} aria-label={`${m} view`} />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={full || perms.has(`${m}:write`)} onChange={(e) => toggle(m, 'write', e.target.checked)} aria-label={`${m} manage`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Manage implies view.</p>
        </div>
      </fieldset>
    </Modal>
  );
}

function RolesTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<{ modules: string[]; roles: Role[] }>('/admin/roles');
  const [editing, setEditing] = useState<Role | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const cols: Column<Role>[] = [
    {
      key: 'name',
      header: 'Role',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Cell primary={r.name} secondary={r.description} />
          {r.isSystem && <Badge tone="navy">System</Badge>}
        </div>
      ),
    },
    {
      key: 'perms',
      header: 'Permissions',
      className: 'min-w-[260px]',
      render: (r) =>
        r.permissions.includes('*') ? (
          <Badge tone="gold">Full access</Badge>
        ) : (
          <span className="text-sm text-slate-600">
            {r.permissions.filter((p) => p.endsWith(':write')).length} manage · {r.permissions.filter((p) => p.endsWith(':read')).length} view
          </span>
        ),
    },
    { key: 'users', header: 'Admins', align: 'right', render: (r) => r._count.users },
    {
      key: 'a',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(r)}>
            {canWrite && !r.isSystem ? 'Edit' : 'View'}
          </Button>
          {canWrite && !r.isSystem && (
            <Button size="sm" variant="ghost" disabled={r._count.users > 0} title={r._count.users > 0 ? 'Reassign its admins first' : 'Delete role'} onClick={() => setDeleting(r)} aria-label="Delete role">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} disabled={!data}>
            New role
          </Button>
        </div>
      )}
      <DataTable columns={cols} rows={data?.roles} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id} onRowClick={(r) => setEditing(r)} empty="No roles" />
      {editing && data && <RoleModal role={editing === 'new' ? null : editing} modules={data.modules} onClose={() => setEditing(null)} onSaved={reload} canWrite={canWrite} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete role"
        message={`Delete the role "${deleting?.name}"?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api(`/admin/roles/${deleting!.id}`, { method: 'DELETE' });
            toast.success('Role deleted');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
    </>
  );
}

// ─────────────────────────── Admin users ───────────────────────────

const pwChecks = (pw: string) => [
  { ok: pw.length >= 10, label: '10+ characters' },
  { ok: /[A-Z]/.test(pw), label: 'Uppercase' },
  { ok: /[a-z]/.test(pw), label: 'Lowercase' },
  { ok: /\d/.test(pw), label: 'Number' },
];

function PasswordHint({ pw }: { pw: string }) {
  if (!pw) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {pwChecks(pw).map((c) => (
        <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-mist-100 text-slate-500'}`}>
          {c.ok ? '✓ ' : ''}
          {c.label}
        </span>
      ))}
    </div>
  );
}

function AdminModal({ admin, roles, onClose, onSaved }: { admin: AdminUser | null; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const { form, set, errors, setErrors } = useForm({ name: admin?.name ?? '', email: admin?.email ?? '', phone: admin?.phone ?? '', password: '', adminRoleId: admin?.adminRole?.id ?? roles[0]?.id ?? '' });
  const [busy, setBusy] = useState(false);
  const pwOk = pwChecks(form.password).every((c) => c.ok);
  const canSave = admin ? form.name.trim() && (!form.password || pwOk) : form.name.trim() && form.email && form.phone && pwOk && form.adminRoleId;

  async function save() {
    setBusy(true);
    try {
      if (admin) await api(`/admin/admins/${admin.id}`, { method: 'PUT', body: { name: form.name, adminRoleId: form.adminRoleId || undefined, password: form.password || undefined } });
      else await api('/admin/admins', { method: 'POST', body: form });
      toast.success(admin ? 'Admin updated' : 'Admin created');
      onSaved();
      onClose();
    } catch (e) {
      setErrors(reportError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={admin ? `Edit ${admin.name ?? admin.email}` : 'New admin user'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!canSave}>
            {admin ? 'Save' : 'Create admin'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
        </Field>
        {!admin && (
          <FormGrid>
            <Field label="Email" required error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} autoComplete="off" />
            </Field>
            <Field label="Mobile" required error={errors.phone}>
              <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} placeholder="9876543210" />
            </Field>
          </FormGrid>
        )}
        <Field label="Role" required error={errors.adminRoleId}>
          <Select value={form.adminRoleId} onChange={(e) => set('adminRoleId', e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={admin ? 'New password (optional)' : 'Password'} required={!admin} error={errors.password}>
          <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} autoComplete="new-password" />
          <PasswordHint pw={form.password} />
        </Field>
        {admin && form.password && <p className="text-xs text-amber-700">Changing the password signs this admin out of all sessions.</p>}
      </div>
    </Modal>
  );
}

function AdminsTab({ canWrite }: { canWrite: boolean }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<AdminUser[]>('/admin/admins');
  const roles = useApi<{ modules: string[]; roles: Role[] }>('/admin/roles');
  const [editing, setEditing] = useState<AdminUser | null | 'new'>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  const cols: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Admin',
      render: (a) => (
        <div className="flex items-center gap-2">
          <Cell primary={a.name ?? '—'} secondary={a.email} />
          {a.id === user?.id && <Badge tone="gold">You</Badge>}
        </div>
      ),
    },
    { key: 'phone', header: 'Mobile', render: (a) => a.phone },
    {
      key: 'role',
      header: 'Role',
      render: (a) =>
        a.adminRole ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <ShieldCheck className="h-4 w-4 text-navy-400" /> {a.adminRole.name}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (a) => <EnumBadge value={a.status} tones={USER_STATUS_TONE} /> },
    { key: 'login', header: 'Last login', render: (a) => <span className="text-xs">{fmtDateTime(a.lastLoginAt)}</span> },
    {
      key: 'a',
      header: '',
      align: 'right',
      render: (a) =>
        canWrite && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(a)}>
              Edit
            </Button>
            {a.id !== user?.id && (
              <Button size="sm" variant={a.status === 'SUSPENDED' ? 'outline' : 'ghost'} onClick={() => setToggling(a)}>
                {a.status === 'SUSPENDED' ? 'Activate' : <span className="text-red-600">Suspend</span>}
              </Button>
            )}
          </div>
        ),
    },
  ];
  const suspending = toggling?.status !== 'SUSPENDED';
  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} disabled={!roles.data}>
            New admin
          </Button>
        </div>
      )}
      <DataTable columns={cols} rows={data} loading={loading} error={error} onRetry={reload} rowKey={(a) => a.id} empty="No admin users" />
      {editing && roles.data && <AdminModal admin={editing === 'new' ? null : editing} roles={roles.data.roles} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        title={suspending ? 'Suspend admin' : 'Activate admin'}
        tone={suspending ? 'danger' : 'primary'}
        confirmLabel={suspending ? 'Suspend' : 'Activate'}
        message={suspending ? `${toggling?.name ?? toggling?.email} will be signed out and unable to log in.` : `${toggling?.name ?? toggling?.email} will be able to log in again.`}
        onConfirm={async () => {
          try {
            await api(`/admin/admins/${toggling!.id}`, { method: 'PUT', body: { status: suspending ? 'SUSPENDED' : 'ACTIVE' } });
            toast.success(suspending ? 'Admin suspended' : 'Admin activated');
            reload();
          } catch (e) {
            reportError(e);
            throw e;
          }
        }}
      />
    </>
  );
}

export default function RolesPage() {
  const { canWrite } = usePerm('roles');
  const [tab, setTab] = useState<'roles' | 'admins'>('roles');
  return (
    <>
      <PageHeader title="Roles & permissions" subtitle="Control what each staff member can see and change" />
      {!canWrite && <ReadOnlyNotice module="roles" />}
      <Tabs
        tabs={[
          { value: 'roles', label: 'Roles' },
          { value: 'admins', label: 'Admin users' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'roles' ? <RolesTab canWrite={canWrite} /> : <AdminsTab canWrite={canWrite} />}
    </>
  );
}

