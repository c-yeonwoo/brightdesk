// Shared secret check for public cron endpoints.
// Set CRON_SECRET in project secrets and pass it in the
// `x-cron-secret` header from pg_cron / external schedulers.
export function verifyCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response("CRON_SECRET not configured", { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
