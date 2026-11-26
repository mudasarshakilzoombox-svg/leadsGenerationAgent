import { Button } from '@lga/ui/components/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you are looking for does not exist or you don&apos;t have access to it.
      </p>
      <Button asChild>
        <Link href="/">Go to the start page</Link>
      </Button>
    </main>
  );
}
