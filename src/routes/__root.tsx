import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/kb/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { PlainModeProvider } from "@/lib/plain-mode";

function NotFoundComponent() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          요청하신 페이지를 찾을 수 없습니다.
        </p>
      </div>
    </AppShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[root-error]", error);
  }, [error]);
  return (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-base font-semibold text-destructive">
          페이지 로딩 중 오류가 발생했습니다
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          다시 시도
        </button>
      </div>
    </AppShell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BrightDesk — 똑똑한 투자 인사이트 데스크" },
      {
        name: "description",
        content: "BrightDesk는 시장 시그널·모의 포트폴리오·시나리오 분석을 한곳에서 제공하는 개인 투자 인사이트 데스크입니다.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <PlainModeProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </PlainModeProvider>
    </QueryClientProvider>
  );
}
