import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { useDemo } from "@/lib/demo-mode";
import { defineCopy, useCopy } from "@/lib/locale";

/**
 * المصادقة الثنائية (TOTP) في «حسابي».
 *
 * من يحسم (مدير، مشرف دولة) يحتاج جلسة aal2: القاعدة تردّ `mfa_required` بدونها
 * (هجرة security_pass2). هنا يفعّل العامل أو يرفع جلسته إلى aal2 برمز التطبيق.
 */
export const MFA_COPY = defineCopy("account/mfa", {
  ar: {
    title: "المصادقة الثنائية",
    intro:
      "حسم التنبيهات والتعارضات وطلبات الفكّ وإدارة فريق الدولة يحتاج رمزاً من تطبيق مصادقة، إلى جانب الدخول المعتاد.",
    on: "مفعّلة، وجلستك الحالية موثّقة بها.",
    verifyIntro:
      "المصادقة مفعّلة، لكن جلستك الحالية لم تُوثَّق بها بعد. اكتب الرمز الحالي من التطبيق.",
    enrollStart: "تفعيل المصادقة الثنائية",
    enrollIntro:
      "امسح الرمز بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password)، ثم اكتب الرمز المكوّن من ستّة أرقام.",
    manual: "أو أدخل المفتاح يدوياً:",
    qrAlt: "رمز QR لتفعيل المصادقة",
    code: "الرمز",
    confirm: "تأكيد",
    wrong: "الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الحالي من التطبيق.",
    failed: "تعذّر بدء التفعيل. أعد المحاولة.",
    factorName: "الحاسمون",
    noticeTitle: "قراراتك تحتاج المصادقة الثنائية",
    noticeText: "لن يُقبل حسمٌ من هذه الجلسة حتى تفعّل المصادقة الثنائية أو تكتب رمزها.",
    noticeLink: "افتح المصادقة الثنائية في حسابي",
  },
  en: {
    title: "Two-step verification",
    intro:
      "Settling alerts, conflicts and unlock requests, and managing a country team, needs a code from an authenticator app as well as your usual sign-in.",
    on: "On, and your current session is verified with it.",
    verifyIntro:
      "Two-step verification is on, but this session isn't verified with it yet. Enter the current code from your app.",
    enrollStart: "Turn on two-step verification",
    enrollIntro:
      "Scan the code with an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password), then enter the six-digit code.",
    manual: "Or enter the key by hand:",
    qrAlt: "QR code to set up verification",
    code: "Code",
    confirm: "Confirm",
    wrong: "The code is wrong or expired. Try the current code from your app.",
    failed: "Setup couldn't start. Try again.",
    factorName: "approvers",
    noticeTitle: "Your decisions need two-step verification",
    noticeText:
      "Decisions from this session won't be accepted until you turn on two-step verification or enter its code.",
    noticeLink: "Open two-step verification in my account",
  },
});

type State =
  | { kind: "loading" }
  | { kind: "on" }
  | { kind: "off" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string };

/** حال الجلسة: aal2 أم لا. يُستعمل في التنبيه أعلى لوحات الحسم. */
export function useSessionAal2(): boolean | null {
  const [strong, setStrong] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (live) setStrong(data?.currentLevel === "aal2");
    });
    return () => {
      live = false;
    };
  }, []);
  return strong;
}

/** تنبيهٌ لمن يحسم بجلسةٍ دون aal2، برابطٍ إلى التفعيل. */
export function MfaRequiredNotice() {
  const c = useCopy(MFA_COPY);
  const strong = useSessionAal2();
  // التجربة بلا حساب: لا جلسة تُقوّى، والحسم فيها محاكاة، فالتنبيه ورابطه إلى الحساب طريقٌ مسدود.
  const demo = useDemo();
  if (demo || strong !== false) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div>
        <p className="font-bold">{c.noticeTitle}</p>
        <p className="text-muted-foreground mt-1">{c.noticeText}</p>
        <Link
          to="/account"
          hash="security"
          className="text-primary mt-2 inline-block font-medium underline"
        >
          {c.noticeLink}
        </Link>
      </div>
    </div>
  );
}

export function MfaSettings() {
  const c = useCopy(MFA_COPY);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return setState({ kind: "on" });
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp.find((f: { status: string }) => f.status === "verified");
    setState(verified ? { kind: "verify", factorId: verified.id } : { kind: "off" });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const enroll = async () => {
    setBusy(true);
    setErr(null);
    // عوامل معلّقة من محاولةٍ لم تكتمل تُزال كي لا يتعطّل التسجيل.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `${BRAND.name} — ${c.factorName}`,
    });
    setBusy(false);
    if (error || !data) return setErr(c.failed);
    setState({
      kind: "enroll",
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const submit = async (factorId: string) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) return setErr(c.wrong);
    setCode("");
    setState({ kind: "on" });
  };

  return (
    <section
      id="security"
      className="stagger-in scroll-mt-24 rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-8"
      aria-labelledby="mfa-h"
    >
      <h2 id="mfa-h" className="flex items-center gap-2 font-bold">
        <ShieldCheck className="text-primary size-5" aria-hidden="true" />
        {c.title}
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-7">{c.intro}</p>

      {state.kind === "loading" && (
        <Loader2 className="text-muted-foreground mt-4 size-5 animate-spin" />
      )}
      {state.kind === "on" && <p className="mt-4 text-sm font-medium">{c.on}</p>}
      {state.kind === "off" && (
        <Button className="mt-4" disabled={busy} onClick={() => void enroll()}>
          {c.enrollStart}
        </Button>
      )}
      {(state.kind === "enroll" || state.kind === "verify") && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(state.factorId);
          }}
        >
          {state.kind === "enroll" ? (
            <>
              <p className="text-muted-foreground text-sm leading-7">{c.enrollIntro}</p>
              <div className="mt-4 flex justify-center rounded-2xl bg-white p-4">
                <img src={state.qr} alt={c.qrAlt} className="size-44" />
              </div>
              <p className="text-muted-foreground mt-3 text-center text-xs">{c.manual}</p>
              <p dir="ltr" className="mt-1 text-center font-mono text-xs break-all select-all">
                {state.secret}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm leading-7">{c.verifyIntro}</p>
          )}
          <label className="mt-4 block text-sm font-medium" htmlFor="mfa-settings-code">
            {c.code}
          </label>
          <Input
            id="mfa-settings-code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="mt-1 text-center font-mono tracking-[0.4em]"
          />
          {err && <p className="text-destructive mt-2 text-sm">{err}</p>}
          <Button type="submit" className="mt-4" disabled={busy || code.length !== 6}>
            {c.confirm}
          </Button>
        </form>
      )}
      {state.kind !== "enroll" && state.kind !== "verify" && err && (
        <p className="text-destructive mt-2 text-sm">{err}</p>
      )}
    </section>
  );
}
