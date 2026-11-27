import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ADMIN_SECTIONS, AdminSectionView } from '@/features/admin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section: slug } = await params;
  const section = ADMIN_SECTIONS.find((s) => s.slug === slug);
  return { title: section?.label ?? 'Not found' };
}

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  const section = ADMIN_SECTIONS.find((s) => s.slug === slug);
  if (!section) notFound();
  return <AdminSectionView section={section} />;
}
