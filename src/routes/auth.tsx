import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { KahataynLockup } from "@/components/brand/KahataynMark";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { useMapStats } from "@/components/map/useMapStats";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("routes/auth", {
  ar: {
    section: "الدخول والتسجيل",
    home: "الصفحة الرئيسية",
    h1: "الدخول",
    title: "أهلاً بك",
    hint: "بصمتك إن كانت على هذا الجهاز، أو رمزٌ يصلك إلى البريد أو الجوال، أو جوجل. والحساب يُنشأ عند أوّل دخول.",
    agree: "بالمتابعة أنت توافق على",
    terms: "شروط الاستخدام",
    and: " و",
    privacy: "سياسة الخصوصية",
    note: ". وهذه منصة تعالج بيانات أطفال، فاقرأهما.",
  },
  en: {
    section: "Sign in or create an account",
    home: "Home page",
    h1: "Sign in",
    title: "Welcome",
    hint: "Your passkey if it's on this device, a code sent to your email or phone, or Google. Your account is created the first time you sign in.",
    agree: "By continuing you agree to the",
    terms: "terms of use",
    and: " and ",
    privacy: "privacy policy",
    note: ". This platform handles children's data, so please read them.",
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
  const brand = brandFor(useLocale());
  const search = Route.useSearch();
  const navigate = useNavigate();
  const redirectTo = safePath(search.redirect);
  const { stats, demo } = useMapStats();
  // الخارطة خلف النافذة تفتح على الدولة التي كان فيها الزائر، إن عُرفت.
  const fromMap = /[?&]c=([A-Z]{2})/.exec(redirectTo)?.[1] ?? null;
  const [selection, setSelection] = useState<MapSelection>({ country: fromMap, region: null });

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70">
        <WorldMap
          stats={stats}
          demo={demo}
          selection={selection}
          onSelect={setSelection}
          className="h-dvh min-h-dvh"
          bare
        />
      </div>
      <main
        id="main"
        className="map-rise relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12"
      >
        <div className="rounded-3xl bg-card/95 p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_24px_48px_-12px_rgb(0_0_0/0.25)] backdrop-blur sm:p-8">
          <Link to="/" className="flex justify-center" aria-label={`${brand.name} — ${c.home}`}>
            <KahataynLockup />
          </Link>
          <h1 className="sr-only">{c.h1}</h1>
          <AuthPanel
            className="mt-6"
            title={c.title}
            hint={c.hint}
            onDone={() => navigate({ to: redirectTo })}
          />
          <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
            {c.agree}{" "}
            <Link to="/legal/terms" className="text-primary hover:underline">
              {c.terms}
            </Link>
            {c.and}
            <Link to="/legal/privacy" className="text-primary hover:underline">
              {c.privacy}
            </Link>
            {c.note}
          </p>
        </div>
      </main>
    </div>
  );
}
