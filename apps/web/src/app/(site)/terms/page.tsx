import { CmsPageView, cmsMetadata } from '@/components/site/CmsPage';

export const revalidate = 300;

export function generateMetadata() {
  return cmsMetadata('terms', 'Terms & Conditions');
}

export default function Page() {
  return <CmsPageView slug="terms" />;
}
