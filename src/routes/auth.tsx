import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { KahataynLockup } from "@/components/brand/KahataynMark";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { WorldMap, type MapSelection } from "@/components/map/WorldMap";
import { useMapStats } from "@/components/map/useMapStats";
import { BRAND, pageTitle } from "@/config/brand";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: pageTitle("الدخول والتسجيل") },
      {
        name: "description",
        content: BRAND.description,
      },
      { property: "og:title", content: pageTitle("الدخول والتسجيل") },
      {
        property: "og:description",
        content: BRAND.description,
      },
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
          <Link
            to="/"
            className="flex justify-center"
            aria-label={`${BRAND.name} — الصفحة الرئيسية`}
          >
            <KahataynLockup />
          </Link>
          <h1 className="sr-only">الدخول</h1>
          <AuthPanel
            className="mt-6"
            title="أهلاً بك"
            hint="رمزٌ يصلك إلى البريد أو الجوال، أو جوجل. والحساب يُنشأ عند أوّل دخول."
            onDone={() => navigate({ to: redirectTo })}
          />
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
        </div>
      </main>
    </div>
  );
}
