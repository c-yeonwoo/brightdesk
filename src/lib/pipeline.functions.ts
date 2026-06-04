import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const triggerCollection = createServerFn({ method: "POST" }).handler(async () => {
  const { runCollection } = await import("./collectors.server");
  return runCollection();
});

export const triggerRefiner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { runRefiner } = await import("./collectors.server");
    return runRefiner(data.limit ?? 10);
  });

export const getPipelineStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [pending, recent, lastFacts] = await Promise.all([
    supabaseAdmin
      .from("raw_documents")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null),
    supabaseAdmin
      .from("raw_documents")
      .select("id,title,source,collected_at,processed_at,reliability")
      .order("collected_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("kb_facts")
      .select("id,title,domain,updated_at,sentiment,reliability")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  return {
    pending: pending.count ?? 0,
    recentDocs: recent.data ?? [],
    recentFacts: lastFacts.data ?? [],
  };
});
