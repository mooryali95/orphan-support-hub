import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { defineCopy, useCopy } from "@/lib/locale";
import { PRESENT_EVENT, presenting, type TryRole } from "@/lib/try-roles";

/*
 * الأجزاء الخفيفة من الأدوار ووضع العرض، يحتاجها غلاف التجربة في كلّ صفحة. شريط العرض
 * نفسه في TryPresent.tsx ويُحمَّل حين يُفعَّل الوضع وحده، فلا يثقل الحزمة المشتركة.
 */
export const ROLE_COPY = defineCopy("components/try/TryRoleChip", {
  ar: {
    as: "تتصفّح بدور",
    all: "كلّ الأدوار",
    role: {
      supporter: "الكافل",
      org: "الجهة الميدانية",
      admin: "الإدارة",
      office: "المكتب الميداني",
      supervisor: "المشرف",
      decider: "صاحب القرار",
    } satisfies Record<TryRole, string>,
  },
  en: {
    as: "Browsing as",
    all: "All roles",
    role: {
      supporter: "Supporter",
      org: "Field organization",
      admin: "Administration",
      office: "Field office",
      supervisor: "Supervisor",
      decider: "Decision-maker",
    } satisfies Record<TryRole, string>,
  },
});

export function usePresenting() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = () => setOn(presenting());
    r();
    window.addEventListener(PRESENT_EVENT, r);
    return () => window.removeEventListener(PRESENT_EVENT, r);
  }, []);
  // خطٌّ أكبر قليلاً على شاشة العرض: كلّ المقاسات بالـrem فتكبر معاً
  useEffect(() => {
    document.documentElement.classList.toggle("try-present", on);
    return () => document.documentElement.classList.remove("try-present");
  }, [on]);
  return on;
}

/** شارة الدور في شريط التجربة، بدل محطّات رحلة الكافل في صفحات الأدوار */
export function TryRoleChip({ role }: { role: TryRole }) {
  const t = useCopy(ROLE_COPY);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm">
      <span className="hidden text-muted-foreground sm:inline">{t.as}</span>
      <span className="truncate font-bold whitespace-nowrap text-foreground">{t.role[role]}</span>
      <Link
        to="/try"
        hash="try-roles"
        className="ms-auto hidden min-h-11 items-center gap-1 rounded-lg px-2 font-bold whitespace-nowrap text-primary hover:bg-secondary sm:inline-flex"
      >
        {t.all}
      </Link>
    </span>
  );
}
