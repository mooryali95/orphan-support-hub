import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PRESENT_EVENT, presenting, type TryRole } from "@/lib/try-roles";

/*
 * الأجزاء الخفيفة من الأدوار ووضع العرض، يحتاجها غلاف التجربة في كلّ صفحة. شريط العرض
 * نفسه في TryPresent.tsx ويُحمَّل حين يُفعَّل الوضع وحده، فلا يثقل الحزمة المشتركة.
 */
export const ROLE_NAME: Record<TryRole, string> = {
  supporter: "الكافل",
  org: "جهة الرعاية",
  admin: "الإدارة",
  office: "المكتب الميداني",
  supervisor: "المشرف",
  decider: "صاحب القرار",
};

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
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm">
      <span className="text-muted-foreground">تتصفّح بدور</span>
      <span className="font-bold text-foreground">{ROLE_NAME[role]}</span>
      <Link
        to="/try"
        hash="try-roles"
        className="ms-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold whitespace-nowrap text-primary hover:bg-secondary"
      >
        كلّ الأدوار
      </Link>
    </span>
  );
}
