import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  Compass,
  HandHeart,
  Landmark,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { TryPresentStart } from "@/components/try/TryPresent";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/try/TryRoles", {
  ar: {
    eyebrow: "العرض التفاعلي",
    title: "ادخل المنصّة بأيّ دور",
    lead: "كلّ دورٍ يرى واجهته هو، بالخطوات نفسها في المنصّة الحقيقية — والبيانات هنا نموذجية، والمال والانتظار محاكاة.",
    open: "ادخل",
    roles: {
      supporter: ["الكافل", "يتصفّح الأطفال، ويكفل أو يدعم مكاناً، ويرى أثره في «أثري» والقاعة."],
      org: ["الجهة الميدانية", "تُدخل ملفّ طفلٍ ومستنداته — ثم تراه ينتقل حتى أوّل تقرير."],
      admin: ["الإدارة", "لوحة البيانات: التوثيق، والتعهّدات، ومصادر التحقق، ومركز الثقة."],
      office: [
        "المكتب الميداني",
        "يراجع ملفّات الجهات، ويرسل التقارير، وينفّذ التأهيل والدعم العيني.",
      ],
      country: [
        "فريق الدولة",
        "يحسم التنبيهات والتعارضات ويرفع ملفّات دولته — بدّل بين المشرف والمدخل والمطّلع.",
      ],
      supervisor: ["المشرف", "يزور الطفل ويسجّل حاله، فتدخل الزيارة ملفّه وتقرير كافله."],
      decider: ["صاحب القرار", "صورة الشبكة: الأطفال والتغطية والتوثيق — ونشاط الجلسة كلّه."],
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
        "The data console: verification, pledges, verification sources and the trust center.",
      ],
      office: [
        "Field office",
        "Reviews organizations' files, sends reports, and delivers training and in-kind support.",
      ],
      country: [
        "Country team",
        "Settles alerts and conflicts and uploads the country's files; switch between supervisor, data entry and viewer.",
      ],
      supervisor: [
        "Supervisor",
        "Visits the child and records how they are, feeding the file and the sponsor's report.",
      ],
      decider: [
        "Decision-maker",
        "The network at a glance: children, coverage, verification, and the session's activity.",
      ],
    },
  },
});

type Role = keyof typeof ROUTES;
const ROUTES = {
  supporter: { to: "/try/support", icon: <HandHeart /> },
  org: { to: "/try/cycle", icon: <Building2 /> },
  admin: { to: "/try/admin", icon: <ShieldCheck /> },
  office: { to: "/try/office", icon: <Compass /> },
  country: { to: "/try/country", icon: <ClipboardCheck /> },
  supervisor: { to: "/try/supervisor", icon: <UserCheck /> },
  decider: { to: "/try/decider", icon: <Landmark /> },
} as const satisfies Record<string, { to: string; icon: ReactNode }>;

/** مدخل العرض التفاعلي: بطاقة لكلّ دور تفتح واجهته ببياناته النموذجية. */
export function TryRoles() {
  const t = useCopy(COPY);
  return (
    <section aria-labelledby="try-roles" id="try-roles" className="mt-12 scroll-mt-32">
      <p className="eyebrow">{t.eyebrow}</p>
      <h2 id="try-roles" className="mt-3 heading-section">
        {t.title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t.lead}</p>
        <TryPresentStart />
      </div>
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
