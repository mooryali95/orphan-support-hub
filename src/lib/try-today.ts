/**
 * «اليوم» في العرض التفاعلي: نسخة صندوق القرارات (`today.inbox`) على بنودٍ نموذجية.
 * طوابير التحقق (`golden.alerts` / `conflicts` / `links`) تأتي من `try-verification.ts`
 * نفسها، وفيها ما رفعه الزائر بنفسه (`mine`) فيظهر تحت «ينتظر غيرك» بلا زرّ حسم.
 *
 * البنود رموزٌ مستعارة (DEMO-…) بلا اسم طفلٍ ولا معرّف دفعٍ حقيقي، ولا تصل الخادم.
 * الحسم في صندوق القرارات لا يُحاكى هنا: لوحه في المنصّة يحمل وثائق وسياقاً حقيقيَّين.
 */
import { registerDemo } from "@/lib/data-port";
import "@/lib/try-child-updates";
import type { InboxItem, InboxKind } from "@/lib/inbox.functions";
import { demoId } from "@/lib/try-verification.data";

const HOUR = 3_600_000;

const SAMPLE: Array<[InboxKind, string, string, number]> = [
  ["transfer", "DEMO-TR-0142", "120 USD · DEMO-SP-031", 60],
  ["transfer", "DEMO-TR-0157", "45 EUR · DEMO-SP-044", 6],
  ["pledge", "DEMO-PL-0019", "DEMO-ORG-07", 30],
  ["org", "DEMO-ORG-11", "DEMO", 140],
  ["progress_report", "DEMO-RP-0210", "DEMO-ORG-03", 20],
  ["money_issue", "DEMO-MI-0004", "DEMO-SP-012", 90],
];

/** صفوف الصندوق النموذجية، بأعمارٍ نسبيةٍ لـ«الآن» ليظهر المتأخّر وما لليوم. */
export function demoInbox(now: number = Date.now()): InboxItem[] {
  return SAMPLE.map(([kind, title, subtitle, hours], i) => ({
    kind,
    id: demoId(9, i + 1),
    title,
    subtitle,
    created_at: new Date(now - hours * HOUR).toISOString(),
  }));
}

/**
 * يسجّل نسخة الصندوق. نداءٌ صريح لا استيرادٌ جانبي: الحزمة `sideEffects: false`
 * فيُسقط المجمِّع استيراداً بلا قيمة.
 */
export function registerTodayDemos() {
  registerDemo("today.inbox", async () => {
    await new Promise((r) => setTimeout(r, 120));
    return demoInbox();
  });
}
registerTodayDemos();
