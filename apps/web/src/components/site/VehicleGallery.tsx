'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { VehicleImage } from '@/components/ui/CarArt';

export function VehicleGallery({ images, title, categorySlug, seats }: { images: { id: string; url: string; alt: string }[]; title: string; categorySlug: string; seats: number }) {
  const [idx, setIdx] = useState(0);
  const current = images[idx];
  return (
    <div>
      <div className="overflow-hidden rounded-3xl shadow-card">
        <VehicleImage src={current?.url} alt={current?.alt ?? title} categorySlug={categorySlug} seats={seats} className="aspect-[16/10] w-full" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setIdx(i)}
              className={clsx('h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-2 transition', i === idx ? 'ring-gold-500' : 'ring-transparent opacity-70 hover:opacity-100')}
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={i === idx}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
