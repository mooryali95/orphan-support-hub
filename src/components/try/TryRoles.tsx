import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  Compass,
  HandHeart,
  Landmark,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/try/TryRoles", {
  ar: {
    eyebrow: "العرض التفاعلي",
    title: "ادخل المنصّة بأيّ دور",
    lead: "كلّ دورٍ يرى واجهته هو، بالخطوات نفسها في المنصّة الحقيقية — والبيانات هنا نموذجية، والمال والانتظار محاكاة.",
    open: "ادخل",
    roles: {
      supporter: ["الكافل", "يتصفّح الأطفال، ويكفل أو يدعم مكاناً، ويرى أثره في «أثري» والقاعة."],
      org: ["جهة الرعاية", "تُدخل ملفّ طفلٍ ومستنداته — ثم تراه ينتقل حتى أوّل تقرير."],
      admin: ["الإدارة", "لوحة البيانات: التوثيق، والاعتماد، والتعهّدات، وسجلّ الاطّلاع."],
      office: ["المكتب الميداني", "المجموعات والجلسات والتسليم والتقارير في منطقته."],
      supervisor: ["المشرف", "يسجّل جلسات التأهيل ويقيس أثرها على الأطفال."],
      decider: ["صاحب القرار", "صورة الشبكة كاملة: القرارات، والسيناريوهات، والمؤشّرات."],
    },
  },
  en: {
    eyebrow: "Interactive demo",
    title: "Enter the platform in any role",
    lead: "Each role sees its own interface, with the same steps as the real platform. The data here is sample data; money and waiting are simulated.",
    open: "Enter",
    roles: {
      supporter: [
        "Supporter",
        "Browses children, sponsors or supports a place, and sees the impact in My impact and the hall.",
      ],
      org: [
        "Care organization",
        "Enters a child's file and documents, then follows it to the first report.",
      ],
      admin: [
        "Administration",
        "The data console: verification, approval, pledges and the access log.",
      ],
      office: ["Field office", "Groups, sessions, deliveries and reports in its area."],
      supervisor: [
        "Supervisor",
        "Records qualification sessions and measures their effect on children.",
      ],
      decider: ["Decision-maker", "The whole network: decisions, scenarios and indicators."],
    },
  },
});

type Role = keyof typeof ROUTES;
const ROUTES = {
  supporter: { to: "/try/support", icon: <HandHeart /> },
  org: { to: "/try/cycle", icon: <Building2 /> },
  admin: { to: "/try/admin", icon: <ShieldCheck /> },
  office: { to: "/vision/operations", icon: <Compass /> },
  supervisor: { to: "/vision/me", icon: <UserCheck /> },
  decider: { to: "/vision/decision", icon: <Landmark /> },
} as const satisfies Record<string, { to: string; icon: ReactNode }>;

/** مدخل العرض التفاعلي: بطاقة لكلّ دور تفتح واجهته ببياناته النموذجية. */
export function TryRoles() {
  const t = useCopy(COPY);
  return (
    <section aria-labelledby="try-roles" className="mt-14">
      <p className="eyebrow">{t.eyebrow}</p>
      <h2 id="try-roles" className="mt-3 heading-section">
        {t.title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{t.lead}</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(ROUTES) as Role[]).map((role) => {
          const [name, text] = t.roles[role];
          return (
            <li key={role}>
              <Link
                to={ROUTES[role].to}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary [&>svg]:size-5"
                  aria-hidden="true"
                >
                  {ROUTES[role].icon}
                </span>
                <span className="mt-4 text-lg font-bold">{name}</span>
                <span className="mt-1 flex-1 text-sm leading-7 text-muted-foreground">{text}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary">
                  {t.open}
                  <ArrowLeft
                    className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:-scale-x-100"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
