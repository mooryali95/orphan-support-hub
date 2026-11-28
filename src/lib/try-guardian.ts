/**
 * الوليّ في العرض: بطاقات أطفالٍ خياليين من وحدة العرض (`TRY_CHILDREN`) بموافقاتٍ نموذجية.
 *
 * تسجّل نسخ «الوليّ» في منفذ البيانات صراحةً (`sideEffects: false` يحذف الاستيراد المجرّد)،
 * فتعمل بطاقة الوليّ الحقيقية نفسها في `/try/guardian` بلا خادم. لا معرّفَ قابلٌ للدفع هنا.
 */
import type { GuardianChild } from "@/lib/guardian.functions";
import { registerDemo } from "@/lib/data-port";
import { TRY_CHILDREN } from "@/lib/try-demo";

type Input<T> = { data: T };

const state = new Map<string, GuardianChild>();

/** طفلان خياليان: أحدهما ينتظر موافقة الالتحاق، والآخر في البرنامج. */
export function guardianChildren(): GuardianChild[] {
  if (state.size === 0) {
    TRY_CHILDREN.slice(0, 2).forEach((k, i) =>
      state.set(k.id, {
        id: k.id,
        name: k.name,
        code: k.code,
        status: "active",
        photo_consent: i === 0 ? "none" : "face_hidden",
        enrollment:
          i === 0 ? null : { program: k.stage, stage: k.stage, accepted: 3, total: 8, next: null },
        pending_consents: i === 0 ? [{ role_id: `role-${k.id}`, program: k.stage }] : [],
      }),
    );
  }
  return [...state.values()].map((c) => ({ ...c }));
}

/** يسجّل نسخ الوليّ. تناديه صفحة `/try/guardian` صراحةً. */
export function registerGuardianDemos() {
  registerDemo("guardian.children", async () => guardianChildren());
  registerDemo("guardian.consentEnrollment", async ({ data }: Input<{ roleId: string }>) => {
    for (const c of guardianChildren()) {
      if (!c.pending_consents.some((p) => p.role_id === data.roleId)) continue;
      const program = c.pending_consents[0]?.program ?? "";
      state.set(c.id, {
        ...c,
        pending_consents: [],
        enrollment: { program, stage: program, accepted: 0, total: 8, next: null },
      });
    }
    return { ok: true as const };
  });
  registerDemo(
    "guardian.photoConsent",
    async ({ data }: Input<{ orphanId: string; state: GuardianChild["photo_consent"] }>) => {
      const c = guardianChildren().find((k) => k.id === data.orphanId);
      if (c) state.set(c.id, { ...c, photo_consent: data.state });
      return { ok: true as const };
    },
  );
}
