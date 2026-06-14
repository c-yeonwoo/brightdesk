import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function isLocalMockEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_BRIGHTDESK_MOCK_DASHBOARD !== "false";
}

export function getAdminEmails() {
  return new Set(
    String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireClientUser() {
  if (isLocalMockEnabled()) {
    return { id: "mock-user", email: "local@brightdesk.dev" };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: "/auth" });
  }
  return data.user;
}

export async function requireClientAdmin() {
  if (isLocalMockEnabled()) {
    return { id: "mock-admin", email: "local@brightdesk.dev" };
  }

  const user = await requireClientUser();
  const email = user.email?.toLowerCase() ?? "";
  const { data } = await supabase
    .from("user_profiles" as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = typeof (data as any)?.role === "string" ? (data as any).role : "user";
  if (role !== "admin" && (!email || !getAdminEmails().has(email))) {
    throw redirect({ to: "/" });
  }
  return user;
}

export async function isCurrentUserAdmin() {
  if (isLocalMockEnabled()) return true;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!userId) return false;
  const profile = await supabase
    .from("user_profiles" as any)
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = typeof (profile.data as any)?.role === "string" ? (profile.data as any).role : "user";
  return role === "admin" || Boolean(email && getAdminEmails().has(email));
}
