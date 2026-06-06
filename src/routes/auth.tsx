import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import brightdeskLogo from "@/assets/brightdesk-logo.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "로그인 · BrightDesk" },
      { name: "description", content: "BrightDesk에 로그인하여 내 포트폴리오와 추천을 확인하세요." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/my-portfolio", replace: true });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/my-portfolio` },
        });
        if (error) throw error;
        toast.success("가입 완료. 로그인되었습니다.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/my-portfolio", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "인증 실패");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/my-portfolio",
      });
      if ((result as any)?.error) throw (result as any).error;
    } catch (err: any) {
      toast.error(err?.message ?? "Google 로그인 실패");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2">
          <img src={brightdeskLogo} alt="BrightDesk" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">BrightDesk</span>
        </Link>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1">
            {mode === "signin" ? "로그인" : "회원가입"}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            내 포트폴리오·추천을 사용하려면 인증이 필요합니다.
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full mb-4"
            onClick={onGoogle}
            disabled={busy}
          >
            Google로 계속하기
          </Button>

          <div className="relative mb-4 text-center text-xs text-muted-foreground">
            <span className="bg-card px-2 relative z-10">또는</span>
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "signin" ? "로그인" : "가입하기"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>
      </div>
    </div>
  );
}
