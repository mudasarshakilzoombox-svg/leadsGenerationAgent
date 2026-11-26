import { Badge } from '@lga/ui/components/badge';
import { Button } from '@lga/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@lga/ui/components/card';
import { APP_NAME } from '@lga/shared';
import { CircleCheck, CircleX, Globe, RefreshCw, Server } from 'lucide-react';
import Link from 'next/link';
import { serverEnv } from '@/env';
import { getApiReadiness } from '@/lib/api/server';

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge variant="success">
      <CircleCheck aria-hidden /> Healthy
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleX aria-hidden /> Unavailable
    </Badge>
  );
}

/** Foundation status page. Replaced by the authenticated app shell in Phase 0 auth work. */
export default async function HomePage() {
  const api = await getApiReadiness();
  const apiOk = api.reachable && api.report.status === 'ok';

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{APP_NAME}</h1>
        <p className="text-muted-foreground">
          Platform foundation. Environment{' '}
          <span className="font-medium text-foreground">{serverEnv.APP_ENV}</span>, release{' '}
          <span className="font-mono text-sm text-foreground">{serverEnv.RELEASE}</span>.
        </p>
      </header>

      <section aria-labelledby="services-heading" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <h2 id="services-heading" className="sr-only">
          Service status
        </h2>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" aria-hidden /> Web
            </CardTitle>
            <CardDescription>Next.js server rendering</CardDescription>
            <CardAction>
              <StatusBadge ok />
            </CardAction>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page was rendered on the server.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" aria-hidden /> API
            </CardTitle>
            <CardDescription>NestJS readiness</CardDescription>
            <CardAction>
              <StatusBadge ok={apiOk} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {api.reachable ? (
              <ul className="flex flex-col gap-2 text-sm" aria-label="API dependency checks">
                {Object.entries(api.report.checks).map(([name, check]) => (
                  <li key={name} className="flex items-center justify-between gap-3">
                    <span className="capitalize">{name}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {check.detail ? (
                        <span className="truncate text-xs">{check.detail}</span>
                      ) : null}
                      <Badge variant={check.status === 'pass' ? 'secondary' : 'destructive'}>
                        {check.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                The API could not be reached. Is it running?
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <div>
        <Button asChild variant="outline">
          <Link href="/" prefetch={false}>
            <RefreshCw aria-hidden /> Refresh
          </Link>
        </Button>
      </div>
    </main>
  );
}
