import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IocoLockup } from "@/components/brand/IocoMark";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "الدخول والتسجيل — IOCO" },
      {
        name: "description",
        content: "سجّل الدخول إلى منصة كافل لمتابعة كفالاتك أو إنشاء حساب كافل جديد.",
      },
      { property: "og:title", content: "الدخول والتسجيل — IOCO" },
      { property: "og:description", content: "حساب واحد لمتابعة كفالاتك وتقارير الأثر." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState(false);

  const redirectTo = safePath(search.redirect);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("أهلاً بك مجدداً");
        navigate({ to: redirectTo });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}${redirectTo}`,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("تم إنشاء الحساب");
        navigate({ to: redirectTo });
      }
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${redirectTo}`,
    });
    if (result.error) {
      toast.error("تعذّر تسجيل الدخول عبر Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: redirectTo });
  }

  return (
    <div className="surface-crossing relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <BrandPattern density="watermark" className="text-gold-line" opacity={0.16} tile={96} />
      <main
        id="main"
        className="relative w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm"
      >
        <Link to="/" className="flex justify-center" aria-label="IOCO — الصفحة الرئيسية">
          <IocoLockup />
        </Link>

        <h1 className="mt-6 text-center text-lg font-extrabold">
          {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h1>

        <div className="mt-5 flex rounded-lg border border-input p-1">
          {(
            [
              ["signin", "تسجيل الدخول"],
              ["signup", "حساب جديد"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
                mode === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="fullName">الاسم الكامل</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-2"
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2"
              minLength={6}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
          المتابعة عبر Google
        </Button>

        <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
          بالمتابعة أنت توافق على{" "}
          <Link to="/legal/terms" className="text-primary hover:underline">
            شروط الاستخدام
          </Link>{" "}
          و
          <Link to="/legal/privacy" className="text-primary hover:underline">
            سياسة الخصوصية
          </Link>
          . وهذه منصة تعالج بيانات أطفال، فاقرأهما.
        </p>
      </main>
    </div>
  );
}
