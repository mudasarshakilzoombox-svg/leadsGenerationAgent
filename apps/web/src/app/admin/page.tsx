import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { ADMIN_SECTIONS, AdminLock } from '@/features/admin';

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Operate the platform: workspaces, abuse, kill switches, credits and support access.
        </p>
      </div>
      <AdminLock />
      <div className="grid-cols-1 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ADMIN_SECTIONS.map((s) => (
          <Link key={s.slug} href={`/admin/${s.slug}`} className="group">
            <Card className="h-full gap-3 transition-shadow group-hover:shadow-md">
              <CardHeader className="flex flex-row items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <div className="space-y-1">
                  <CardTitle className="text-base">{s.label}</CardTitle>
                  <CardDescription>{s.feature}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{s.description}</p>
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  Open{' '}
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
