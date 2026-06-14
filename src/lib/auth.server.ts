import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

function getSupabasePublishableClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function adminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAuthenticatedClaims() {
  const req = getRequest();
  const authorization = req?.headers.get("authorization");
  if (!authorization) {
    throw new Error("Unauthorized: Missing Authorization header.");
  }

  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    throw new Error("Unauthorized: Only Bearer token is supported.");
  }

  const token = tokenMatch[1]?.trim();
  if (!token) {
    throw new Error("Unauthorized: Empty token.");
  }

  const supabase = getSupabasePublishableClient();
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("Unauthorized: Invalid token.");
  }

  if (!data.claims.sub) {
    throw new Error("Unauthorized: No user id in token.");
  }

  return data.claims;
}

async function ensureUserProfile(claims: Record<string, unknown>) {
  const userId = claims.sub;
  if (typeof userId !== "string" || !userId) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    typeof metadata.name === "string"
      ? metadata.name
      : typeof metadata.full_name === "string"
        ? metadata.full_name
        : null;
  const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

  await (supabaseAdmin as any)
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        email,
        display_name: displayName,
        avatar_url: avatarUrl,
      },
      { onConflict: "id" },
    );
}

export async function requireAuthenticatedUser(): Promise<string> {
  const claims = await requireAuthenticatedClaims();
  await ensureUserProfile(claims as Record<string, unknown>);
  return claims.sub as string;
}

export async function requireAdminUser(): Promise<string> {
  const claims = await requireAuthenticatedClaims();
  await ensureUserProfile(claims as Record<string, unknown>);
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  const role = typeof data?.role === "string" ? data.role : "user";

  if (role !== "admin" && (!email || !adminEmails().has(email))) {
    throw new Error("Forbidden: Admin access required.");
  }
  return claims.sub as string;
}
