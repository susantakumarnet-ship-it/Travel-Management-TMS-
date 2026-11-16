import { CmsPageView, cmsMetadata } from '@/components/site/CmsPage';

export const revalidate = 300;

export function generateMetadata() {
  return cmsMetadata('cancellation-policy', 'Cancellation & Refund Policy');
}

export default function Page() {
  return <CmsPageView slug="cancellation-policy" />;
}
