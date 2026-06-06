import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-auth";

// Public cron endpoint — called hourly by pg_cron.
// Requires `x-cron-secret` header matching the CRON_SECRET project secret.
export const Route = createFileRoute("/api/public/cron/collect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = verifyCronSecret(request);
        if (unauthorized) return unauthorized;
        const { runCollection, runRefiner } = await import("@/lib/collectors.server");
        const collected = await runCollection();
        const refined = await runRefiner(20);
        return Response.json({
          ok: true,
          ts: new Date().toISOString(),
          collected,
          refined,
        });
      },
      GET: async () => {
        return Response.json({ ok: true, hint: "POST with x-cron-secret to run" });
      },
    },
  },
});
