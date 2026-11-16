import { BookingDetailView } from '@/components/site/BookingDetailView';

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <BookingDetailView id={id} paid={sp.paid === '1'} />;
}
