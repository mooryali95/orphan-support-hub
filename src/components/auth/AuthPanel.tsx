import { useEffect, useState } from "react";
import { ArrowRight, Fingerprint, Loader2, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  addPasskey,
  dismissOffer,
  listPasskeys,
  offerDismissed,
  passkeySupported,
  signInWithPasskey,
} from "@/lib/passkey";

type Method = "email" | "phone";
type Stage =
  { step: "ask" } | { step: "code"; to: string } | { step: "password" } | { step: "offer" };

/** شعار جوجل بألوانه — العلامة الوحيدة المسموح فيها بلونٍ خارج الهوية. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  );
}

/**
 * الدخول دون مغادرة ما كنت فيه — رمزٌ إلى البريد أو الجوال، أو جوجل.
 *
 * لا كلمة مرور أولاً: الرمز يصل، يُكتب في المكان نفسه، ويبقى الزائر على
 * الدولة أو المنطقة التي فتحها. وكلمة المرور باقيةٌ لمن اعتادها.
 * الحساب يُنشأ عند أوّل رمز — لا شاشة «تسجيل» منفصلة.
 */
export function AuthPanel({
  onDone,
  title = "ادخل لتكمل",
  hint,
  className,
}: {
  onDone?: () => void;
  title?: string;
  hint?: string;
  className?: string;
}) {
  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<Stage>({ step: "ask" });
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  // مهلة إعادة الإرسال: لا يُغرَق البريد ولا يُستنفد حدّ الرسائل.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeySupported()), []);

  /** بعد الدخول برمزٍ أو كلمة مرور: عرضٌ واحد لإضافة البصمة، إن لم تكن له. */
  async function finish() {
    if (passkeySupported() && !offerDismissed() && (await listPasskeys()).length === 0) {
      setStage({ step: "offer" });
      return;
    }
    onDone?.();
  }

  async function passkey() {
    setBusy(true);
    const { error } = await signInWithPasskey();
    setBusy(false);
    if (error) {
      // إلغاء المستخدم للنافذة ليس خطأً يُعلَن.
      if (!/abort|cancel|NotAllowed/i.test(String(error.message))) {
        toast.error("لم نجد بصمةً لهذا الحساب على هذا الجهاز. ادخل برمزٍ ثم أضفها.");
      }
      return;
    }
    onDone?.();
  }

  async function enrol() {
    setBusy(true);
    const { error } = await addPasskey();
    setBusy(false);
    if (error) {
      if (!/abort|cancel|NotAllowed/i.test(String(error.message))) {
        toast.error("تعذّرت إضافة البصمة. يمكنك إضافتها لاحقاً من «حسابي».");
      }
      return;
    }
    toast.success("أُضيفت بصمتك — في المرّة القادمة تدخل بلمسة.");
    onDone?.();
  }

  const here = () => (typeof window === "undefined" ? "/" : window.location.href);

  async function google() {
    setBusy(true);
    // يعود إلى الرابط نفسه — بالدولة والمنطقة المفتوحتين.
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: here() });
    setBusy(false);
    if ("error" in res && res.error) toast.error("تعذّر الدخول بجوجل. جرّب البريد.");
    else if (!("redirected" in res && res.redirected)) onDone?.();
  }

  async function send() {
    const to = value.trim();
    if (!to) return;
    setBusy(true);
    const { error } =
      method === "email"
        ? await supabase.auth.signInWithOtp({
            email: to,
            options: { shouldCreateUser: true, emailRedirectTo: here() },
          })
        : await supabase.auth.signInWithOtp({ phone: normalizePhone(to) });
    setBusy(false);
    if (error) {
      toast.error(
        method === "phone" && /provider|sms|phone/i.test(error.message)
          ? "الدخول بالجوال لم يُفعَّل بعد — استعمل البريد أو جوجل."
          : /rate|seconds/i.test(error.message)
            ? "طلبتَ رموزاً كثيرة. انتظر دقيقة ثم أعد المحاولة."
            : "تعذّر إرسال الرمز. تحقّق ممّا كتبت.",
      );
      return;
    }
    setCode("");
    setWait(45);
    setStage({ step: "code", to: method === "phone" ? normalizePhone(to) : to });
  }

  async function verify(token: string) {
    if (stage.step !== "code" || token.length < 6) return;
    setBusy(true);
    const { error } =
      method === "email"
        ? await supabase.auth.verifyOtp({ email: stage.to, token, type: "email" })
        : await supabase.auth.verifyOtp({ phone: stage.to, token, type: "sms" });
    setBusy(false);
    if (error) {
      toast.error("الرمز غير صحيح أو انتهت مدّته.");
      setCode("");
      return;
    }
    toast.success("أهلاً بك");
    await finish();
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: value.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("البريد أو كلمة المرور غير صحيحة.");
      return;
    }
    await finish();
  }

  return (
    <div className={cn("w-full", className)}>
      <h2 className="text-xl font-extrabold">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-7 text-muted-foreground">{hint}</p>}

      {stage.step === "offer" ? (
        <div key="offer" className="map-rise mt-5 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <Fingerprint className="size-8" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="mt-4 font-bold">ادخل في المرّة القادمة بلمسة</p>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            أضف بصمتك أو وجهك على هذا الجهاز. لا رمز ينتظرك، ولا كلمة مرور تُنسى — وبصمتك لا تغادر
            جهازك.
          </p>
          <Button
            size="lg"
            className="mt-5 h-11 w-full"
            disabled={busy}
            onClick={() => void enrol()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Fingerprint aria-hidden="true" />}
            أضف بصمتي
          </Button>
          <button
            type="button"
            onClick={() => {
              dismissOffer();
              onDone?.();
            }}
            className="mt-3 min-h-9 w-full text-sm text-muted-foreground hover:text-foreground"
          >
            لاحقاً
          </button>
        </div>
      ) : stage.step === "code" ? (
        <div key="code" className="map-rise mt-5">
          <p className="text-sm leading-7">
            أرسلنا رمزاً من ستّة أرقام إلى{" "}
            <bdi dir="ltr" className="font-semibold">
              {stage.to}
            </bdi>
            .
          </p>
          <div dir="ltr" className="mt-4 flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => {
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="رمز الدخول"
              disabled={busy}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStage({ step: "ask" })}
              className="inline-flex min-h-9 items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
              تغيير {method === "email" ? "البريد" : "الرقم"}
            </button>
            <button
              type="button"
              disabled={wait > 0 || busy}
              onClick={() => void send()}
              className="min-h-9 font-medium text-primary disabled:text-muted-foreground"
            >
              {wait > 0 ? (
                <>
                  إعادة الإرسال بعد <span className="tabular-nums">{wait}</span>
                </>
              ) : (
                "أعد إرسال الرمز"
              )}
            </button>
          </div>
          {busy && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> نتحقّق…
            </p>
          )}
        </div>
      ) : stage.step === "password" ? (
        <form key="password" onSubmit={withPassword} className="map-rise mt-5 space-y-3">
          <div>
            <Label htmlFor="ap-email">البريد الإلكتروني</Label>
            <Input
              id="ap-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1.5 h-11 text-base"
              required
            />
          </div>
          <div>
            <Label htmlFor="ap-pass">كلمة المرور</Label>
            <Input
              id="ap-pass"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-11 text-base"
              required
            />
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            دخول
          </Button>
          <button
            type="button"
            onClick={() => setStage({ step: "ask" })}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            الدخول برمز بدلاً من ذلك
          </button>
        </form>
      ) : (
        <div key="ask" className="mt-5">
          {canPasskey && (
            <Button
              type="button"
              size="lg"
              className="mb-2 h-11 w-full gap-3 text-base"
              disabled={busy}
              onClick={() => void passkey()}
            >
              <Fingerprint className="size-5" strokeWidth={1.5} aria-hidden="true" />
              الدخول بالبصمة
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full gap-3 bg-card text-base"
            disabled={busy}
            onClick={() => void google()}
          >
            <GoogleMark />
            المتابعة بحساب جوجل
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            أو برمزٍ يصلك
            <span className="h-px flex-1 bg-border" />
          </div>

          <div role="tablist" aria-label="طريقة الرمز" className="flex rounded-xl bg-secondary p-1">
            {(
              [
                ["email", "البريد", Mail],
                ["phone", "الجوال", Smartphone],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => {
                  setMethod(m);
                  setValue("");
                }}
                className={cn(
                  "flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                  method === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="mt-3 flex gap-2"
          >
            <Input
              key={method}
              type={method === "email" ? "email" : "tel"}
              dir="ltr"
              inputMode={method === "email" ? "email" : "tel"}
              autoComplete={method === "email" ? "email" : "tel"}
              placeholder={method === "email" ? "name@example.com" : "+355 69 123 4567"}
              aria-label={method === "email" ? "البريد الإلكتروني" : "رقم الجوال مع رمز الدولة"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11 flex-1 text-base"
              required
            />
            <Button type="submit" size="lg" className="h-11" disabled={busy || !value.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : "أرسل الرمز"}
            </Button>
          </form>
          {method === "phone" && (
            <p className="mt-2 text-xs text-muted-foreground">اكتب الرقم مع رمز الدولة (+…).</p>
          )}

          <button
            type="button"
            onClick={() => setStage({ step: "password" })}
            className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            لديك كلمة مرور؟ ادخل بها
          </button>
        </div>
      )}
    </div>
  );
}

/** «00355…» و«٠٦٩…» ومسافات ← صيغة E.164 التي يقبلها مزوّد الرسائل. */
export function normalizePhone(raw: string): string {
  const latin = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const digits = latin.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}
