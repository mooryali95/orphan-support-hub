import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ChildStanding } from "@/components/impact/ChildStanding";
import { ImpactMoment } from "@/components/impact/ImpactMoment";
import { MyImpactHero } from "@/components/impact/MyImpactHero";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { TryKindPanel, TryKindSwitch, TrySupportImpact } from "@/components/try/TryImpactKinds";
import { TryJourneyAhead } from "@/components/try/TryJourneyAhead";
import { TryShareCard } from "@/components/try/TryShareCard";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/config/brand";
import type { GivingTrack } from "@/config/giving-tracks";
import { formatMoney, formatDate } from "@/lib/format";
import { impactMoments } from "@/lib/impact-evidence";
import { myImpact } from "@/lib/my-impact";
import { copyOf, defineCopy, dirOf, useCopy, useLocale } from "@/lib/locale";
import {
  giftsAsSponsorships,
  loadGifts,
  localTryChild,
  TRY_CURRENCY,
  TRY_EVENT,
  tryChild,
  type TryGift,
} from "@/lib/try-demo";
import { tryEvidence } from "@/lib/try-evidence";
import { loadPledges, tryInKind, tryQualification, type TryPledge } from "@/lib/try-support";

/**
 * the kinds in the order the impact page shows them. Spelled here, not imported: the search
 * validation runs in the entry bundle, and must not pull the giving copy into it.
 */
const KINDS: readonly GivingTrack[] = ["monthly", "qualification", "in_kind"];

export const Route = createFileRoute("/try/impact")({
  validateSearch: (raw: Record<string, unknown>): { done?: string; kind?: GivingTrack } => ({
    ...(typeof raw["done"] === "string" ? { done: raw["done"] } : {}),
    ...(KINDS.includes(raw["kind"] as GivingTrack) ? { kind: raw["kind"] as GivingTrack } : {}),
  }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return { meta: [{ title: pageTitle(copyOf(COPY, l).pageTitle, false, l) }] };
  },
  component: TryImpact,
});

const COPY = defineCopy("routes/try.impact", {
  ar: {
    pageTitle: "أثري · جرّب المنصّة",
    celebrateTitle: (name: string) => `من اليوم، ${name} لا ينتظر وحده`,
    celebrateDedication: (name: string) => `صدقةٌ جارية عن ${name}، تقبّلها الله.`,
    celebrateText: "بدأ عطاؤك. كل شهرٍ ترى متى حُوِّل ومتى وصله بمستند، وهذه صورة أثرك الآن.",
    see: "شاهد أثرك",
    title: "أثري",
    lead: "أثر عطاءاتك في هذه التجربة، كما يراه الداعم في لوحته.",
    gifts: "عطاءاتك",
    none: "لم تبدأ عطاءً بعد في التجربة.",
    choose: "اختر طفلاً",
    monthly: "شهرية",
    oneTime: "مرّة واحدة",
    status: "الحالة: نشطة (محاكاة)",
    dedication: (name: string) => `صدقةٌ جارية عن ${name}`,
  },
  en: {
    pageTitle: "My impact · Try the platform",
    celebrateTitle: (name: string) => `From today, ${name} no longer waits alone`,
    celebrateDedication: (name: string) =>
      `Ongoing charity on behalf of ${name}. May God accept it.`,
    celebrateText:
      "Your giving has begun. Each month you will see when it was transferred and when it was delivered, with a receipt. This is your impact today.",
    see: "See your impact",
    title: "My impact",
    lead: "The impact of your gifts in this trial, as a supporter sees it on their dashboard.",
    gifts: "Your gifts",
    none: "You have not started a gift in the trial yet.",
    choose: "Choose a child",
    monthly: "Monthly",
    oneTime: "One-time",
    status: "Status: active (simulated)",
    dedication: (name: string) => `Ongoing charity on behalf of ${name}`,
  },
});

