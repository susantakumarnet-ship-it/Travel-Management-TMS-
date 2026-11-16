import { CmsPageView, cmsMetadata } from '@/components/site/CmsPage';

export const revalidate = 300;

export function generateMetadata() {
  return cmsMetadata('about', 'About Royal Ride');
}

export default function Page() {
  return <CmsPageView slug="about" />;
}
