// Container healthcheck for the web process (no dependencies, never cached).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', service: 'web' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
