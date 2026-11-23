import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { KahataynLockup } from "@/components/brand/KahataynMark";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { GivingOnceLine } from "@/components/auth/GivingOnceLine";
import { BrandHalo } from "@/components/brand/BrandPattern";
import { KafalaPromise } from "@/components/try/KafalaPromise";
import { TrialAuthNotice } from "@/components/try/TrialProposal";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { formatMoney, isolate } from "@/lib/format";
import { loadDraft, orphanIdOfPath, type SponsorDraft } from "@/lib/sponsor-draft";

const COPY = defineCopy("routes/auth", {
  ar: {
    section: "الدخول والتسجيل",
    home: "الصفحة الرئيسية",
    h1: "الدخول",
    title: "أهلاً بك",
    hint: "رمزٌ يصل إلى بريدك، بلا كلمة مرور. والحساب يُنشأ عند أوّل دخول.",
    agree: "بالمتابعة أنت توافق على",
    terms: "شروط الاستخدام",
    and: " و",
    privacy: "سياسة الخصوصية",
    note: ". وهذه منصة تعالج بيانات أطفال، فاقرأهما.",
    sponsoring: (name: string, amount: string) =>
      `أنت على وشك كفالة ${name} بـ${amount} شهرياً. بعد الدخول تعود إلى ملفّه بما اخترته.`,
  },
  en: {
    section: "Sign in or create an account",
    home: "Home page",
    h1: "Sign in",
    title: "Welcome",
    hint: "A code sent to your email, no password. Your account is created the first time you sign in.",
    agree: "By continuing you agree to the",
    terms: "terms of use",
    and: " and ",
    privacy: "privacy policy",
    note: ". This platform handles children's data, so please read them.",
    sponsoring: (name: string, amount: string) =>
      `You're about to sponsor ${name} with ${amount} a month. After signing in you'll return to their file with what you chose.`,
  },
});

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(COPY, l).section, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: AuthPage,
});

function safePath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function AuthPage() {
  const c = useCopy(COPY);
  const locale = useLocale();
  const brand = brandFor(locale);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const redirectTo = safePath(search.redirect);
  // القادم من نموذج الكفالة يرى لماذا هو هنا وإلى أين يعود (UX-09).
  const [draft, setDraft] = useState<SponsorDraft | null>(null);
  useEffect(() => {
    const id = orphanIdOfPath(redirectTo);
    setDraft(id ? loadDraft(id) : null);
  }, [redirectTo]);
  // القادم من الرحلة الافتراضية يرى ما ينتظره هناك: مقترحٌ يؤكّده هو، لا شيء يُنشأ عنه.
  /* من عاد إلى هذه الصفحة داخلاً (جوجل، أو رابط البريد في تبويبٍ جديد) يُكمل إلى وجهته، لا إلى
     نموذج دخولٍ ثانٍ. يُفحص مرّةً عند التركيب وحده، فلا يسبق عرضَ إضافة البصمة بعد الرمز. */
  useEffect(() => {
    let live = true;
    // التخزين المحجوب يرمي هنا: لا جلسة إذن، ويبقى نموذج الدخول ظاهراً.
    try {
      void supabase.auth.getSession().then(({ data }) => {
        if (live && data.session) void navigate({ href: redirectTo, replace: true });
      });
    } catch {
      /* no stored session to resume */
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // a formal two-panel entry: the partner's wine field with the hadith on one side, the form
    // on plain paper on the other. No map behind the form: nothing competes with signing in.
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="mural-placeholder relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        <BrandHalo className="-start-[30%] -bottom-[18%] h-[105%] text-[color:var(--bridge-bright)] opacity-20" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-4 rounded-2xl border"
          style={{ borderColor: "color-mix(in oklch, var(--bridge-bright) 30%, transparent)" }}
        />
        <Link to="/" className="relative w-fit" aria-label={`${brand.name} — ${c.home}`}>
          <KahataynLockup onDark />
        </Link>
        <div className="relative max-w-xl">
          <span
            aria-hidden="true"
            className="mb-8 block h-px w-16"
            style={{ background: "var(--bridge-bright)" }}
          />
          <KafalaPromise plate />
        </div>
        <p className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-white">
            <img
              src="/brand/partner-mark.svg"
              alt=""
              width={30}
              height={33}
              decoding="async"
              className="h-7 w-auto"
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs text-white/75">{BRAND.partner.with}</span>
            <span className="font-display text-xl font-bold">{BRAND.partner.name}</span>
          </span>
        </p>
      </aside>
      <main
        id="main"
        className="map-rise relative mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12 lg:max-w-[28rem]"
      >
        <Link
          to="/"
          className="flex justify-center lg:hidden"
          aria-label={`${brand.name} — ${c.home}`}
        >
          <KahataynLockup />
        </Link>
        <span aria-hidden="true" className="rule-champagne mx-auto mt-6 block w-32 lg:hidden" />
        <h1 className="sr-only">{c.h1}</h1>
        {draft && (
          <p className="mt-6 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-center text-sm leading-7">
            {draft.cadence === "one_time" ? (
              <GivingOnceLine
                name={isolate(draft.name)}
                amount={formatMoney(draft.amount, draft.currency, locale)}
              />
            ) : (
              c.sponsoring(isolate(draft.name), formatMoney(draft.amount, draft.currency, locale))
            )}
          </p>
        )}
        {!draft && redirectTo === "/dashboard" && <TrialAuthNotice className="mt-6 lg:mt-0" />}
        {/* the panel's own heading is small; here it is the page's welcome, in the display face */}
        <AuthPanel
          className="mt-8 lg:mt-0 [&>h2]:font-display [&>h2]:text-4xl [&>h2]:leading-[1.4] [&>h2]:font-bold [&>h2+p]:mt-3"
          title={c.title}
          hint={c.hint}
          // `href` لا `to`: الوجهة قد تحمل استعلاماً (?c=AL) فتبقى كما هي.
          onDone={() => navigate({ href: redirectTo })}
        />
        <p className="mt-8 border-t border-border pt-5 text-center text-xs leading-6 text-muted-foreground">
          {c.agree}{" "}
          <Link
            to="/legal/terms"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {c.terms}
          </Link>
          {c.and}
          <Link
            to="/legal/privacy"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {c.privacy}
          </Link>
          {c.note}
        </p>
      </main>
    </div>
  );
}
