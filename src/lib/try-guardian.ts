/**
 * نسخ مساحة ولي الأمر التجريبية. بطاقاتٌ خيالية من `TRY_CHILDREN` وحدها، بلا معرّفٍ قابل للدفع
 * ولا صورة ولا مدينة؛ والموافقات تُحفظ في ذاكرة الصفحة فلا يصل شيءٌ إلى الخادم.
 * تناديها صفحة `/try/guardian` صراحةً (sideEffects: false).
 */
import { registerDemo } from "@/lib/data-port";
import type { GuardianChild } from "@/lib/guardian.functions";
import type { Locale } from "@/lib/locale";
import { localTryChild, TRY_CHILDREN, TRY_CURRENCY } from "@/lib/try-demo";

const PROGRAM = {
  ar: {
    program: "برنامج بناء الأهلية: القراءة",
    stage: "المرحلة الثانية",
    next: "جلسة القراءة يوم الأحد",
  },
  en: {
    program: "Capability program: reading",
    stage: "Stage two",
    next: "Reading session on Sunday",
  },
};

export function registerGuardianDemos(locale: Locale = "ar") {
  const p = locale === "ar" ? PROGRAM.ar : PROGRAM.en;
  const kids = TRY_CHILDREN.slice(0, 2).map((c) => localTryChild(c, locale));
  // حالٌ في الذاكرة: الموافقة تُغيّر البطاقة في هذه الجلسة وحدها.
  const state: GuardianChild[] = kids.map((c, i) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    status: "approved",
    photo_consent: i === 0 ? "face_hidden" : "none",
    enrollment:
      i === 0 ? { program: p.program, stage: p.stage, accepted: 5, total: 12, next: p.next } : null,
    pending_consents: i === 1 ? [{ role_id: `try-role-${c.id}`, program: p.program }] : [],
  }));

  registerDemo("guardian.children", async () => state.map((c) => ({ ...c })));
  registerDemo("guardian.workspace", async () => ({
    ok: true as const,
    orphans: kids.map((c) => ({
      id: c.id,
      code: c.code,
      display_name: c.name,
      city: null,
      country: null,
      region: null,
      status: "approved",
      monthly_need: c.need,
      funded_monthly: c.funded,
      currency: TRY_CURRENCY,
      photo_consent: null,
      created_at: "2026-01-01T00:00:00Z",
    })),
  }));
  registerDemo("guardian.consent", async ({ data }: { data: { roleId: string } }) => {
    for (const c of state) {
      const had = c.pending_consents.find((x) => x.role_id === data.roleId);
      if (!had) continue;
      c.pending_consents = c.pending_consents.filter((x) => x.role_id !== data.roleId);
      c.enrollment = { program: had.program, stage: p.stage, accepted: 0, total: 12, next: p.next };
    }
    return { ok: true };
  });
  registerDemo(
    "guardian.photo",
    async ({ data }: { data: { orphanId: string; state: GuardianChild["photo_consent"] } }) => {
      const c = state.find((x) => x.id === data.orphanId);
      if (c) c.photo_consent = data.state;
      return { ok: true };
    },
  );
}
