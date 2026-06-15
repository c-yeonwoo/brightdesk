import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncUserProfile } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
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
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/my-portfolio", replace: true });
    });
  }, [navigate]);

  const ensureProfile = async (user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  }) => {
    await syncUserProfile({
      data: {
        id: user.id,
        email: user.email ?? email,
        displayName:
          displayName.trim() ||
          (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null) ||
          (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null),
        avatarUrl: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
      },
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/my-portfolio`,
            data: {
              name: displayName.trim() || undefined,
              full_name: displayName.trim() || undefined,
            },
          },
        });
        if (error) throw error;
        if (data.user) {
          await ensureProfile(data.user);
        }
        if (!data.session) {
          toast.success("가입 완료. 이메일 확인 후 로그인해 주세요.");
          setMode("signin");
          return;
        }
        toast.success("가입 완료. 포트폴리오로 이동합니다.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          await ensureProfile(data.user);
        }
      }
      navigate({ to: "/my-portfolio", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "인증 실패");
    } finally {
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
            이메일 계정으로 포트폴리오와 개인 추천을 관리합니다.
          </p>

          <div className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>가입과 동시에 사용자 프로필을 생성해 권한과 포트폴리오를 연결합니다.</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">이름</Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  placeholder="표시 이름"
                />
              </div>
            )}
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
