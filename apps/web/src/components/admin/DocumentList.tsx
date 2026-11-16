'use client';

import { useState } from 'react';
import { Check, Eye, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, openFile } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { DOC_TYPE_LABEL, VERIFICATION_TONE, daysUntil, reportError } from './utils';

export interface AdminDocument {
  id: string;
  type: string;
  number?: string | null;
  fileKey: string;
  expiresAt?: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  note?: string | null;
  createdAt: string;
}

/**
 * KYC / compliance documents with private-file viewing and verify / reject.
 * `endpoint` is the PATCH base, e.g. "/admin/vehicle-documents".
 */
export function DocumentList({ docs, endpoint, canWrite, onChanged }: { docs: AdminDocument[]; endpoint: string; canWrite: boolean; onChanged: () => void }) {
  const [rejecting, setRejecting] = useState<AdminDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function view(d: AdminDocument) {
    try {
      await openFile('/admin/files', { key: d.fileKey });
    } catch (e) {
      reportError(e, 'Could not open the file');
    }
  }
  async function setStatus(d: AdminDocument, status: AdminDocument['status'], note?: string) {
    setBusy(d.id);
    try {
      await api(`${endpoint}/${d.id}`, { method: 'PATCH', body: { status, note: note || undefined } });
      toast.success(status === 'VERIFIED' ? 'Document verified' : status === 'REJECTED' ? 'Document rejected' : 'Document updated');
      onChanged();
    } catch (e) {
      reportError(e);
      throw e;
    } finally {
      setBusy(null);
    }
  }

  if (!docs.length) return <p className="rounded-xl border border-dashed border-mist-300 bg-mist-50 px-4 py-8 text-center text-sm text-slate-500">No documents uploaded yet.</p>;
  return (
    <>
      <ul className="divide-y divide-mist-100 rounded-xl border border-mist-200">
        {docs.map((d) => {
          const days = daysUntil(d.expiresAt);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="rounded-lg bg-navy-50 p-2 text-navy-700">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">
                  {DOC_TYPE_LABEL[d.type] ?? d.type}
                  {d.number && <span className="ml-2 font-normal text-slate-500">#{d.number}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Uploaded {fmtDate(d.createdAt)}
                  {d.expiresAt && (
                    <span className={days != null && days < 0 ? 'text-red-600' : days != null && days <= 30 ? 'text-amber-700' : ''}>
                      {' '}
                      · Expires {fmtDate(d.expiresAt)}
                      {days != null && days < 0 ? ' (expired)' : days != null && days <= 30 ? ` (${days}d)` : ''}
                    </span>
                  )}
                </p>
                {d.note && <p className="mt-0.5 text-xs text-slate-600">Note: {d.note}</p>}
              </div>
              <Badge tone={VERIFICATION_TONE[d.status]}>{d.status}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} onClick={() => view(d)}>
                  View
                </Button>
                {canWrite && d.status !== 'VERIFIED' && (
                  <Button size="sm" variant="outline" icon={<Check className="h-4 w-4 text-emerald-600" />} loading={busy === d.id} onClick={() => setStatus(d, 'VERIFIED').catch(() => undefined)}>
                    Verify
                  </Button>
                )}
                {canWrite && d.status !== 'REJECTED' && (
                  <Button size="sm" variant="ghost" icon={<X className="h-4 w-4 text-red-600" />} onClick={() => setRejecting(d)}>
                    Reject
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject document"
        message={rejecting ? `Reject the ${DOC_TYPE_LABEL[rejecting.type] ?? rejecting.type}? The uploader will need to re-submit it.` : ''}
        confirmLabel="Reject"
        reason="Reason"
        reasonRequired
        reasonPlaceholder="e.g. Image is blurred / document expired"
        onConfirm={(note) => setStatus(rejecting!, 'REJECTED', note)}
      />
    </>
  );
}
