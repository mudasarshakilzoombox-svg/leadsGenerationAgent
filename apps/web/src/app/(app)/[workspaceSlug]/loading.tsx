import { PageSkeleton } from '@/components/states';

/** Skeletons matching the page layout, shown within 100 ms (PRD §9.1). */
export default function Loading() {
  return <PageSkeleton kpis />;
}
