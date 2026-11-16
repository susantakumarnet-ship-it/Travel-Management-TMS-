import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export function Field({ label, error, hint, children, className, required }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode }>(function Input({ className, invalid, leading, ...rest }, ref) {
  if (leading) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{leading}</span>
        <input ref={ref} className={clsx('input pl-10', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={clsx('input', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx('input appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%2364748b%27%3E%3Cpath d=%27M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z%27/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_.6rem_center] bg-no-repeat pr-9', invalid && 'border-red-400', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={clsx('input min-h-[96px]', invalid && 'border-red-400', className)} {...rest} />;
});

export function Checkbox({ label, checked, onChange, description, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-mist-300 text-navy-900 accent-navy-900" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        <span className="text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/** Pill-style segmented toggle. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex rounded-xl bg-mist-100 p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === o.value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-navy-800')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
