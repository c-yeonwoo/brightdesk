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

export async function requireAuthenticatedUser(): Promise<string> {
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

  const userId = data.claims.sub;
  if (!userId) {
    throw new Error("Unauthorized: No user id in token.");
  }

  return userId;
}
