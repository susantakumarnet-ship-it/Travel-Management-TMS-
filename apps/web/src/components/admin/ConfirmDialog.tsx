'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';

/**
 * Confirmation modal for destructive / significant actions.
 * With `reason`, a textarea is shown and its value passed to onConfirm.
 * onConfirm may throw; the dialog then stays open.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  reason,
  reasonRequired,
  reasonPlaceholder,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'gold';
  onConfirm: (reason: string) => Promise<unknown> | unknown;
  reason?: string;
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const disabled = reasonRequired && text.trim().length < 3;
  async function go() {
    setBusy(true);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch {
      /* caller reports the error */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={go} loading={busy} disabled={disabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <div className="text-sm text-slate-600">{message}</div>}
      {children}
      {reason && (
        <Field label={reason} required={reasonRequired} className="mt-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={reasonPlaceholder} rows={3} />
        </Field>
      )}
    </Modal>
  );
}
