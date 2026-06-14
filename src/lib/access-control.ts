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
  if (!email || !getAdminEmails().has(email)) {
    throw redirect({ to: "/" });
  }
  return user;
}

export async function isCurrentUserAdmin() {
  if (isLocalMockEnabled()) return true;
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  return Boolean(email && getAdminEmails().has(email));
}
