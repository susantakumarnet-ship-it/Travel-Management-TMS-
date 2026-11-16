import { CmsPageView, cmsMetadata } from '@/components/site/CmsPage';

export const revalidate = 300;

export function generateMetadata() {
  return cmsMetadata('privacy', 'Privacy Policy');
}

export default function Page() {
  return <CmsPageView slug="privacy" />;
}
