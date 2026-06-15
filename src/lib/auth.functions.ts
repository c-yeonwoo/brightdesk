import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SyncUserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional().nullable(),
  displayName: z.string().trim().max(120).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const syncUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SyncUserProfileSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("user_profiles").upsert(
      {
        id: data.id,
        email: data.email?.toLowerCase() ?? null,
        display_name: data.displayName || null,
        avatar_url: data.avatarUrl || null,
      },
      { onConflict: "id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true };
  });
