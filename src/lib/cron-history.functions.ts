import { createServerFn } from "@tanstack/react-start";
import { requireAdminUser } from "./auth.server";

export const listCronRunHistory = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminUser();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("cron_runs")
    .select("id,namespace,run_key,status,error_message,started_at,finished_at,request_url")
    .order("started_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const started = row.started_at ? Date.parse(row.started_at) : null;
    const finished = row.finished_at ? Date.parse(row.finished_at) : null;
    return {
      id: row.id,
      namespace: row.namespace,
      run_key: row.run_key,
      status: row.status,
      error_message: row.error_message,
      started_at: row.started_at,
      finished_at: row.finished_at,
      request_url: row.request_url,
      duration_ms: started != null && finished != null ? Math.max(0, finished - started) : null,
    };
  });
});
