'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Segmented } from '@/components/ui/Field';

/** Markdown textarea with Edit / Split / Preview modes. Raw HTML is not rendered. */
export function MarkdownEditor({ value, onChange, disabled, rows = 22 }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number }) {
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
  const editor = (
    <textarea
      className="input min-h-[360px] font-mono text-[13px] leading-6"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      spellCheck
      aria-label="Markdown body"
    />
  );
  const preview = (
    <div className="prose-rr min-h-[360px] overflow-auto rounded-lg border border-mist-200 bg-white px-5 py-4">
      {value.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown> : <p className="text-sm italic text-slate-400">Nothing to preview.</p>}
    </div>
  );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Markdown — headings (##), lists, **bold**, links and tables supported.</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'split', label: 'Split' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
      </div>
      {mode === 'edit' && editor}
      {mode === 'preview' && preview}
      {mode === 'split' && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {editor}
          {preview}
        </div>
      )}
    </div>
  );
}
