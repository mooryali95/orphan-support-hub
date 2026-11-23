import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/config/brand";

/**
 * بوابة المصادقة الثنائية للإدارة.
 *
 * البريد وحده لا يكفي لحساب يملك المنصّة: من يخترق صندوق البريد يملك رمز
 * الدخول. لذلك تطلب الإدارة عاملاً ثانياً (تطبيق مصادقة TOTP).
 *
 * هذه البوابة تجربة استخدام؛ الحارس الحقيقي في القاعدة: `is_admin()` يرفض
 * جلسة aal1 لأي مدير فعّل عاملاً موثّقاً (هجرة admin_mfa).
 */
type State =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

export function AdminMfaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return setState({ kind: "error", message: error.message });
    if (aal.currentLevel === "aal2") return setState({ kind: "ok" });

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp.find(
      (f: { id: string; status: string }) => f.status === "verified",
    );
    if (verified) return setState({ kind: "verify", factorId: verified.id });

    // عوامل معلّقة من محاولة سابقة لم تكتمل: تُزال كي لا يتعطّل التسجيل.
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `${BRAND.name} — الإدارة`,
    });
    if (enrollErr || !enrolled) {
      return setState({ kind: "error", message: enrollErr?.message ?? "تعذّر بدء التفعيل" });
    }
    setState({
      kind: "enroll",
      factorId: enrolled.id,
      qr: enrolled.totp.qr_code,
      secret: enrolled.totp.secret,
    });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const submit = async (factorId: string) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setErr("الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الحالي من التطبيق.");
      return;
    }
    setCode("");
    setState({ kind: "ok" });
  };

  if (state.kind === "ok") return <>{children}</>;

  return (
    <div
      dir="rtl"
      lang="ar"
      className="bg-secondary/30 flex min-h-dvh items-center justify-center p-4"
    >
      <div className="border-border bg-card w-full max-w-md rounded-3xl border p-8 shadow-sm">
        <div className="brand-rule mb-6 h-[3px] w-16 rounded-full" aria-hidden="true" />
        <div className="text-primary mb-2 flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="size-4" aria-hidden="true" />
          حماية حساب الإدارة
        </div>

        {state.kind === "loading" && (
          <div className="flex justify-center py-10">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        )}

        {state.kind === "error" && (
          <>
            <h1 className="text-xl font-bold">تعذّر التحقق</h1>
            <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
            <Button className="mt-6" onClick={() => void check()}>
              إعادة المحاولة
            </Button>
          </>
        )}

        {(state.kind === "enroll" || state.kind === "verify") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(state.factorId);
            }}
          >
            <h1 className="text-xl font-bold">
              {state.kind === "enroll" ? "فعّل المصادقة الثنائية" : "أدخل رمز التطبيق"}
            </h1>
            {state.kind === "enroll" ? (
              <>
                <p className="text-muted-foreground mt-2 text-sm leading-7">
                  لوحة الإدارة تتطلّب عاملاً ثانياً. امسح الرمز بتطبيق مصادقة (Google Authenticator
                  أو Microsoft Authenticator أو 1Password)، ثم اكتب الرمز المكوّن من ستّة أرقام.
                </p>
                <div className="mt-5 flex justify-center rounded-2xl bg-white p-4">
                  <img src={state.qr} alt="رمز QR لتفعيل المصادقة" className="size-44" />
                </div>
                <p className="text-muted-foreground mt-3 text-center text-xs">
                  أو أدخل المفتاح يدوياً:
                </p>
                <p dir="ltr" className="mt-1 text-center font-mono text-xs break-all select-all">
                  {state.secret}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm leading-7">
                افتح تطبيق المصادقة واكتب الرمز الحالي لحساب «{BRAND.name} — الإدارة».
              </p>
            )}
            <label className="mt-6 block text-sm font-medium" htmlFor="mfa-code">
              الرمز
            </label>
            <Input
              id="mfa-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-2 h-12 text-center font-mono text-2xl tracking-[0.5em]"
              autoFocus
            />
            {err && <p className="text-destructive mt-2 text-sm">{err}</p>}
            <Button type="submit" className="mt-5 h-11 w-full" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "تحقّق وادخل"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