/** «أثري» التجربة: الصورة الحقيقية نفسها، مبنيّةً من عطاءات الزائر المحاكاة في متصفّحه. */
function TryImpact() {
  const { done, kind } = Route.useSearch();
  const locale = useLocale();
  const c = useCopy(COPY);
  const local = (id: string) => {
    const k = tryChild(id);
    return k ? localTryChild(k, locale) : undefined;
  };
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<TryGift[] | null>(null);
  useEffect(() => {
    const read = () => setGifts(loadGifts());
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  const [pledges, setPledges] = useState<TryPledge[] | null>(null);
  useEffect(() => {
    const read = () => setPledges(loadPledges());
    read();
    window.addEventListener(TRY_EVENT, read);
    return () => window.removeEventListener(TRY_EVENT, read);
  }, []);
  /* the kind on show: the link's, else the financial one, else the first kind the visitor has */
  const [picked, setPicked] = useState<GivingTrack | null>(kind ?? null);
  useEffect(() => {
    if (kind) setPicked(kind);
  }, [kind]);
  const doneChild = done ? local(done) : undefined;
  const doneGift = done ? gifts?.find((g) => g.childId === done) : undefined;
  /* «قدّم شهراً»: the same gifts read as they will stand `ahead` months from now (not stored) */
  const [ahead, setAhead] = useState(0);
  /* whole months as «أثري» counts them (30.44 days), plus an hour so the n-th month has fully
     passed: the hero, the milestones and the record then all say the same number */
  const then = new Date(Date.now() + ahead * 30.44 * 86_400_000 + 3_600_000);
  const impact = myImpact(giftsAsSponsorships(gifts ?? [], locale), then);
  const rows = tryEvidence(gifts ?? [], ahead, locale);
  const waited = Object.fromEntries(
    (gifts ?? []).map((x) => [x.id, tryChild(x.childId)?.waitingDays ?? 0]),
  );
  const qualification = tryQualification(pledges ?? [], then, locale);
  const inKind = tryInKind(pledges ?? [], then, locale);
  const counts: Record<GivingTrack, number> = {
    monthly: gifts?.length ?? 0,
    qualification: qualification.length,
    in_kind: inKind.length,
  };
  const tab: GivingTrack =
    picked ??
    (gifts === null || pledges === null
      ? "monthly"
      : (KINDS.find((k) => counts[k] > 0) ?? "monthly"));

  return (
    <>
      {doneChild && (
        <CelebrateOverlay
          grand
          title={c.celebrateTitle(doneChild.name)}
          text={
            <>
              {doneGift?.dedication && (
                <span className="mb-2 block font-bold text-bridge-ink">
                  {c.celebrateDedication(doneGift.dedication)}
                </span>
              )}
              {c.celebrateText}
            </>
          }
          action={c.see}
          onClose={() => void navigate({ to: "/try/impact", search: {}, replace: true })}
        />
      )}
      <h1 className="text-4xl leading-[1.3] font-bold md:text-5xl">{c.title}</h1>
      <p className="mt-3 text-base leading-8 text-muted-foreground">{c.lead}</p>

      <TryKindSwitch kinds={KINDS} value={tab} onChange={setPicked} counts={counts} />

      {tab === "monthly" ? (
        <TryKindPanel kind="monthly">
          {gifts && gifts.length > 0 && !doneChild && (
            <ImpactMoment moments={impactMoments(impact, rows)} className="mt-6" />
          )}

          <div>
            <MyImpactHero
              impact={impact}
              loading={gifts === null}
              anotherTo="/try"
              hallSearch={
                gifts?.[0]
                  ? { try: 1, child: gifts[0].childId, cadence: gifts[0].cadence }
                  : { try: 1 }
              }
            />
          </div>

          {gifts && gifts.length > 0 && (
            <>
              <ChildStanding impact={impact} waited={waited} sample className="mt-6" />
              <TryJourneyAhead
                gifts={gifts}
                impact={impact}
                rows={rows}
                ahead={ahead}
                onAhead={setAhead}
              />
            </>
          )}

          <section aria-labelledby="try-gifts" className="mt-10">
            <h2 id="try-gifts" className="text-xl font-bold">
              {c.gifts}
            </h2>
            {gifts && gifts.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center">
                <p className="text-muted-foreground">{c.none}</p>
                <Button asChild className="mt-4">
                  <Link to="/try">{c.choose}</Link>
                </Button>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {(gifts ?? []).map((g) => {
                  const kid = local(g.childId)!;
                  return (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-5 py-4"
                    >
                      <span className="font-bold">{kid.name}</span>
                      <span className="text-sm text-muted-foreground">{kid.country}</span>
                      <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
                        {g.cadence === "monthly" ? c.monthly : c.oneTime}
                      </span>
                      <span className="ms-auto font-bold tabular-nums">
                        {formatMoney(g.amount, TRY_CURRENCY, locale)}
                      </span>
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">
                        {formatDate(g.at, locale)} · {c.status}
                      </span>
                      {g.dedication && (
                        <span className="w-full text-xs font-bold text-bridge-ink">
                          {c.dedication(g.dedication)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {gifts && gifts.length > 0 && (
            <TryShareCard {...(gifts[0]?.dedication ? { dedication: gifts[0].dedication } : {})} />
          )}
        </TryKindPanel>
      ) : (
        <TrySupportImpact
          kind={tab}
          qualification={qualification}
          inKind={inKind}
          ahead={ahead}
          onAhead={setAhead}
        />
      )}
    </>
  );
}
