import { Link } from "@tanstack/react-router";

import { InKindImpactView } from "@/components/impact/InKindImpactView";
import { KindSwitch } from "@/components/impact/KindSwitch";
import { QualificationImpactView } from "@/components/impact/QualificationImpactView";
import { TryTimeBar } from "@/components/try/TryTimeBar";
import { Button } from "@/components/ui/button";
import { useGivingCopy, type GivingTrack } from "@/config/giving-tracks";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import type { InKindImpact, QualificationImpact, SupportKind } from "@/lib/support-impact";
import { tryPledgeReaches } from "@/lib/try-reach";
import type { TryPledge } from "@/lib/try-support";

const COPY = defineCopy("components/try/TryImpactKinds", {
  ar: {
    kinds: "أثرك بحسب نوع العطاء",
    kindsLead:
      "لكل نوعٍ أثره: الكفالة المادية سجلّ مالٍ وصل، والتأهيل تطوّرٌ يُقاس، والعيني تسليمٌ موثّق.",
    fromMap: "ادعم من الخريطة",
    reachTitle: "ما يمثّله مبلغ تعهّدك",
    reachNote: "أرقامٌ نموذجية، وهي نفسها في ورقة الدعم وفي قاعة الأثر.",
    emptyKind: {
      qualification: {
        title: "لم تبدأ دعم تأهيلٍ بعد في التجربة",
        text: "ادعم من الخريطة طفلاً أو مجموعةً أو منطقةً أو دولة، ثم عُد هنا لترى التطوّر: جلساتٌ تنعقد، وسماتٌ تُقاس قبلها وبعدها.",
      },
      in_kind: {
        title: "لم تبدأ دعماً عينياً بعد في التجربة",
        text: "ادعم من الخريطة طفلاً أو مجموعةً أو منطقةً أو دولة، ثم عُد هنا لترى تعهّدك يُجهَّز ثم يُسلَّم بمستنده.",
      },
    } satisfies Record<SupportKind, { title: string; text: string }>,
    aheadHint: {
      qualification: "اضغط «قدّم شهراً» لترى الجلسات تتوالى والقياس يقع.",
      in_kind: "اضغط «قدّم شهراً» لترى المكتب يجهّز تعهّدك ثم يصل مستند تسليمه.",
    } satisfies Record<SupportKind, string>,
  },
  en: {
    kinds: "Your impact by kind of giving",
    kindsLead:
      "Each kind has its own impact: financial sponsorship is a record of money delivered, qualification is development that is measured, and in-kind giving is a documented delivery.",
    fromMap: "Support from the map",
    reachTitle: "What your pledge amount stands for",
    reachNote: "Sample figures, the same ones the support sheet and the impact hall show.",
    emptyKind: {
      qualification: {
        title: "You have not started qualification support in the trial yet",
        text: "Support a child, a group, a region or a country from the map, then come back to see the development: sessions held, and traits measured before and after.",
      },
      in_kind: {
        title: "You have not started in-kind support in the trial yet",
        text: "Support a child, a group, a region or a country from the map, then come back to see your pledge prepared, then delivered with its document.",
      },
    } satisfies Record<SupportKind, { title: string; text: string }>,
    aheadHint: {
      qualification:
        "Press “Advance a month” to see the sessions follow and the measurement take place.",
      in_kind:
        "Press “Advance a month” to see the office prepare your pledge, then its delivery document arrive.",
    } satisfies Record<SupportKind, string>,
  },
});

const ID = "impact-kind";

/** the panel that belongs to a tab of `TryKindSwitch` */
export function TryKindPanel({
  kind,
  className,
  children,
}: {
  kind: GivingTrack;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${ID}-panel-${kind}`}
      aria-labelledby={`${ID}-tab-${kind}`}
      className={className}
    >
      {children}
    </div>
  );
}

/** مبدّل الأنواع فوق «أثري» التجربة: الأسماء من مسارات العطاء نفسها، ولكلٍّ عدد عطاءاته. */
export function TryKindSwitch({
  kinds,
  value,
  onChange,
  counts,
}: {
  kinds: readonly GivingTrack[];
  value: GivingTrack;
  onChange: (kind: GivingTrack) => void;
  counts: Record<GivingTrack, number>;
}) {
  const c = useCopy(COPY);
  const giving = useGivingCopy();
  return (
    <section aria-labelledby="impact-kinds" className="mt-6">
      <h2 id="impact-kinds" className="sr-only">
        {c.kinds}
      </h2>
      <KindSwitch
        idBase={ID}
        label={c.kinds}
        value={value}
        onChange={onChange}
        tabs={kinds.map((k) => ({ key: k, label: giving.tracks[k].name, count: counts[k] }))}
      />
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{c.kindsLead}</p>
    </section>
  );
}

/**
 * لوحة التأهيل أو العيني في «أثري» التجربة: المنظر المشترك بنماذج التجربة وشريط «قدّم شهراً»،
 * أو دعوةٌ إلى الخريطة حين لا تعهّد من هذا النوع.
 */
export function TrySupportImpact({
  kind,
  qualification,
  inKind,
  pledges,
  ahead,
  onAhead,
}: {
  kind: SupportKind;
  qualification: QualificationImpact[];
  inKind: InKindImpact[];
  /** the recorded pledges themselves: their reach is worded by `@/lib/try-reach`, as elsewhere */
  pledges: TryPledge[];
  ahead: number;
  onAhead: (n: number) => void;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const count = kind === "qualification" ? qualification.length : inKind.length;
  // the same function the support sheet and the hall call for the same pledge
  const reaches = tryPledgeReaches(pledges, kind, locale);
  return (
    <TryKindPanel kind={kind} className="mt-6">
      {count === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-display text-xl font-bold">{c.emptyKind[kind].title}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            {c.emptyKind[kind].text}
          </p>
          <Button asChild className="mt-4">
            <Link to="/try/support" search={{ kind }}>
              {c.fromMap}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {kind === "qualification" ? (
            <QualificationImpactView sample items={qualification}>
              <TryTimeBar ahead={ahead} onAhead={onAhead} hint={c.aheadHint.qualification} />
            </QualificationImpactView>
          ) : (
            <InKindImpactView sample items={inKind}>
              <TryTimeBar ahead={ahead} onAhead={onAhead} hint={c.aheadHint.in_kind} />
            </InKindImpactView>
          )}
          {reaches.length > 0 && (
            <section aria-labelledby="try-impact-reach" className="mt-6" data-try-impact-reach>
              <h3 id="try-impact-reach" className="text-base font-bold">
                {c.reachTitle}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.reachNote}</p>
              <ul className="mt-3 space-y-2">
                {reaches.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs leading-5"
                    data-try-reach
                  >
                    <b className="block text-sm text-foreground">{r.head}</b>
                    <span className="text-muted-foreground">{r.line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link to="/try/support" search={{ kind }}>
                {c.fromMap}
              </Link>
            </Button>
          </div>
        </>
      )}
    </TryKindPanel>
  );
}
