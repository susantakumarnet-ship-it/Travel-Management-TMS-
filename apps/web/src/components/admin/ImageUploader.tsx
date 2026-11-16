'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { mediaUrl } from './utils';

/**
 * Single image field backed by POST /admin/uploads/image.
 * `value` is the stored key (or URL); onChange receives the new key.
 */
export function ImageUploader({ value, onChange, disabled, label = 'Upload image', aspect = 'aspect-[16/9]' }: { value: string | null | undefined; onChange: (key: string | null) => void; disabled?: boolean; label?: string; aspect?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File) {
    if (file.size > 8 * 1024 * 1024) return toast.error('Image must be under 8 MB');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api<{ key: string; url: string }>('/admin/uploads/image', { method: 'POST', body: fd });
      setPreview(r.url);
      onChange(r.key);
      toast.success('Image uploaded');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }
  const src = preview && value ? preview : mediaUrl(value);
  return (
    <div>
      <div className={`relative overflow-hidden rounded-xl border border-dashed border-mist-300 bg-mist-50 ${aspect}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <button type="button" disabled={disabled || busy} onClick={() => ref.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-slate-500 hover:text-navy-800 disabled:cursor-not-allowed">
            <ImagePlus className="h-6 w-6" />
            {label}
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Spinner className="h-6 w-6 text-navy-700" />
          </div>
        )}
        {src && !disabled && (
          <div className="absolute right-2 top-2 flex gap-1">
            <button type="button" onClick={() => ref.current?.click()} className="rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-navy-900 shadow hover:bg-white">
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
              className="rounded-lg bg-white/90 p-1.5 text-red-600 shadow hover:bg-white"
              aria-label="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
