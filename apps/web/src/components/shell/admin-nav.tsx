'use client';

import { cn } from '@lga/ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_OVERVIEW, ADMIN_SECTIONS } from '@/features/admin';

export function AdminNav() {
  const pathname = usePathname();
  const items = [
    { ...ADMIN_OVERVIEW, href: '/admin' },
    ...ADMIN_SECTIONS.map((s) => ({ ...s, href: `/admin/${s.slug}` })),
  ];
  return (
    <nav aria-label="Platform admin" className="flex-1 space-y-0.5 px-3 py-3">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent font-medium text-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/70',
            )}
          >
            <item.icon className={cn('size-[18px]', active && 'text-brand')} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
