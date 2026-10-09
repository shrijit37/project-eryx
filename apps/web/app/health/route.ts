// Uniform fleet health contract: exactly GET /health ->
// { status, service, version, checks }. The web frontend has no database of
// its own; its critical dependency is eryx-api, so api reachability is the
// check. Unauthenticated by design (outside any auth layout).
export async function GET() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  let api: 'up' | 'down' | 'disabled' = 'disabled';
  if (apiBase) {
    try {
      const r = await fetch(`${apiBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await r.json().catch(() => null);
      api = body?.status === 'ok' || body?.status === 'degraded' ? 'up' : 'down';
    } catch {
      api = 'down';
    }
  }
  const status = api === 'down' ? 'degraded' : 'ok';
  return Response.json(
    {
      status,
      service: 'eryx-web',
      version: process.env.APP_VERSION ?? 'unknown',
      checks: { api },
    },
    { status: 200 },
  );
}
