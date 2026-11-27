import { ChildStanding } from "@/components/impact/ChildStanding";
import { EvidenceLedger } from "@/components/impact/EvidenceLedger";
import { ImpactMoment } from "@/components/impact/ImpactMoment";
import { useLedgers } from "@/components/sponsorship/ledger-query";
import { evidenceFromLedger, impactMoments } from "@/lib/impact-evidence";
import { defineCopy, pluralOf, useCopy } from "@/lib/locale";
import type { MyImpact } from "@/lib/my-impact";
import { deliveredShare } from "@/lib/sponsor-center";

/** the dashboard reads at most this many ledgers; the rest stay one tap away on their own page */
const MAX_LEDGERS = 6;

const COPY = defineCopy("components/impact/MyEvidence", {
  ar: {
    share: pluralOf(
      {
        zero: "لم يُؤكَّد بعد وصول شهرٍ مدفوع بمستند",
        one: "{0} من {1} من الأشهر المدفوعة أُكِّد وصوله بمستند",
        two: "{0} من {1} من الأشهر المدفوعة أُكِّد وصولهما بمستند",
        few: "{0} من {1} من الأشهر المدفوعة أُكِّد وصولها بمستند",
        many: "{0} من {1} من الأشهر المدفوعة أُكِّد وصولها بمستند",
        other: "{0} من {1} من الأشهر المدفوعة أُكِّد وصولها بمستند",
      },
      0,
      "ar",
    ),
    all: pluralOf(
      {
        one: "الشهر المدفوع أُكِّد وصوله بمستند",
        two: "الشهران المدفوعان أُكِّد وصولهما بمستند",
        few: "الأشهر المدفوعة كلّها ({0}) أُكِّد وصولها بمستند",
        many: "الأشهر المدفوعة كلّها ({0}) أُكِّد وصولها بمستند",
        other: "الأشهر المدفوعة كلّها ({0}) أُكِّد وصولها بمستند",
      },
      0,
      "ar",
    ),
  },
  en: {
    share: pluralOf({
      one: "{0} of {1} paid months confirmed delivered with a document",
      other: "{0} of {1} paid months confirmed delivered with a document",
    }),
    all: pluralOf({
      one: "The paid month was confirmed delivered with a document",
      other: "All {0} paid months confirmed delivered with a document",
    }),
  },
});

/**
 * الأثر الموثّق في لوحة الداعم: لحظة الأثر، و«بحصّتك وبدونها»، وسجلّ الأشهر من
 * `sponsorship_ledger` لكلّ كفالة عبر منفذ البيانات (`sponsor.ledger`، الباب نفسه الذي تقرؤه
 * صفحة الكفالة). إن تعذّر سجلٌّ سكت عنه؛ ولا يُقرأ من الطفل غير اسمه المعروض. والدليل بعدد
 * الأشهر («8 من 9»)، لا بنسبةٍ تُفترض.
 */
export function MyEvidence({
  impact,
  sponsorshipIds,
}: {
  impact: MyImpact;
  /** the donor's sponsorships that have started (not awaiting payment), newest first */
  sponsorshipIds: string[];
}) {
  const c = useCopy(COPY);
  const results = useLedgers(sponsorshipIds.slice(0, MAX_LEDGERS));
  const ledgers = results.flatMap((r) => (r.data?.ok && r.data.ledger ? [r.data.ledger] : []));
  const loading = results.some((r) => r.isLoading);
  const rows = ledgers.flatMap(evidenceFromLedger);
  const charge = ledgers
    .map((l) => l.sponsorship.next_charge_at)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  if (impact.children.length === 0) return null;
  const share = deliveredShare({
    paid: 0,
    months_paid: ledgers.reduce((a, l) => a + Number(l.totals.months_paid), 0),
    months_delivered: ledgers.reduce(
      (a, l) => a + Math.min(Number(l.totals.months_delivered), Number(l.totals.months_paid)),
      0,
    ),
  });
  return (
    <>
      {!loading && share.paid > 0 && (
        <p className="mt-6 text-sm leading-7 font-medium tabular-nums">
          {share.all ? c.all(share.paid) : c.share(share.delivered, share.paid)}
        </p>
      )}
      {!loading && <ImpactMoment moments={impactMoments(impact, rows)} className="mt-6" />}
      <ChildStanding impact={impact} className="mt-6" />
      {!loading && ledgers.length > 0 && (
        <EvidenceLedger
          rows={rows}
          hideReports
          next={charge ? { kind: "charge", date: charge } : null}
          className="mt-6"
        />
      )}
    </>
  );
}
