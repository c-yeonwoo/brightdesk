import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — called hourly by pg_cron.
// No signature verification yet (Phase 1): /api/public/* is auth-bypassed
// and the only side effect is running the same logic the admin UI button runs.
export const Route = createFileRoute("/api/public/cron/collect")({
  server: {
    handlers: {
      POST: async () => {
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
        return Response.json({ ok: true, hint: "POST to run" });
      },
    },
  },
});
