import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { fmtDateTime, inr, PURPOSE_LABEL } from '@/lib/format';
import { StatusBadge } from '@/components/ui/Display';
import { VehicleImage } from '@/components/ui/CarArt';
import type { BookingListItem } from './siteTypes';

export function BookingCard({ b }: { b: BookingListItem }) {
  const closed = ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'].includes(b.status);
  const due = closed ? 0 : Math.max(0, Math.round(((b.finalAmount ?? b.totalAmount) - b.paidAmount) * 100) / 100);
  return (
    <Link href={`/account/bookings/${b.id}`} className="group card flex flex-col overflow-hidden transition hover:shadow-lift sm:flex-row">
      <VehicleImage src={b.vehicle.images[0]?.url} alt={b.vehicle.title} categorySlug={b.vehicle.category.slug} seats={b.vehicle.seats} className="aspect-[16/9] w-full sm:aspect-auto sm:w-48" />
      <div className="flex flex-1 flex-col gap-2 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-xs text-slate-500">{b.bookingNumber}</p>
            <h3 className="font-semibold text-navy-900">{b.vehicle.title}</h3>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <CalendarDays className="h-4 w-4 shrink-0 text-gold-600" /> {fmtDateTime(b.pickupAt)} → {fmtDateTime(b.returnAt)}
        </p>
        <p className="flex items-center gap-2 truncate text-sm text-slate-600">
          <MapPin className="h-4 w-4 shrink-0 text-gold-600" /> <span className="truncate">{b.pickupAddress}</span>
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
          <span className="text-slate-500">
            {PURPOSE_LABEL[b.purpose]} · <span className="font-semibold text-navy-900">{inr(b.totalAmount)}</span>
            {due > 0 && !['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'].includes(b.status) && <span className="ml-1 text-amber-700">({inr(due)} due)</span>}
          </span>
          <span className="flex items-center gap-1 font-semibold text-navy-600 group-hover:underline">
            {b.status === 'AWAITING_PAYMENT' ? 'Complete payment' : b.status === 'TRIP_COMPLETED' && !b.review ? 'Rate your trip' : 'View details'} <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
