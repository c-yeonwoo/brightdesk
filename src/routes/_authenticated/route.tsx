import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (import.meta.env.DEV && import.meta.env.VITE_BRIGHTDESK_MOCK_DASHBOARD !== "false") {
      return {
        user: {
          id: "mock-user",
          email: "local@brightdesk.dev",
        },
      };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
