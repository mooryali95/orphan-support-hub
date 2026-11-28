/**
 * نسخ مساحة الجهة الميدانية التجريبية: «ما ينتظرك» برسائل كفلاء نموذجية، وتبرّعات
 * التأهيل والعيني الموجّهة إليها. أسماء الأطفال من بطاقات التجربة الخيالية وحدها،
 * والمراجعة تُحفظ في ذاكرة الصفحة فلا يصل شيءٌ إلى الخادم.
 * تناديها صفحة `/try/org` صراحةً (sideEffects: false).
 */
import { registerDemo } from "@/lib/data-port";
import type { PendingMessage } from "@/lib/ledger.functions";
import type { Locale } from "@/lib/locale";
import type { OrgIncomingPledge } from "@/lib/org.functions";
import { localTryChild, TRY_CHILDREN, TRY_CURRENCY } from "@/lib/try-demo";

export const TRY_ORG_ID = "try-org-1";

const TEXT = {
  ar: ["كل عامٍ وأنت بخير. نفخر بك ونتابع دراستك.", "سمعنا أنك بدأت القراءة. واصل!"],
  en: [
    "Wishing you a good year. We are proud of you and follow your studies.",
    "We heard you started reading. Keep going!",
  ],
};

export function registerOrgDemos(locale: Locale = "ar") {
  const kids = TRY_CHILDREN.slice(0, 2).map((c) => localTryChild(c, locale));
  const texts = locale === "ar" ? TEXT.ar : TEXT.en;
  let messages: PendingMessage[] = kids.map((c, i) => ({
    sponsorship_id: `try-msg-${c.id}`,
    orphan_id: c.id,
    orphan: c.name,
    message: texts[i] ?? texts[0]!,
    created_at: `2026-11-0${i + 2}T09:00:00Z`,
  }));
  const pledges: OrgIncomingPledge[] = [
    {
      id: "try-org-pledge-1",
      kind: "qualification",
      target_type: "orphan",
      orphan: kids[0]?.name ?? null,
      amount: 180,
      currency: TRY_CURRENCY,
      status: "active",
      created_at: "2026-10-12T00:00:00Z",
      stage: "preparing",
    },
    {
      id: "try-org-pledge-2",
      kind: "in_kind",
      target_type: "institution",
      orphan: null,
      amount: 320,
      currency: TRY_CURRENCY,
      status: "fulfilled",
      created_at: "2026-08-03T00:00:00Z",
      stage: "delivered",
    },
  ];

  // لا تسليمات معلّقة في العرض: تأكيد الوصول يرفع مستنداً، ولا رفع من التجربة.
  registerDemo("org.inbox", async () => ({ ok: true, messages, deliveries: [] }));
  registerDemo("org.moderate", async ({ data }: { data: { sponsorshipId: string } }) => {
    messages = messages.filter((m) => m.sponsorship_id !== data.sponsorshipId);
    return { ok: true };
  });
  registerDemo("org.incomingPledges", async () => ({ ok: true, pledges }));
}
